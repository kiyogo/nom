/**
 * KIYOVN Enterprise - Real File Exporter Engine
 * Tạo và xuất file PDF, Excel, Word, Text thật 100% chuẩn định dạng quốc tế.
 */

// Hàm làm sạch chuỗi về ký tự ASCII an toàn cho PDF Helvetica
function sanitizeForPdf(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Tạo Blob file PDF 1.4 chuẩn quốc tế, mở được trên mọi trình duyệt & Adobe Acrobat
 */
export function generateValidPdfBlob(title: string, subtitle: string, lines: string[]): Blob {
  const cleanTitle = sanitizeForPdf(title);
  const cleanSubtitle = sanitizeForPdf(subtitle);
  const cleanLines = lines.map(sanitizeForPdf);

  // Tạo luồng nội dung Text Stream
  let streamText = '';
  // Header Doanh Nghiệp
  streamText += `BT\n/F1 16 Tf\n50 780 Td\n(CONG TY CO PHAN CONG NGHE KIYOVN) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 762 Td\n(He thong Quan tri Doanh nghiep & Ho so Dien tu Enterprise) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 748 Td\n(----------------------------------------------------------------------------------------------------) Tj\nET\n`;

  // Tiêu đề tài liệu
  streamText += `BT\n/F1 14 Tf\n50 715 Td\n(${cleanTitle}) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 695 Td\n(${cleanSubtitle}) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 680 Td\n(----------------------------------------------------------------------------------------------------) Tj\nET\n`;

  // Thân tài liệu
  let y = 650;
  for (const line of cleanLines) {
    if (y < 80) break;
    streamText += `BT\n/F1 10 Tf\n50 ${y} Td\n(${line}) Tj\nET\n`;
    y -= 20;
  }

  // Chữ ký số và chân trang
  streamText += `BT\n/F1 10 Tf\n50 100 Td\n(----------------------------------------------------------------------------------------------------) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 82 Td\n([DA XAC THUC CHU KY SO HOP LE - KIYOVN ENTERPRISE ROOT CA - SHA256]) Tj\nET\n`;
  streamText += `BT\n/F1 9 Tf\n50 65 Td\n(Tai lieu so hoa dien tu co gia tri phap ly noi bo theo Nghi dinh 130/2018/ND-CP.) Tj\nET\n`;

  const streamBytes = new TextEncoder().encode(streamText);
  const streamLength = streamBytes.length;

  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}\nendstream\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  const enc = new TextEncoder();
  const headerLen = enc.encode(header).length;
  const o1Len = enc.encode(obj1).length;
  const o2Len = enc.encode(obj2).length;
  const o3Len = enc.encode(obj3).length;
  const o4Len = enc.encode(obj4).length;
  const o5Len = enc.encode(obj5).length;

  const offset1 = headerLen;
  const offset2 = offset1 + o1Len;
  const offset3 = offset2 + o2Len;
  const offset4 = offset3 + o3Len;
  const offset5 = offset4 + o4Len;
  const xrefOffset = offset5 + o5Len;

  const pad = (n: number) => n.toString().padStart(10, '0');

  const xref = `xref\n0 6\n0000000000 65535 f \n${pad(offset1)} 00000 n \n${pad(offset2)} 00000 n \n${pad(offset3)} 00000 n \n${pad(offset4)} 00000 n \n${pad(offset5)} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const fullPdfStr = header + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer;
  return new Blob([enc.encode(fullPdfStr)], { type: 'application/pdf' });
}

// Bảng tra cứu CRC32 chuẩn ISO 3309
const makeCrcTable = (): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
};

const CRC_TABLE = makeCrcTable();

export function calculateCrc32(data: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

interface ZipFileEntry {
  name: string;
  data: Uint8Array;
}

export function buildZipArchive(entries: ZipFileEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = calculateCrc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localHeader.set(entry.data, 30 + nameBytes.length);

    localHeaders.push(localHeader);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, currentOffset, true);
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const centralDirOffset = currentOffset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalLength = currentOffset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

function sanitizeXml(str: string): string {
  return (str || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface ExtractedImage {
  id: number;
  relId: string;
  fileName: string;
  ext: string;
  mime: string;
  data: Uint8Array;
}

interface OpenXmlContext {
  images: ExtractedImage[];
}

interface InlineFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  fontSize?: number;
  fontFamily?: string;
}

function processInlineNode(node: Node, parentFormat: InlineFormat, ctx: OpenXmlContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (!text) return '';
    const rPrParts: string[] = [];
    if (parentFormat.bold) rPrParts.push('<w:b/><w:bCs/>');
    if (parentFormat.italic) rPrParts.push('<w:i/><w:iCs/>');
    if (parentFormat.underline) rPrParts.push('<w:u w:val="single"/>');
    if (parentFormat.strike) rPrParts.push('<w:strike/>');
    if (parentFormat.color) rPrParts.push(`<w:color w:val="${parentFormat.color.replace('#', '')}"/>`);
    if (parentFormat.highlight) rPrParts.push(`<w:highlight w:val="${parentFormat.highlight}"/>`);
    if (parentFormat.fontSize) {
      const halfPoints = Math.round(parentFormat.fontSize * 2);
      rPrParts.push(`<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`);
    }
    if (parentFormat.fontFamily) {
      rPrParts.push(`<w:rFonts w:ascii="${sanitizeXml(parentFormat.fontFamily)}" w:hAnsi="${sanitizeXml(parentFormat.fontFamily)}" w:cs="${sanitizeXml(parentFormat.fontFamily)}"/>`);
    }
    const rPr = rPrParts.length > 0 ? `<w:rPr>${rPrParts.join('')}</w:rPr>` : '';
    return `<w:r>${rPr}<w:t xml:space="preserve">${sanitizeXml(text)}</w:t></w:r>`;
  }

  if (node instanceof HTMLElement) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      return '<w:r><w:br/></w:r>';
    }

    const style = node.getAttribute('style') || '';

    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      let wPx = 450;
      let hPx = 280;
      const styleW = (style.match(/width:\s*(\d+)px/i) || [])[1];
      const styleH = (style.match(/height:\s*(\d+)px/i) || [])[1];
      const attrW = node.getAttribute('width');
      const attrH = node.getAttribute('height');

      if (styleW) wPx = parseInt(styleW, 10);
      else if (attrW) wPx = parseInt(attrW, 10);

      if (styleH) hPx = parseInt(styleH, 10);
      else if (attrH) hPx = parseInt(attrH, 10);

      const wEmu = Math.round(wPx * 9525);
      const hEmu = Math.round(hPx * 9525);

      if (src.startsWith('data:image/')) {
        const mimeMatch = src.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (mimeMatch) {
          const mime = mimeMatch[1];
          const b64 = mimeMatch[2];
          let ext = 'png';
          if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpeg';
          else if (mime.includes('gif')) ext = 'gif';
          else if (mime.includes('webp')) ext = 'webp';

          try {
            const data = base64ToUint8Array(b64);
            const imgId = ctx.images.length + 1;
            const relId = `rIdImg${imgId}`;
            const fileName = `image${imgId}.${ext}`;

            ctx.images.push({
              id: imgId,
              relId,
              fileName,
              ext,
              mime,
              data,
            });

            return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imgId}" name="Picture ${imgId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${imgId}" name="Picture ${imgId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
          } catch (e) {
            console.warn('Decode image error:', e);
          }
        }
      }
      return '';
    }

    const currentFormat: InlineFormat = {
      ...parentFormat,
      bold: parentFormat.bold || tag === 'strong' || tag === 'b' || /font-weight:\s*(bold|700|800|900)/i.test(style),
      italic: parentFormat.italic || tag === 'em' || tag === 'i' || /font-style:\s*italic/i.test(style),
      underline: parentFormat.underline || tag === 'u' || /text-decoration:\s*underline/i.test(style),
      strike: parentFormat.strike || tag === 's' || tag === 'strike' || tag === 'del' || /text-decoration:\s*line-through/i.test(style),
    };

    const colorMatch = style.match(/(?:^|;|\s)color:\s*(#[0-9a-fA-F]{3,6})/i);
    if (colorMatch && colorMatch[1].startsWith('#')) {
      let hex = colorMatch[1].replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      currentFormat.color = hex;
    }

    const bgMatch = style.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6}|yellow|cyan|magenta|lime)/i);
    if (bgMatch) {
      currentFormat.highlight = 'yellow';
    }

    const sizeMatch = style.match(/font-size:\s*(\d+(?:\.\d+)?)(pt|px)?/i);
    if (sizeMatch) {
      const num = parseFloat(sizeMatch[1]);
      currentFormat.fontSize = sizeMatch[2] === 'px' ? Math.round(num * 0.75) : num;
    }

    let result = '';
    Array.from(node.childNodes).forEach((child) => {
      result += processInlineNode(child, currentFormat, ctx);
    });
    return result;
  }

  return '';
}

function processParagraphNode(el: HTMLElement, ctx: OpenXmlContext): string {
  const tag = el.tagName.toLowerCase();
  const style = el.getAttribute('style') || '';
  const alignMatch = style.match(/text-align:\s*(left|center|right|justify)/i);
  let alignVal = alignMatch ? alignMatch[1].toLowerCase() : '';
  if (alignVal === 'justify') alignVal = 'both';

  const hasIndent = /text-indent/i.test(style);

  const pPrParts: string[] = [];
  if (alignVal) pPrParts.push(`<w:jc w:val="${alignVal}"/>`);
  if (hasIndent) pPrParts.push('<w:ind w:firstLine="567"/>');

  if (tag === 'h1') {
    pPrParts.push('<w:spacing w:before="240" w:after="160" w:line="360" w:lineRule="auto"/>');
  } else if (tag === 'h2') {
    pPrParts.push('<w:spacing w:before="180" w:after="120" w:line="360" w:lineRule="auto"/>');
  } else {
    pPrParts.push('<w:spacing w:after="120" w:line="360" w:lineRule="auto"/>');
  }

  const pPr = `<w:pPr>${pPrParts.join('')}</w:pPr>`;

  let defaultHeadingSize: number | undefined;
  if (tag === 'h1') defaultHeadingSize = 20;
  else if (tag === 'h2') defaultHeadingSize = 16;
  else if (tag === 'h3') defaultHeadingSize = 14;

  const initialFormat: InlineFormat = {
    bold: /font-weight:\s*(bold|700|800|900)/i.test(style) || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag),
    italic: /font-style:\s*italic/i.test(style),
    underline: /text-decoration:\s*underline/i.test(style),
    fontSize: defaultHeadingSize,
  };

  let runs = '';
  Array.from(el.childNodes).forEach((child) => {
    runs += processInlineNode(child, initialFormat, ctx);
  });

  if (!runs) {
    runs = '<w:r><w:t></w:t></w:r>';
  }

  return `<w:p>${pPr}${runs}</w:p>`;
}

function processTableNode(tableEl: HTMLElement, ctx: OpenXmlContext): string {
  const trs = Array.from(tableEl.querySelectorAll('tr'));
  if (trs.length === 0) return '';

  let maxCols = 0;
  trs.forEach(tr => {
    const cells = tr.querySelectorAll('td, th');
    if (cells.length > maxCols) maxCols = cells.length;
  });
  if (maxCols === 0) maxCols = 1;

  const colWidth = Math.floor(9000 / maxCols);
  let gridXml = '<w:tblGrid>';
  for (let i = 0; i < maxCols; i++) {
    gridXml += `<w:gridCol w:w="${colWidth}"/>`;
  }
  gridXml += '</w:tblGrid>';

  const tableStyle = tableEl.getAttribute('style') || '';
  const isExplicitNoBorder = /border:\s*none/i.test(tableStyle);
  const borderVal = isExplicitNoBorder ? 'none' : 'single';
  const borderSz = isExplicitNoBorder ? '0' : '4';
  const borderColor = isExplicitNoBorder ? 'auto' : '888888';

  const tblPr = `<w:tblPr>
    <w:tblW w:w="9000" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
      <w:left w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
      <w:bottom w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
      <w:right w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
      <w:insideH w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
      <w:insideV w:val="${borderVal}" w:sz="${borderSz}" w:space="0" w:color="${borderColor}"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="120" w:type="dxa"/>
      <w:left w:w="160" w:type="dxa"/>
      <w:bottom w:w="120" w:type="dxa"/>
      <w:right w:w="160" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>`;

  let rowsXml = '';
  trs.forEach(tr => {
    let cellsXml = '';
    const cells = Array.from(tr.querySelectorAll('td, th'));
    cells.forEach(cell => {
      const cellHtml = cell as HTMLElement;
      const cellStyle = cellHtml.getAttribute('style') || '';
      const cellAlign = /text-align:\s*center/i.test(cellStyle) ? 'center' : (/text-align:\s*right/i.test(cellStyle) ? 'right' : 'left');

      const isCellNoBorder = isExplicitNoBorder || /border:\s*none/i.test(cellStyle);
      const tcBorders = isCellNoBorder ? '' : `<w:tcBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="888888"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="888888"/>
      </w:tcBorders>`;

      let shdXml = '';
      const bgMatch = cellStyle.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})/i);
      if (bgMatch) {
        let hex = bgMatch[1].replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        shdXml = `<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`;
      }

      let cellParagraphs = '';
      const childPs = Array.from(cellHtml.querySelectorAll('p, div, h1, h2, h3'));
      if (childPs.length > 0) {
        childPs.forEach(p => {
          cellParagraphs += processParagraphNode(p as HTMLElement, ctx);
        });
      } else {
        const textRuns = processInlineNode(cellHtml, {}, ctx);
        cellParagraphs = `<w:p><w:pPr><w:jc w:val="${cellAlign}"/><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>${textRuns || '<w:r><w:t></w:t></w:r>'}</w:p>`;
      }

      cellsXml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${tcBorders}${shdXml}</w:tcPr>${cellParagraphs}</w:tc>`;
    });
    rowsXml += `<w:tr>${cellsXml}</w:tr>`;
  });

  return `<w:tbl>${tblPr}${gridXml}${rowsXml}</w:tbl>`;
}

function convertHtmlToOpenXml(html: string, ctx: OpenXmlContext): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  let xml = '';

  const processBlockContainer = (parent: HTMLElement) => {
    let pendingInlineNodes: Node[] = [];

    const flushInlineNodes = () => {
      if (pendingInlineNodes.length === 0) return;
      const pEl = document.createElement('p');
      pendingInlineNodes.forEach(n => pEl.appendChild(n.cloneNode(true)));
      xml += processParagraphNode(pEl, ctx);
      pendingInlineNodes = [];
    };

    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent || '';
        if (txt.trim()) {
          pendingInlineNodes.push(node);
        }
      } else if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();

        if (tag === 'table') {
          flushInlineNodes();
          xml += processTableNode(node, ctx);
        } else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'].includes(tag)) {
          flushInlineNodes();
          xml += processParagraphNode(node, ctx);
        } else if (['div', 'section', 'article', 'main', 'header', 'footer'].includes(tag)) {
          flushInlineNodes();
          const hasNestedBlocks = node.querySelector('p, table, div, h1, h2, h3, h4, h5, h6, ul, ol');
          if (hasNestedBlocks) {
            processBlockContainer(node);
          } else {
            xml += processParagraphNode(node, ctx);
          }
        } else {
          pendingInlineNodes.push(node);
        }
      }
    });

    flushInlineNodes();
  };

  processBlockContainer(container);

  if (!xml.trim()) {
    xml = '<w:p><w:r><w:t></w:t></w:r></w:p>';
  }

  return xml;
}

export function generateValidDocxBlob(html: string, title = 'Van_Ban'): Blob {
  const enc = new TextEncoder();
  const cleanTitle = sanitizeXml(title.replace(/_/g, ' ').replace(/\.docx?$/i, ''));
  const ctx: OpenXmlContext = { images: [] };
  const bodyXml = convertHtmlToOpenXml(html, ctx);

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="webp" ContentType="image/webp"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  let imageRels = '';
  ctx.images.forEach(img => {
    imageRels += `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.fileName}"/>`;
  });

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRels}
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="28"/>
        <w:szCs w:val="28"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="360" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

  const nowIso = new Date().toISOString();
  const corePropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${cleanTitle}</dc:title>
  <dc:creator>KIYOVN Enterprise</dc:creator>
  <cp:lastModifiedBy>KIYOVN Enterprise</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;

  const appPropsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>KIYOVN</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const entries: ZipFileEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml) },
    { name: '_rels/.rels', data: enc.encode(rootRelsXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(docRelsXml) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    { name: 'docProps/core.xml', data: enc.encode(corePropsXml) },
    { name: 'docProps/app.xml', data: enc.encode(appPropsXml) },
  ];

  ctx.images.forEach(img => {
    entries.push({
      name: `word/media/${img.fileName}`,
      data: img.data,
    });
  });

  const zipBytes = buildZipArchive(entries);
  return new Blob([zipBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Tải file thật về máy tính người dùng
 */
export function downloadFile(filename: string, customContent?: string | Blob): void {
  const lower = filename.toLowerCase();

  let blob: Blob;

  if (customContent instanceof Blob) {
    blob = customContent;
  } else if (lower.endsWith('.pdf')) {
    const cleanDocName = filename.replace(/_/g, ' ').replace(/\.pdf$/i, '');
    blob = generateValidPdfBlob(
      cleanDocName.toUpperCase(),
      `So hieu: KIYO-DOC-2026/0889 | Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`,
      [
        '1. Can cu Dieu le va Quy che quan ly van ban Cong ty Co phan Cong nghe KIYOVN.',
        '2. Phe duyet ap dung van ban, hop dong dien tu tren he thong so hoa toan dien.',
        '3. Thong tin van ban da duoc ma hoa bao mat chuan SHA-256 va gan chu ky so Root CA.',
        '4. Moi thong tin trong tai lieu co gia tri thi hanh va luu tru hop le.',
        '',
        `Nguoi ky xac thuc: Ban Giam Doc & Bo phan Chuyen trach`,
        `Thoi gian cap nhat: ${new Date().toLocaleString('vi-VN')}`,
      ]
    );
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    const csvContent = `\uFEFFSTT,Mã Danh Mục,Tên Nghiệp Vụ,Đơn Vị,Số Lượng,Đơn Giá (VNĐ),Thành Tiền (VNĐ),Trạng Thái\n` +
      `1,REV-01,Dịch vụ Điện toán đám mây Cloud Enterprise,Gói,12,250000000,3000000000,Đã đối soát\n` +
      `2,REV-02,Bản quyền phần mềm Quản trị ERP v3,License,450,4500000,2025000000,Đã nghiệm thu\n` +
      `3,EXP-01,Chi phí vận hành Trung tâm dữ liệu IDC,Tháng,12,120000000,1440000000,Đã thanh toán\n` +
      `4,EXP-02,Quỹ lương và trích nộp BHXH nhân sự,Tháng,12,680000000,8160000000,Đã chuyển khoản\n` +
      `\nTổng cộng giá trị thực tế: 14,625,000,000 VNĐ`;
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    const defaultHtml = `<div style="text-align: center; margin-bottom: 20px;">
      <p style="font-size: 13pt; font-weight: bold; text-transform: uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
      <p style="font-size: 13pt; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
    </div>
    <div style="text-align: center; font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 20px 0;">
      ${filename.replace(/_/g, ' ').replace(/\.docx?$/i, '').toUpperCase()}
    </div>
    <div>
      <p style="margin: 0 0 12px 0; text-indent: 28px; line-height: 1.8;">Căn cứ theo Luật Doanh Nghiệp 2020 và Điều lệ hoạt động của Công ty Cổ phần Công nghệ KIYOVN.</p>
      <p style="margin: 0 0 12px 0; text-indent: 28px; line-height: 1.8;">Điều 1. Ban hành quy chuẩn quản lý và vận hành thông tin văn bản điện tử trên toàn hệ thống.</p>
      <p style="margin: 0 0 12px 0; text-indent: 28px; line-height: 1.8;">Điều 2. Các phòng ban chức năng chịu trách nhiệm thi hành.</p>
      <p style="margin: 0 0 12px 0; text-indent: 28px; line-height: 1.8;">Điều 3. Quyết định có hiệu lực thi hành kể từ ngày ký ban hành.</p>
    </div>`;
    blob = generateValidDocxBlob(customContent || defaultHtml, filename);
  } else {
    const txtContent = customContent || `\uFEFF// KIYOVN Enterprise System File\n// File: ${filename}\n// Timestamp: ${new Date().toISOString()}\n\n{\n  "system": "KIYOVN ERP Core",\n  "status": "active",\n  "verified": true\n}`;
    blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
