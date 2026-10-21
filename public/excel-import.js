(function () {
  const IMAGE_HEADERS = ["图片", "主图", "imageUrl", "image_url"];

  function isExcelFile(file) {
    return /\.(xlsx)$/i.test(String(file?.name || ""));
  }

  function decodeText(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  function inferMimeType(pathname) {
    const lower = String(pathname || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    return "";
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  const MAX_IMAGE_BYTES = 850 * 1024;
  const MAX_IMAGE_EDGE = 1600;

  function loadImageElement(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片无法解码"));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  // Excel 里嵌的原图常常超过服务器 900KB 限制，统一缩放并转成 JPEG；
  // emf/wmf/tiff/svg 等无法解码或不安全的格式直接跳过。
  async function imageBytesToDataUrl(pathname, bytes) {
    const mime = inferMimeType(pathname);
    if (!mime) return "";
    try {
      const img = await loadImageElement(new Blob([bytes], { type: mime }));
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.58, 0.45]) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob && blob.size <= MAX_IMAGE_BYTES) {
          return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
        }
      }
    } catch (_) {
      // 解码失败的图片忽略，不影响其他列导入
    }
    return "";
  }

  function xmlDocument(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Excel XML 解析失败");
    return doc;
  }

  function attr(node, name) {
    return node?.getAttribute(name) || node?.getAttribute(`r:${name}`) || "";
  }

  function localNameOf(node) {
    return String(node?.localName || node?.nodeName || "").replace(/^.*:/, "");
  }

  function findDirectChild(node, name) {
    return [...(node?.children || [])].find((child) => localNameOf(child) === name) || null;
  }

  function findDescendant(node, path) {
    const parts = String(path || "")
      .split("/")
      .map((part) => part.replace(/^.*:/, ""))
      .filter(Boolean);
    let current = node;
    for (const part of parts) {
      current = findDirectChild(current, part);
      if (!current) return null;
    }
    return current;
  }

  function childText(node, paths) {
    for (const path of paths) {
      const found = findDescendant(node, path);
      if (found?.textContent != null) return found.textContent;
    }
    return "";
  }

  function normalizeZipPath(pathname) {
    const parts = [];
    for (const part of String(pathname || "").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return parts.join("/");
  }

  function resolveZipPath(basePath, target) {
    const cleanTarget = String(target || "").replace(/\\/g, "/");
    if (!cleanTarget) return "";
    if (cleanTarget.startsWith("/")) return normalizeZipPath(cleanTarget.slice(1));
    const baseParts = String(basePath || "").split("/");
    baseParts.pop();
    return normalizeZipPath([...baseParts, cleanTarget].join("/"));
  }

  function findEndOfCentralDirectory(bytes) {
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 0x05 &&
        bytes[i + 3] === 0x06
      ) return i;
    }
    throw new Error("无法读取 Excel 压缩目录");
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器不支持读取 .xlsx（需要 iOS 16.4 以上），请更新系统或把表格另存为 CSV 再导入");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipEntries(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocdOffset = findEndOfCentralDirectory(bytes);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const entries = new Map();
    let offset = centralDirOffset;

    for (let index = 0; index < totalEntries; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel 压缩目录损坏");
      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const filename = decodeText(bytes.subarray(offset + 46, offset + 46 + fileNameLength));

      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) throw new Error("Excel 条目头损坏");
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

      let content;
      if (compressionMethod === 0) content = compressed;
      else if (compressionMethod === 8) content = await inflateRaw(compressed);
      else throw new Error(`不支持的 Excel 压缩格式: ${compressionMethod}`);

      entries.set(normalizeZipPath(filename), content);
      offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
  }

  function readEntryText(entries, pathname) {
    const bytes = entries.get(normalizeZipPath(pathname));
    return bytes ? decodeText(bytes) : "";
  }

  function parseRelationships(text, basePath) {
    if (!text) return new Map();
    const doc = xmlDocument(text);
    return new Map(
      [...doc.getElementsByTagNameNS("*", "Relationship")].map((node) => [
        attr(node, "Id"),
        {
          type: attr(node, "Type"),
          target: resolveZipPath(basePath, attr(node, "Target"))
        }
      ])
    );
  }

  // 只取 si/t 和 si/r/t；日文 Excel 会在 rPh 里自动保存假名读音，不能拼进正文
  function sharedStringValue(si) {
    if (!si) return "";
    const texts = [];
    for (const child of si.children || []) {
      const name = localNameOf(child);
      if (name === "t") texts.push(child.textContent || "");
      else if (name === "r") {
        const t = findDirectChild(child, "t");
        if (t) texts.push(t.textContent || "");
      }
    }
    return texts.join("");
  }

  function columnIndexFromRef(cellRef) {
    const match = String(cellRef || "").match(/^[A-Z]+/i);
    if (!match) return -1;
    let value = 0;
    for (const ch of match[0].toUpperCase()) value = value * 26 + (ch.charCodeAt(0) - 64);
    return value - 1;
  }

  function parseSheetRows(sheetText, sharedStrings) {
    const doc = xmlDocument(sheetText);
    const rows = [];
    for (const rowNode of doc.getElementsByTagNameNS("*", "row")) {
      const explicitIndex = Number(attr(rowNode, "r"));
      const rowIndex = Number.isFinite(explicitIndex) && explicitIndex > 0 ? explicitIndex - 1 : rows.length;
      const row = rows[rowIndex] || [];
      for (const cellNode of rowNode.getElementsByTagNameNS("*", "c")) {
        const ref = attr(cellNode, "r");
        const columnIndex = columnIndexFromRef(ref);
        if (columnIndex < 0) continue;
        const type = attr(cellNode, "t");
        const raw = childText(cellNode, ["v", "t"]);
        let value = raw;
        if (type === "s") value = sharedStrings[Number(raw)] || "";
        else if (type === "inlineStr") value = sharedStringValue(findDirectChild(cellNode, "is"));
        else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        row[columnIndex] = String(value ?? "").trim();
      }
      rows[rowIndex] = row;
    }
    return rows;
  }

  function parseSharedStrings(entries) {
    const text = readEntryText(entries, "xl/sharedStrings.xml");
    if (!text) return [];
    const doc = xmlDocument(text);
    return [...doc.getElementsByTagNameNS("*", "si")].map(sharedStringValue);
  }

  function firstSheetPath(entries) {
    const workbookText = readEntryText(entries, "xl/workbook.xml");
    if (!workbookText) throw new Error("Excel 文件缺少 workbook.xml");
    const workbookDoc = xmlDocument(workbookText);
    const workbookRels = parseRelationships(readEntryText(entries, "xl/_rels/workbook.xml.rels"), "xl/workbook.xml");
    const firstSheet = workbookDoc.getElementsByTagNameNS("*", "sheet")[0];
    if (!firstSheet) throw new Error("Excel 里没有工作表");
    const relation = workbookRels.get(attr(firstSheet, "id"));
    if (!relation?.target) throw new Error("Excel 工作表关系缺失");
    return relation.target;
  }

  function worksheetDrawingPath(entries, sheetPath) {
    const relPath = `${sheetPath.replace(/\/[^/]+$/, "")}/_rels/${sheetPath.split("/").pop()}.rels`;
    const rels = parseRelationships(readEntryText(entries, relPath), sheetPath);
    for (const relation of rels.values()) {
      if (relation.type.includes("/drawing")) return relation.target;
    }
    return "";
  }

  async function parseRowImages(entries, sheetPath) {
    const drawingPath = worksheetDrawingPath(entries, sheetPath);
    if (!drawingPath) return new Map();
    const drawingText = readEntryText(entries, drawingPath);
    if (!drawingText) return new Map();
    const drawingDoc = xmlDocument(drawingText);
    const drawingRels = parseRelationships(
      readEntryText(entries, `${drawingPath.replace(/\/[^/]+$/, "")}/_rels/${drawingPath.split("/").pop()}.rels`),
      drawingPath
    );
    const rowImages = new Map();
    const anchors = [
      ...drawingDoc.getElementsByTagNameNS("*", "twoCellAnchor"),
      ...drawingDoc.getElementsByTagNameNS("*", "oneCellAnchor")
    ];

    for (const anchor of anchors) {
      const rowNumber = Number(childText(anchor, ["from/row"]));
      const embedId = attr(anchor.getElementsByTagNameNS("*", "blip")[0], "embed");
      const relation = drawingRels.get(embedId);
      const bytes = relation?.target ? entries.get(relation.target) : null;
      if (!Number.isFinite(rowNumber) || !bytes) continue;
      const image = await imageBytesToDataUrl(relation.target, bytes);
      if (!image) continue;
      const images = rowImages.get(rowNumber) || [];
      images.push(image);
      rowImages.set(rowNumber, images);
    }

    return rowImages;
  }

  function imageColumnIndex(headerRow) {
    return (headerRow || []).findIndex((header) =>
      IMAGE_HEADERS.some((alias) => String(header || "").trim().toLowerCase() === alias.toLowerCase())
    );
  }

  function mergeImagesIntoRows(rows, rowImages) {
    if (!rows.length || !rowImages.size) return rows;
    // 稀疏数组的空洞 map 会保留，先用 Array.from 补成空行
    const nextRows = Array.from(rows, (row) => Array.isArray(row) ? Array.from(row, (cell) => cell ?? "") : []);
    const headerIndex = nextRows.findIndex((row) => row.some((cell) => String(cell || "").trim()));
    if (headerIndex < 0) return nextRows;
    const header = nextRows[headerIndex];
    let targetColumn = imageColumnIndex(header);
    if (targetColumn < 0) {
      targetColumn = header.length;
      header[targetColumn] = "图片";
    }
    for (const [rowIndex, images] of rowImages.entries()) {
      if (rowIndex <= headerIndex) continue;
      const row = nextRows[rowIndex] || [];
      const existing = String(row[targetColumn] || "").trim();
      const merged = [...(existing ? [existing] : []), ...images].filter(Boolean).join(" | ");
      row[targetColumn] = merged;
      nextRows[rowIndex] = row;
    }
    return nextRows;
  }

  function escapeDelimitedCell(value, delimiter) {
    const text = String(value ?? "");
    return /["\n\r\t,]/.test(text) || text.includes(delimiter)
      ? `"${text.replaceAll('"', '""')}"`
      : text;
  }

  function rowsToDelimitedText(rows, delimiter = "\t") {
    return rows.map((row) => (row || []).map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter)).join("\n");
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function columnName(index) {
    let value = Number(index) + 1;
    let result = "";
    while (value > 0) {
      const mod = (value - 1) % 26;
      result = String.fromCharCode(65 + mod) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function sheetXmlFromRows(rows) {
    const rowXml = (rows || []).map((row, rowIndex) => {
      const cells = (row || []).map((cell, columnIndex) => {
        const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : (crc >>> 1);
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function makeZip(entries) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
      const crc = crc32(dataBytes);

      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, dataBytes.length, true);
      lv.setUint32(22, dataBytes.length, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      local.set(dataBytes, 30 + nameBytes.length);
      locals.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, dataBytes.length, true);
      cv.setUint32(24, dataBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centrals.push(central);

      offset += local.length;
    }

    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...locals, ...centrals, end], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function workbookBlobFromRows(rows) {
    const entries = [
      {
        name: "[Content_Types].xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
      },
      {
        name: "_rels/.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
      },
      {
        name: "xl/workbook.xml",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="价格导入模板" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: sheetXmlFromRows(rows)
      }
    ];
    return makeZip(entries);
  }

  function downloadWorkbook(rows, filename) {
    const blob = workbookBlobFromRows(rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // iOS Safari 立刻回收会导致下载失败
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function readExcelAsDelimitedText(file) {
    if (!isExcelFile(file)) throw new Error("当前只支持 .xlsx 格式的 Excel 文件");
    const entries = await unzipEntries(file);
    const sheetPath = firstSheetPath(entries);
    const sharedStrings = parseSharedStrings(entries);
    const rowImages = await parseRowImages(entries, sheetPath);
    const rows = parseSheetRows(readEntryText(entries, sheetPath), sharedStrings);
    if (!rows.length) throw new Error("Excel 里没有可导入的数据");
    const merged = mergeImagesIntoRows(rows, rowImages);
    return rowsToDelimitedText(Array.from(merged, (row) => row || []), "\t");
  }

  window.readExcelAsDelimitedText = readExcelAsDelimitedText;
  window.downloadWorkbook = downloadWorkbook;
}());
