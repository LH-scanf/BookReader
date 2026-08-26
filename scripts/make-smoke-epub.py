"""Generate an original, deterministic EPUB for manual sync/reader acceptance."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED, ZIP_DEFLATED
import hashlib
import xml.etree.ElementTree as ET

TARGET = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "bookreader-sync-smoke.epub"
TITLE = "BookReader 同步验收 2026-08-26"
files = {
    "mimetype": "application/epub+zip",
    "META-INF/container.xml": '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
<rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
</rootfiles></container>''',
    "EPUB/package.opf": f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="zh-CN">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:90e068a9-b8ef-4f7a-9b02-4584921cb321</dc:identifier>
<dc:title>{TITLE}</dc:title><dc:creator>BookReader 测试样本</dc:creator><dc:language>zh-CN</dc:language>
<dc:description>原创测试内容，无个人资料；仅用于同步与阅读验收。</dc:description>
<meta property="dcterms:modified">2026-08-26T00:00:00Z</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>''',
    "EPUB/nav.xhtml": '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>
<li><a href="chapter1.xhtml">第一章：上传与阅读位置</a></li>
<li><a href="chapter2.xhtml">第二章：重新下载与恢复</a></li></ol></nav></body></html>''',
}
for chapter, heading in [(1, "第一章：上传与阅读位置"), (2, "第二章：重新下载与恢复")]:
    paragraphs = "\n".join(
        f'<p id="p{index}">第{chapter}章第{index:02d}段。清晨的书桌上放着一本用于验收的小书。'
        '这些文字没有个人资料，也不引用其他作品。我们翻过一页，记住这里的位置，'
        '稍后关闭阅读器，再次打开，检查是否仍停留在相同段落。'
        '云端文件与本机缓存分别保存，移除本机下载后应当能够再次取回。'
        '软删除只隐藏书目，恢复后仍可继续阅读。</p>' for index in range(1, 41)
    )
    files[f"EPUB/chapter{chapter}.xhtml"] = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN"><head><title>{heading}</title></head>
<body><h1>{heading}</h1>{paragraphs}</body></html>'''

TARGET.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(TARGET, "w") as archive:
    for name, content in files.items():
        if name != "mimetype":
            ET.fromstring(content)
        info = ZipInfo(name, date_time=(2026, 8, 26, 0, 0, 0))
        info.compress_type = ZIP_STORED if name == "mimetype" else ZIP_DEFLATED
        archive.writestr(info, content.encode("utf-8"))
with ZipFile(TARGET) as archive:
    assert archive.testzip() is None
    assert archive.infolist()[0].filename == "mimetype"
    assert archive.infolist()[0].compress_type == ZIP_STORED
print(TARGET)
print(f"bytes={TARGET.stat().st_size}; sha256={hashlib.sha256(TARGET.read_bytes()).hexdigest()}")
