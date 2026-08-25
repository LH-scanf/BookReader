use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use percent_encoding::percent_decode_str;
use roxmltree::Document;
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::{Cursor, Read, Seek},
    path::{Component, Path, PathBuf},
    thread,
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    schema_version: u32,
    library_dir: String,
    #[serde(default)]
    device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookMetadata {
    schema_version: u32,
    id: String,
    title: String,
    author: String,
    language: Option<String>,
    description: Option<String>,
    publisher: Option<String>,
    imported_at: String,
    source_file_name: String,
    cover_file_name: Option<String>,
    #[serde(default)]
    original_cover_file_name: Option<String>,
    #[serde(default)]
    cover_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProgressFile {
    schema_version: u32,
    cfi: Option<String>,
    chapter_href: Option<String>,
    percentage: f64,
    finished: bool,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BookRecord {
    id: String,
    title: String,
    author: String,
    progress: f64,
    finished: bool,
    cover_data_url: Option<String>,
    cfi: Option<String>,
    chapter_href: Option<String>,
    imported_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryState {
    library_dir: Option<String>,
    books: Vec<BookRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProgressInput {
    book_id: String,
    cfi: Option<String>,
    chapter_href: Option<String>,
    percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationRecord {
    schema_version: u32,
    id: String,
    book_id: String,
    record_type: String,
    quote: String,
    reflection: String,
    chapter_title: String,
    chapter_href: String,
    cfi_range: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAnnotationInput {
    id: Option<String>,
    book_id: String,
    quote: String,
    reflection: String,
    chapter_title: String,
    chapter_href: String,
    cfi_range: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookNoteFile {
    schema_version: u32,
    book_id: String,
    summary: String,
    updated_at: String,
}

fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|error| format!("无法定位应用设置目录：{error}"))
}

fn load_app_settings(app: &AppHandle) -> Result<Option<AppSettings>, String> {
    let path = app_settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|error| format!("无法读取设置文件：{error}"))?;
    serde_json::from_str(&data)
        .map(Some)
        .map_err(|error| format!("设置文件格式无效：{error}"))
}

fn save_app_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = app_settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建设置目录：{error}"))?;
    }
    write_json(&path, settings).map_err(|error| format!("无法保存设置：{error}"))
}

fn configured_library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let settings = load_app_settings(app)?.ok_or_else(|| "尚未选择书库目录".to_string())?;
    Ok(PathBuf::from(settings.library_dir))
}

fn configured_device_id(app: &AppHandle) -> Result<String, String> {
    let mut settings = load_app_settings(app)?.ok_or_else(|| "尚未选择书库目录".to_string())?;
    if let Some(device_id) = settings.device_id.clone() {
        return Ok(device_id);
    }
    let device_id = Uuid::new_v4().to_string();
    settings.device_id = Some(device_id.clone());
    save_app_settings(app, &settings)?;
    Ok(device_id)
}

fn initialize_library(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path.join("books")).map_err(|error| format!("无法创建书库目录：{error}"))?;
    fs::create_dir_all(path.join("annotations"))
        .map_err(|error| format!("无法创建批注目录：{error}"))?;
    fs::create_dir_all(path.join("progress"))
        .map_err(|error| format!("无法创建进度目录：{error}"))?;
    fs::create_dir_all(path.join("notes")).map_err(|error| format!("无法创建笔记目录：{error}"))?;
    let version_path = path.join("library-version.json");
    if !version_path.exists() {
        fs::write(version_path, "{\n  \"schemaVersion\": 1\n}\n")
            .map_err(|error| format!("无法写入书库版本：{error}"))?;
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let read_and_parse = |candidate: &Path| -> Result<T, String> {
        let data = fs::read_to_string(candidate)
            .map_err(|error| format!("无法读取 {}：{error}", candidate.display()))?;
        serde_json::from_str(&data)
            .map_err(|error| format!("无法解析 {}：{error}", candidate.display()))
    };
    read_and_parse(path).or_else(|primary_error| {
        let backup = path.with_extension("bak");
        if backup.exists() {
            read_and_parse(&backup)
        } else {
            Err(primary_error)
        }
    })
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 {}：{error}", parent.display()))?;
    }
    let temporary = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    fs::write(&temporary, data)
        .map_err(|error| format!("无法写入临时文件 {}：{error}", temporary.display()))?;
    let backup = path.with_extension("bak");
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup)
            .map_err(|error| format!("无法备份 {}：{error}", path.display()))?;
    }
    match fs::rename(&temporary, path) {
        // Keep the previous valid JSON beside the new file. OneDrive or an
        // interrupted write may leave the primary file incomplete later, and
        // `read_json` can then recover from this last-known-good copy.
        Ok(()) => Ok(()),
        Err(error) => {
            if backup.exists() {
                let _ = fs::rename(&backup, path);
            }
            let _ = fs::remove_file(temporary);
            Err(format!("无法替换 {}：{error}", path.display()))
        }
    }
}

fn cover_data_url(book_dir: &Path, metadata: &BookMetadata) -> Option<String> {
    let cover_name = metadata.cover_file_name.as_ref()?;
    let cover_path = book_dir.join(cover_name);
    let data = fs::read(cover_path).ok()?;
    let mime = match Path::new(cover_name)
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };
    Some(format!("data:{mime};base64,{}", BASE64.encode(data)))
}

fn existing_epub_cover(book_dir: &Path, metadata: &BookMetadata) -> Option<String> {
    let is_valid = |name: &str| {
        !name.starts_with("custom-cover.")
            && book_dir.join(name).is_file()
            && Path::new(name)
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| {
                    matches!(
                        value.to_ascii_lowercase().as_str(),
                        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg"
                    )
                })
    };
    metadata
        .original_cover_file_name
        .clone()
        .filter(|name| is_valid(name))
        .or_else(|| {
            metadata
                .cover_file_name
                .clone()
                .filter(|name| is_valid(name))
        })
        .or_else(|| {
            let mut names: Vec<String> = fs::read_dir(book_dir)
                .ok()?
                .flatten()
                .filter_map(|entry| entry.file_name().into_string().ok())
                .filter(|name| name.starts_with("cover.") && is_valid(name))
                .collect();
            names.sort();
            names.into_iter().next()
        })
}

fn latest_progress(library_dir: &Path, book_id: &str) -> ProgressFile {
    let mut candidates = Vec::new();
    let legacy_path = library_dir
        .join("books")
        .join(book_id)
        .join("progress.json");
    if let Ok(progress) = read_json::<ProgressFile>(&legacy_path) {
        candidates.push(progress);
    }
    let progress_dir = library_dir.join("progress").join(book_id);
    if let Ok(entries) = fs::read_dir(progress_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(progress) = read_json::<ProgressFile>(&entry.path()) {
                candidates.push(progress);
            }
        }
    }
    candidates
        .into_iter()
        .max_by(|left, right| left.updated_at.cmp(&right.updated_at))
        .unwrap_or_default()
}

fn device_progress_path(library_dir: &Path, book_id: &str, device_id: &str) -> PathBuf {
    library_dir
        .join("progress")
        .join(book_id)
        .join(format!("{device_id}.json"))
}

fn book_record(library_dir: &Path, metadata: BookMetadata, progress: ProgressFile) -> BookRecord {
    let book_dir = library_dir.join("books").join(&metadata.id);
    BookRecord {
        id: metadata.id.clone(),
        title: metadata.title.clone(),
        author: metadata.author.clone(),
        progress: progress.percentage.clamp(0.0, 1.0),
        finished: progress.finished,
        cover_data_url: cover_data_url(&book_dir, &metadata),
        cfi: progress.cfi,
        chapter_href: progress.chapter_href,
        imported_at: metadata.imported_at,
    }
}

fn scan_library_dir(library_dir: &Path) -> Result<Vec<BookRecord>, String> {
    let books_dir = library_dir.join("books");
    if !books_dir.exists() {
        return Ok(Vec::new());
    }
    let mut books = Vec::new();
    for entry in fs::read_dir(&books_dir).map_err(|error| format!("无法扫描书库：{error}"))?
    {
        let Ok(entry) = entry else { continue };
        let book_dir = entry.path();
        if !book_dir.is_dir() {
            continue;
        }
        let metadata_path = book_dir.join("metadata.json");
        if !metadata_path.exists() {
            continue;
        }
        let Ok(metadata) = read_json::<BookMetadata>(&metadata_path) else {
            continue;
        };
        let progress = latest_progress(library_dir, &metadata.id);
        books.push(book_record(library_dir, metadata, progress));
    }
    books.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));
    Ok(books)
}

fn read_zip_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let mut file = archive
        .by_name(name)
        .map_err(|error| format!("EPUB 中缺少 {name}：{error}"))?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)
        .map_err(|error| format!("无法读取 EPUB 条目 {name}：{error}"))?;
    Ok(data)
}

fn normalized_archive_path(base_file: &str, relative: &str) -> String {
    let decoded = percent_decode_str(relative)
        .decode_utf8_lossy()
        .replace('\\', "/");
    let base = Path::new(base_file)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let joined = base.join(Path::new(decoded.as_str()));
    let mut parts: Vec<String> = Vec::new();
    for component in joined.components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().to_string()),
            Component::ParentDir => {
                parts.pop();
            }
            _ => {}
        }
    }
    parts.join("/")
}

fn child_text(document: &Document<'_>, name: &str) -> Option<String> {
    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == name)
        .and_then(|node| node.text())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_and_extract_epub(
    bytes: &[u8],
    source_file_name: &str,
    book_dir: &Path,
    id: &str,
) -> Result<BookMetadata, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("不是有效的 EPUB/ZIP 文件：{error}"))?;

    let container_xml = String::from_utf8(read_zip_entry(&mut archive, "META-INF/container.xml")?)
        .map_err(|_| "EPUB container.xml 不是有效 UTF-8".to_string())?;
    let container_doc = Document::parse(&container_xml)
        .map_err(|error| format!("无法解析 container.xml：{error}"))?;
    let opf_path = container_doc
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == "rootfile")
        .and_then(|node| node.attribute("full-path"))
        .ok_or_else(|| "EPUB 未声明 OPF 根文件".to_string())?
        .to_string();

    let opf_xml = String::from_utf8(read_zip_entry(&mut archive, &opf_path)?)
        .map_err(|_| "EPUB OPF 不是有效 UTF-8".to_string())?;
    let opf_doc =
        Document::parse(&opf_xml).map_err(|error| format!("无法解析 EPUB 元数据：{error}"))?;

    let title = child_text(&opf_doc, "title").unwrap_or_else(|| {
        Path::new(source_file_name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let author = child_text(&opf_doc, "creator").unwrap_or_else(|| "未知作者".to_string());
    let language = child_text(&opf_doc, "language");
    let description = child_text(&opf_doc, "description");
    let publisher = child_text(&opf_doc, "publisher");

    let legacy_cover_id = opf_doc
        .descendants()
        .find(|node| {
            node.is_element()
                && node.tag_name().name() == "meta"
                && node
                    .attribute("name")
                    .is_some_and(|value| value.eq_ignore_ascii_case("cover"))
        })
        .and_then(|node| node.attribute("content"));

    let cover_href = opf_doc
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "item")
        .find(|node| {
            node.attribute("properties")
                .is_some_and(|value| value.split_whitespace().any(|item| item == "cover-image"))
                || legacy_cover_id.is_some_and(|id_value| node.attribute("id") == Some(id_value))
        })
        .and_then(|node| node.attribute("href"));

    let cover_file_name = if let Some(href) = cover_href {
        let archive_path = normalized_archive_path(&opf_path, href);
        match read_zip_entry(&mut archive, &archive_path) {
            Ok(data) => {
                let extension = Path::new(href)
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_ascii_lowercase)
                    .filter(|value| {
                        matches!(
                            value.as_str(),
                            "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg"
                        )
                    })
                    .unwrap_or_else(|| "jpg".to_string());
                let file_name = format!("cover.{extension}");
                fs::write(book_dir.join(&file_name), data)
                    .map_err(|error| format!("无法保存封面：{error}"))?;
                Some(file_name)
            }
            Err(_) => None,
        }
    } else {
        None
    };

    Ok(BookMetadata {
        schema_version: 1,
        id: id.to_string(),
        title,
        author,
        language,
        description,
        publisher,
        imported_at: Utc::now().to_rfc3339(),
        source_file_name: source_file_name.to_string(),
        original_cover_file_name: cover_file_name.clone(),
        cover_file_name,
        cover_source: Some("epub".to_string()),
    })
}

#[tauri::command]
fn get_library_state(app: AppHandle) -> Result<LibraryState, String> {
    let Some(settings) = load_app_settings(&app)? else {
        return Ok(LibraryState {
            library_dir: None,
            books: Vec::new(),
        });
    };
    let library_dir = PathBuf::from(&settings.library_dir);
    initialize_library(&library_dir)?;
    let books = scan_library_dir(&library_dir)?;
    Ok(LibraryState {
        library_dir: Some(settings.library_dir),
        books,
    })
}

#[tauri::command]
fn set_library_directory(app: AppHandle, path: String) -> Result<LibraryState, String> {
    let library_dir = PathBuf::from(path);
    initialize_library(&library_dir)?;
    let device_id = load_app_settings(&app)?
        .and_then(|settings| settings.device_id)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    save_app_settings(
        &app,
        &AppSettings {
            schema_version: 1,
            library_dir: library_dir.to_string_lossy().to_string(),
            device_id: Some(device_id),
        },
    )?;
    let books = scan_library_dir(&library_dir)?;
    Ok(LibraryState {
        library_dir: Some(library_dir.to_string_lossy().to_string()),
        books,
    })
}

fn import_epub_blocking(app: &AppHandle, source_path: String) -> Result<BookRecord, String> {
    let source = PathBuf::from(source_path);
    if !source.is_file()
        || source
            .extension()
            .and_then(|value| value.to_str())
            .is_none_or(|value| !value.eq_ignore_ascii_case("epub"))
    {
        return Err("请选择有效的 .epub 文件".to_string());
    }
    let library_dir = configured_library_dir(&app)?;
    let device_id = configured_device_id(app)?;
    initialize_library(&library_dir)?;
    let id = Uuid::new_v4().to_string();
    let book_dir = library_dir.join("books").join(&id);
    fs::create_dir_all(&book_dir).map_err(|error| format!("无法创建图书目录：{error}"))?;

    let import_result = (|| {
        let source_file_name = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let bytes = fs::read(&source).map_err(|error| format!("无法读取 EPUB：{error}"))?;
        let metadata = parse_and_extract_epub(&bytes, &source_file_name, &book_dir, &id)?;
        fs::write(book_dir.join("book.epub"), bytes)
            .map_err(|error| format!("无法复制 EPUB：{error}"))?;
        write_json(&book_dir.join("metadata.json"), &metadata)?;
        let progress = ProgressFile {
            schema_version: 1,
            cfi: None,
            chapter_href: None,
            percentage: 0.0,
            finished: false,
            updated_at: Utc::now().to_rfc3339(),
        };
        write_json(
            &device_progress_path(&library_dir, &id, &device_id),
            &progress,
        )?;
        Ok::<_, String>((metadata, progress))
    })();

    let (metadata, progress) = match import_result {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_dir_all(&book_dir);
            return Err(error);
        }
    };

    Ok(book_record(&library_dir, metadata, progress))
}

#[tauri::command]
async fn import_epub(app: AppHandle, source_path: String) -> Result<BookRecord, String> {
    tauri::async_runtime::spawn_blocking(move || import_epub_blocking(&app, source_path))
        .await
        .map_err(|error| format!("导入任务异常终止：{error}"))?
}

fn validate_book_id(book_id: &str) -> Result<(), String> {
    Uuid::parse_str(book_id)
        .map(|_| ())
        .map_err(|_| "图书 ID 无效".to_string())
}

#[tauri::command]
fn set_book_finished(
    app: AppHandle,
    book_id: String,
    finished: bool,
) -> Result<BookRecord, String> {
    validate_book_id(&book_id)?;
    let library_dir = configured_library_dir(&app)?;
    let device_id = configured_device_id(&app)?;
    let book_dir = library_dir.join("books").join(&book_id);
    let metadata = read_json::<BookMetadata>(&book_dir.join("metadata.json"))?;
    let mut progress = latest_progress(&library_dir, &book_id);
    progress.schema_version = 1;
    progress.finished = finished;
    progress.percentage = if finished { 1.0 } else { 0.0 };
    if !finished {
        progress.cfi = None;
        progress.chapter_href = None;
    }
    progress.updated_at = Utc::now().to_rfc3339();
    write_json(
        &device_progress_path(&library_dir, &book_id, &device_id),
        &progress,
    )?;
    Ok(book_record(&library_dir, metadata, progress))
}

#[tauri::command]
fn rename_book(app: AppHandle, book_id: String, title: String) -> Result<BookRecord, String> {
    validate_book_id(&book_id)?;
    let title = title.trim();
    if title.is_empty() {
        return Err("书名不能为空".to_string());
    }
    if title.chars().count() > 300 {
        return Err("书名不能超过 300 个字符".to_string());
    }

    let library_dir = configured_library_dir(&app)?;
    let book_dir = library_dir.join("books").join(&book_id);
    let metadata_path = book_dir.join("metadata.json");
    let mut metadata = read_json::<BookMetadata>(&metadata_path)?;
    let progress = latest_progress(&library_dir, &book_id);
    metadata.title = title.to_string();
    write_json(&metadata_path, &metadata)?;

    Ok(book_record(&library_dir, metadata, progress))
}

#[tauri::command]
fn delete_book(app: AppHandle, book_id: String) -> Result<(), String> {
    validate_book_id(&book_id)?;
    let library_dir = configured_library_dir(&app)?;
    let book_dir = library_dir.join("books").join(&book_id);
    if !book_dir.exists() {
        return Err("图书不存在或已经被删除".to_string());
    }
    fs::remove_dir_all(book_dir).map_err(|error| format!("无法删除图书：{error}"))?;
    for related in ["progress", "annotations"] {
        let path = library_dir.join(related).join(&book_id);
        if path.exists() {
            fs::remove_dir_all(path)
                .map_err(|error| format!("无法删除图书{related}数据：{error}"))?;
        }
    }
    let note_path = library_dir.join("notes").join(format!("{book_id}.json"));
    if note_path.exists() {
        fs::remove_file(note_path).map_err(|error| format!("无法删除整书笔记：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn read_book_base64(app: AppHandle, book_id: String) -> Result<String, String> {
    let library_dir = configured_library_dir(&app)?;
    let path = library_dir.join("books").join(book_id).join("book.epub");
    let data = fs::read(path).map_err(|error| format!("无法读取图书：{error}"))?;
    Ok(BASE64.encode(data))
}

#[tauri::command]
fn save_progress(app: AppHandle, input: SaveProgressInput) -> Result<(), String> {
    validate_book_id(&input.book_id)?;
    let library_dir = configured_library_dir(&app)?;
    let device_id = configured_device_id(&app)?;
    let path = device_progress_path(&library_dir, &input.book_id, &device_id);
    let progress = ProgressFile {
        schema_version: 1,
        cfi: input.cfi,
        chapter_href: input.chapter_href,
        percentage: input.percentage.clamp(0.0, 1.0),
        finished: input.percentage >= 0.995,
        updated_at: Utc::now().to_rfc3339(),
    };
    write_json(&path, &progress)
}

#[tauri::command]
fn list_annotations(app: AppHandle, book_id: String) -> Result<Vec<AnnotationRecord>, String> {
    validate_book_id(&book_id)?;
    let directory = configured_library_dir(&app)?
        .join("annotations")
        .join(&book_id);
    let mut records = Vec::new();
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(record) = read_json::<AnnotationRecord>(&entry.path()) {
                if record.deleted_at.is_none() {
                    records.push(record);
                }
            }
        }
    }
    records.sort_by(|left, right| left.created_at.cmp(&right.created_at));
    Ok(records)
}

#[tauri::command]
fn save_annotation(app: AppHandle, input: SaveAnnotationInput) -> Result<AnnotationRecord, String> {
    validate_book_id(&input.book_id)?;
    if input.quote.trim().is_empty() || input.cfi_range.trim().is_empty() {
        return Err("高亮原文和位置不能为空".to_string());
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_book_id(&id)?;
    let directory = configured_library_dir(&app)?
        .join("annotations")
        .join(&input.book_id);
    let path = directory.join(format!("{id}.json"));
    let existing = read_json::<AnnotationRecord>(&path).ok();
    let now = Utc::now().to_rfc3339();
    let record = AnnotationRecord {
        schema_version: 1,
        id,
        book_id: input.book_id,
        record_type: "quote-note".to_string(),
        quote: input.quote.trim().to_string(),
        reflection: input.reflection.trim().to_string(),
        chapter_title: input.chapter_title.trim().to_string(),
        chapter_href: input.chapter_href,
        cfi_range: input.cfi_range,
        created_at: existing
            .as_ref()
            .map(|record| record.created_at.clone())
            .unwrap_or_else(|| now.clone()),
        updated_at: now,
        deleted_at: None,
    };
    write_json(&path, &record)?;
    Ok(record)
}

#[tauri::command]
fn delete_annotation(app: AppHandle, book_id: String, annotation_id: String) -> Result<(), String> {
    validate_book_id(&book_id)?;
    validate_book_id(&annotation_id)?;
    let path = configured_library_dir(&app)?
        .join("annotations")
        .join(book_id)
        .join(format!("{annotation_id}.json"));
    let mut record = read_json::<AnnotationRecord>(&path)?;
    let now = Utc::now().to_rfc3339();
    record.updated_at = now.clone();
    record.deleted_at = Some(now);
    write_json(&path, &record)
}

#[tauri::command]
fn get_book_note(app: AppHandle, book_id: String) -> Result<BookNoteFile, String> {
    validate_book_id(&book_id)?;
    let path = configured_library_dir(&app)?
        .join("notes")
        .join(format!("{book_id}.json"));
    read_json::<BookNoteFile>(&path).or_else(|_| {
        Ok(BookNoteFile {
            schema_version: 1,
            book_id,
            summary: String::new(),
            updated_at: String::new(),
        })
    })
}

#[tauri::command]
fn save_book_note(
    app: AppHandle,
    book_id: String,
    summary: String,
) -> Result<BookNoteFile, String> {
    validate_book_id(&book_id)?;
    let note = BookNoteFile {
        schema_version: 1,
        book_id: book_id.clone(),
        summary,
        updated_at: Utc::now().to_rfc3339(),
    };
    let path = configured_library_dir(&app)?
        .join("notes")
        .join(format!("{book_id}.json"));
    write_json(&path, &note)?;
    Ok(note)
}

fn save_binary(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 {}：{error}", parent.display()))?;
    }
    let temporary = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    fs::write(&temporary, data).map_err(|error| format!("无法保存图片：{error}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法替换旧封面：{error}"))?;
    }
    fs::rename(temporary, path).map_err(|error| format!("无法启用新封面：{error}"))
}

#[tauri::command]
fn set_custom_cover(
    app: AppHandle,
    book_id: String,
    source_path: String,
) -> Result<BookRecord, String> {
    validate_book_id(&book_id)?;
    let source = PathBuf::from(source_path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| matches!(value.as_str(), "jpg" | "jpeg" | "png" | "webp"))
        .ok_or_else(|| "请选择 JPG、PNG 或 WebP 图片".to_string())?;
    let data = fs::read(&source).map_err(|error| format!("无法读取封面图片：{error}"))?;
    let library_dir = configured_library_dir(&app)?;
    let book_dir = library_dir.join("books").join(&book_id);
    let metadata_path = book_dir.join("metadata.json");
    let mut metadata = read_json::<BookMetadata>(&metadata_path)?;
    if metadata.original_cover_file_name.is_none() {
        metadata.original_cover_file_name = existing_epub_cover(&book_dir, &metadata);
    }
    let file_name = format!("custom-cover.{extension}");
    save_binary(&book_dir.join(&file_name), &data)?;
    metadata.cover_file_name = Some(file_name);
    metadata.cover_source = Some("custom".to_string());
    write_json(&metadata_path, &metadata)?;
    let progress = latest_progress(&library_dir, &book_id);
    Ok(book_record(&library_dir, metadata, progress))
}

#[tauri::command]
fn restore_book_cover(app: AppHandle, book_id: String) -> Result<BookRecord, String> {
    validate_book_id(&book_id)?;
    let library_dir = configured_library_dir(&app)?;
    let book_dir = library_dir.join("books").join(&book_id);
    let metadata_path = book_dir.join("metadata.json");
    let mut metadata = read_json::<BookMetadata>(&metadata_path)?;
    let original = existing_epub_cover(&book_dir, &metadata);
    metadata.original_cover_file_name = original.clone();
    metadata.cover_file_name = original;
    metadata.cover_source = Some(if metadata.cover_file_name.is_some() {
        "epub".to_string()
    } else {
        "generated".to_string()
    });
    write_json(&metadata_path, &metadata)?;
    let progress = latest_progress(&library_dir, &book_id);
    Ok(book_record(&library_dir, metadata, progress))
}

fn fingerprint_path(path: &Path, hasher: &mut DefaultHasher) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    path.to_string_lossy().hash(hasher);
    metadata.len().hash(hasher);
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .hash(hasher);
    if metadata.is_dir() {
        let Ok(entries) = fs::read_dir(path) else {
            return;
        };
        let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        paths.sort();
        for child in paths {
            let name = child
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if name.contains(".tmp-") || name.ends_with(".bak") {
                continue;
            }
            fingerprint_path(&child, hasher);
        }
    }
}

fn library_fingerprint(app: &AppHandle) -> u64 {
    let Ok(Some(settings)) = load_app_settings(app) else {
        return 0;
    };
    let mut hasher = DefaultHasher::new();
    settings.library_dir.hash(&mut hasher);
    fingerprint_path(Path::new(&settings.library_dir), &mut hasher);
    hasher.finish()
}

fn start_library_watcher(app: AppHandle) {
    thread::spawn(move || {
        let mut previous = library_fingerprint(&app);
        loop {
            thread::sleep(Duration::from_millis(900));
            let current = library_fingerprint(&app);
            if current != 0 && current != previous {
                previous = current;
                let _ = app.emit("library-changed", ());
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            start_library_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_state,
            set_library_directory,
            import_epub,
            read_book_base64,
            save_progress,
            set_book_finished,
            rename_book,
            delete_book,
            list_annotations,
            save_annotation,
            delete_annotation,
            get_book_note,
            save_book_note,
            set_custom_cover,
            restore_book_cover
        ])
        .run(tauri::generate_context!())
        .expect("error while running BookReader");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    #[test]
    fn extracts_metadata_and_cover_from_epub() {
        let test_root = std::env::temp_dir().join(format!("bookreader-test-{}", Uuid::new_v4()));
        let book_dir = test_root.join("book");
        fs::create_dir_all(&book_dir).unwrap();
        let epub_path = test_root.join("sample.epub");

        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        writer.start_file("mimetype", stored).unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        writer
            .start_file("META-INF/container.xml", deflated)
            .unwrap();
        writer.write_all(br#"<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#).unwrap();
        writer.start_file("OEBPS/content.opf", deflated).unwrap();
        writer.write_all(r#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试图书</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh-CN</dc:language></metadata><manifest><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest><spine/></package>"#.as_bytes()).unwrap();
        writer
            .start_file("OEBPS/images/cover.png", deflated)
            .unwrap();
        writer
            .write_all(b"not-a-real-image-but-valid-test-bytes")
            .unwrap();
        let data = writer.finish().unwrap().into_inner();
        fs::write(&epub_path, data).unwrap();

        let epub_bytes = fs::read(&epub_path).unwrap();
        let metadata =
            parse_and_extract_epub(&epub_bytes, "sample.epub", &book_dir, "test-id").unwrap();
        assert_eq!(metadata.title, "测试图书");
        assert_eq!(metadata.author, "测试作者");
        assert_eq!(metadata.language.as_deref(), Some("zh-CN"));
        assert_eq!(metadata.cover_file_name.as_deref(), Some("cover.png"));
        assert!(book_dir.join("cover.png").exists());

        fs::remove_dir_all(test_root).unwrap();
    }

    #[test]
    fn reads_backup_when_primary_json_is_incomplete() {
        let test_root = std::env::temp_dir().join(format!("bookreader-json-{}", Uuid::new_v4()));
        fs::create_dir_all(&test_root).unwrap();
        let path = test_root.join("progress.json");
        let backup = path.with_extension("bak");
        let expected = ProgressFile {
            schema_version: 1,
            cfi: Some("epubcfi(/6/2)".to_string()),
            chapter_href: Some("chapter.xhtml".to_string()),
            percentage: 0.42,
            finished: false,
            updated_at: "2026-08-25T10:00:00Z".to_string(),
        };
        write_json(&path, &expected).unwrap();
        let newer = ProgressFile {
            percentage: 0.63,
            updated_at: "2026-08-25T11:00:00Z".to_string(),
            ..expected.clone()
        };
        write_json(&path, &newer).unwrap();
        assert!(backup.exists());
        fs::write(&path, "{ incomplete").unwrap();
        let recovered = read_json::<ProgressFile>(&path).unwrap();
        assert_eq!(recovered.cfi, expected.cfi);
        assert_eq!(recovered.percentage, 0.42);
        fs::remove_dir_all(test_root).unwrap();
    }

    #[test]
    fn finds_epub_cover_for_legacy_metadata() {
        let test_root = std::env::temp_dir().join(format!("bookreader-cover-{}", Uuid::new_v4()));
        fs::create_dir_all(&test_root).unwrap();
        fs::write(test_root.join("cover.jpg"), b"legacy-cover").unwrap();
        let metadata = BookMetadata {
            schema_version: 1,
            id: "legacy-book".to_string(),
            title: "旧版图书".to_string(),
            author: "作者".to_string(),
            language: None,
            description: None,
            publisher: None,
            imported_at: "2026-08-25T10:00:00Z".to_string(),
            source_file_name: "legacy.epub".to_string(),
            original_cover_file_name: None,
            cover_file_name: None,
            cover_source: None,
        };
        assert_eq!(
            existing_epub_cover(&test_root, &metadata).as_deref(),
            Some("cover.jpg")
        );
        fs::remove_dir_all(test_root).unwrap();
    }

    #[test]
    fn newest_device_progress_wins_automatically() {
        let test_root =
            std::env::temp_dir().join(format!("bookreader-progress-{}", Uuid::new_v4()));
        let book_id = Uuid::new_v4().to_string();
        initialize_library(&test_root).unwrap();
        let older = ProgressFile {
            schema_version: 1,
            percentage: 0.21,
            updated_at: "2026-08-25T08:00:00Z".to_string(),
            ..ProgressFile::default()
        };
        let newer = ProgressFile {
            schema_version: 1,
            percentage: 0.63,
            updated_at: "2026-08-25T09:00:00Z".to_string(),
            ..ProgressFile::default()
        };
        write_json(
            &device_progress_path(&test_root, &book_id, "desktop"),
            &older,
        )
        .unwrap();
        write_json(
            &device_progress_path(&test_root, &book_id, "laptop"),
            &newer,
        )
        .unwrap();
        assert_eq!(latest_progress(&test_root, &book_id).percentage, 0.63);
        fs::remove_dir_all(test_root).unwrap();
    }
}
