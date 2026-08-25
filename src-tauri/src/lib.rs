use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use percent_encoding::percent_decode_str;
use roxmltree::Document;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Cursor, Read, Seek},
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    schema_version: u32,
    library_dir: String,
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
    let data = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| format!("无法保存设置：{error}"))
}

fn configured_library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let settings = load_app_settings(app)?.ok_or_else(|| "尚未选择书库目录".to_string())?;
    Ok(PathBuf::from(settings.library_dir))
}

fn initialize_library(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path.join("books")).map_err(|error| format!("无法创建书库目录：{error}"))?;
    fs::create_dir_all(path.join("annotations"))
        .map_err(|error| format!("无法创建批注目录：{error}"))?;
    let version_path = path.join("library-version.json");
    if !version_path.exists() {
        fs::write(version_path, "{\n  \"schemaVersion\": 1\n}\n")
            .map_err(|error| format!("无法写入书库版本：{error}"))?;
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let data = fs::read_to_string(path)
        .map_err(|error| format!("无法读取 {}：{error}", path.display()))?;
    serde_json::from_str(&data).map_err(|error| format!("无法解析 {}：{error}", path.display()))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| format!("无法写入 {}：{error}", path.display()))
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
        let progress =
            read_json::<ProgressFile>(&book_dir.join("progress.json")).unwrap_or_default();
        books.push(BookRecord {
            id: metadata.id.clone(),
            title: metadata.title.clone(),
            author: metadata.author.clone(),
            progress: progress.percentage.clamp(0.0, 1.0),
            finished: progress.finished,
            cover_data_url: cover_data_url(&book_dir, &metadata),
            cfi: progress.cfi,
            chapter_href: progress.chapter_href,
            imported_at: metadata.imported_at,
        });
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
        cover_file_name,
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
    save_app_settings(
        &app,
        &AppSettings {
            schema_version: 1,
            library_dir: library_dir.to_string_lossy().to_string(),
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
        write_json(&book_dir.join("progress.json"), &progress)?;
        Ok::<_, String>((metadata, progress))
    })();

    let (metadata, progress) = match import_result {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_dir_all(&book_dir);
            return Err(error);
        }
    };

    let extracted_cover = cover_data_url(&book_dir, &metadata);
    Ok(BookRecord {
        id: metadata.id.clone(),
        title: metadata.title,
        author: metadata.author,
        progress: progress.percentage,
        finished: progress.finished,
        cover_data_url: extracted_cover,
        cfi: None,
        chapter_href: None,
        imported_at: metadata.imported_at,
    })
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
    let book_dir = library_dir.join("books").join(&book_id);
    let metadata = read_json::<BookMetadata>(&book_dir.join("metadata.json"))?;
    let mut progress =
        read_json::<ProgressFile>(&book_dir.join("progress.json")).unwrap_or_default();
    progress.schema_version = 1;
    progress.finished = finished;
    progress.percentage = if finished { 1.0 } else { 0.0 };
    if !finished {
        progress.cfi = None;
        progress.chapter_href = None;
    }
    progress.updated_at = Utc::now().to_rfc3339();
    write_json(&book_dir.join("progress.json"), &progress)?;
    Ok(BookRecord {
        id: metadata.id.clone(),
        title: metadata.title.clone(),
        author: metadata.author.clone(),
        progress: progress.percentage,
        finished: progress.finished,
        cover_data_url: cover_data_url(&book_dir, &metadata),
        cfi: progress.cfi,
        chapter_href: progress.chapter_href,
        imported_at: metadata.imported_at,
    })
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
    let progress = read_json::<ProgressFile>(&book_dir.join("progress.json")).unwrap_or_default();
    metadata.title = title.to_string();
    write_json(&metadata_path, &metadata)?;

    Ok(BookRecord {
        id: metadata.id.clone(),
        title: metadata.title.clone(),
        author: metadata.author.clone(),
        progress: progress.percentage,
        finished: progress.finished,
        cover_data_url: cover_data_url(&book_dir, &metadata),
        cfi: progress.cfi,
        chapter_href: progress.chapter_href,
        imported_at: metadata.imported_at,
    })
}

#[tauri::command]
fn delete_book(app: AppHandle, book_id: String) -> Result<(), String> {
    validate_book_id(&book_id)?;
    let library_dir = configured_library_dir(&app)?;
    let book_dir = library_dir.join("books").join(book_id);
    if !book_dir.exists() {
        return Err("图书不存在或已经被删除".to_string());
    }
    fs::remove_dir_all(book_dir).map_err(|error| format!("无法删除图书：{error}"))
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
    let library_dir = configured_library_dir(&app)?;
    let path = library_dir
        .join("books")
        .join(&input.book_id)
        .join("progress.json");
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_library_state,
            set_library_directory,
            import_epub,
            read_book_base64,
            save_progress,
            set_book_finished,
            rename_book,
            delete_book
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
}
