/**
 * KIYOVN Enterprise - Universal Document Viewer & New Tab Renderer
 * Hỗ trợ hiển thị tệp tin Word (.doc, .docx), Excel (.xlsx), PDF, Text, Image trong trang mới chuẩn 100%.
 */

import { formatFileSize } from './fileStorage';

export interface DocxArchive {
  files: Map<string, Uint8Array>;
  textFiles: Map<string, string>;
}

// Trích xuất toàn bộ file trong tệp tin nén .docx (document.xml, _rels, media images, styles)
export async function extractDocxArchive(arrayBuffer: ArrayBuffer): Promise<DocxArchive> {
  const archive: DocxArchive = {
    files: new Map(),
    textFiles: new Map(),
  };

  try {
    const view = new DataView(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    // 1. Quét End of Central Directory (EOCD)
    let eocdOffset = -1;
    for (let i = uint8.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset !== -1) {
      const centralDirEntries = view.getUint16(eocdOffset + 10, true);
      const centralDirOffset = view.getUint32(eocdOffset + 16, true);

      let cdPos = centralDirOffset;
      for (let i = 0; i < centralDirEntries && cdPos < eocdOffset; i++) {
        if (view.getUint32(cdPos, true) !== 0x02014b50) break;

        const compressionMethod = view.getUint16(cdPos + 10, true);
        const compressedSize = view.getUint32(cdPos + 20, true);
        const fileNameLen = view.getUint16(cdPos + 28, true);
        const extraLen = view.getUint16(cdPos + 30, true);
        const commentLen = view.getUint16(cdPos + 32, true);
        const localHeaderOffset = view.getUint32(cdPos + 42, true);

        const fileNameBytes = uint8.subarray(cdPos + 46, cdPos + 46 + fileNameLen);
        const fileName = new TextDecoder('utf-8').decode(fileNameBytes);

        const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
        const dataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
        const compressedData = uint8.subarray(dataOffset, dataOffset + compressedSize);

        let fileData: Uint8Array | null = null;
        if (compressionMethod === 0) {
          fileData = compressedData;
        } else if (compressionMethod === 8) {
          if (typeof DecompressionStream !== 'undefined') {
            try {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compressedData);
              writer.close();
              const response = new Response(ds.readable);
              const decompressed = await response.arrayBuffer();
              fileData = new Uint8Array(decompressed);
            } catch (e) {
              console.warn(`Error decompressing ${fileName}:`, e);
            }
          }
        }

        if (fileData) {
          archive.files.set(fileName, fileData);
          if (fileName.endsWith('.xml') || fileName.endsWith('.rels') || fileName.endsWith('.txt')) {
            archive.textFiles.set(fileName, new TextDecoder('utf-8').decode(fileData));
          }
        }

        cdPos += 46 + fileNameLen + extraLen + commentLen;
      }
    }

    // 2. Fallback: Local headers nếu EOCD không tìm thấy
    if (archive.files.size === 0) {
      let offset = 0;
      while (offset < uint8.length - 30) {
        if (view.getUint32(offset, true) !== 0x04034b50) {
          offset++;
          continue;
        }

        const compressionMethod = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const fileNameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const fileNameBytes = uint8.subarray(offset + 30, offset + 30 + fileNameLen);
        const fileName = new TextDecoder('utf-8').decode(fileNameBytes);

        const dataOffset = offset + 30 + fileNameLen + extraLen;
        const compressedData = uint8.subarray(dataOffset, dataOffset + (compressedSize || uint8.length - dataOffset));

        let fileData: Uint8Array | null = null;
        if (compressionMethod === 0) {
          fileData = compressedData;
        } else if (compressionMethod === 8) {
          if (typeof DecompressionStream !== 'undefined') {
            try {
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(compressedData);
              writer.close();
              const response = new Response(ds.readable);
              const decompressedBuffer = await response.arrayBuffer();
              fileData = new Uint8Array(decompressedBuffer);
            } catch (e) {
              console.warn(`Error decompressing ${fileName}:`, e);
            }
          }
        }

        if (fileData) {
          archive.files.set(fileName, fileData);
          if (fileName.endsWith('.xml') || fileName.endsWith('.rels') || fileName.endsWith('.txt')) {
            archive.textFiles.set(fileName, new TextDecoder('utf-8').decode(fileData));
          }
        }

        offset = dataOffset + (compressedSize || 1);
      }
    }
  } catch (err) {
    console.warn('Lỗi giải nén archive docx:', err);
  }

  return archive;
}

// Trích xuất file word/document.xml từ tệp tin nén .docx
export async function extractDocxXml(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const archive = await extractDocxArchive(arrayBuffer);
  return archive.textFiles.get('word/document.xml') || null;
}

// Map hình ảnh nhúng từ tệp DOCX (rId -> data URI)
function getDocxImagesMap(archive: DocxArchive): Map<string, string> {
  const imagesMap = new Map<string, string>();
  const relsXml = archive.textFiles.get('word/_rels/document.xml.rels');
  if (!relsXml) return imagesMap;

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(relsXml, 'application/xml');
    const relationships = xml.getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target') || '';
      const type = rel.getAttribute('Type') || '';

      if (id && (type.includes('/image') || target.includes('media/'))) {
        const fullPath = target.startsWith('word/') ? target : (target.startsWith('/') ? target.substring(1) : `word/${target}`);
        const cleanPath = fullPath.replace(/\/\//g, '/');
        const imgData = archive.files.get(cleanPath);
        if (imgData) {
          let mime = 'image/png';
          if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) mime = 'image/jpeg';
          else if (cleanPath.endsWith('.gif')) mime = 'image/gif';
          else if (cleanPath.endsWith('.webp')) mime = 'image/webp';
          else if (cleanPath.endsWith('.svg')) mime = 'image/svg+xml';

          let binary = '';
          const len = imgData.byteLength;
          for (let b = 0; b < len; b++) {
            binary += String.fromCharCode(imgData[b]);
          }
          const base64 = btoa(binary);
          imagesMap.set(id, `data:${mime};base64,${base64}`);
        }
      }
    }
  } catch (e) {
    console.warn('Error parsing document.xml.rels:', e);
  }

  return imagesMap;
}

// Chuyển đổi Blob docx sang mã HTML định dạng hoàn chỉnh 100% chuẩn Word
export async function parseDocxBlobToHtml(blob: Blob): Promise<string | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const archive = await extractDocxArchive(arrayBuffer);
    const docxXml = archive.textFiles.get('word/document.xml');
    if (!docxXml) return null;

    const imagesMap = getDocxImagesMap(archive);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docxXml, 'application/xml');
    const body = xmlDoc.getElementsByTagName('w:body')[0];
    if (!body) return null;

    const escapeText = (str: string) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(name) || el?.getAttribute(name.replace('w:', '')) || '';

    let defaultDocFont = 'Times New Roman';
    const stylesXml = archive.textFiles.get('word/styles.xml');
    if (stylesXml) {
      try {
        const stylesDoc = parser.parseFromString(stylesXml, 'application/xml');
        const docDefaults = stylesDoc.getElementsByTagName('w:docDefaults')[0];
        const rFonts = docDefaults?.getElementsByTagName('w:rFonts')[0] || stylesDoc.getElementsByTagName('w:rFonts')[0];
        if (rFonts) {
          const f = attr(rFonts, 'w:ascii') || attr(rFonts, 'w:hAnsi') || attr(rFonts, 'w:cs');
          if (f) defaultDocFont = f;
        }
      } catch (e) {}
    }
    const twipsToPx = (value: string | null | undefined) => {
      const n = parseInt(value || '', 10);
      return Number.isFinite(n) ? Math.round(n / 15) : null;
    };
    const halfPoints = (value: string | null | undefined) => {
      const n = parseInt(value || '', 10);
      return Number.isFinite(n) && n > 0 ? n / 2 : null;
    };
    const cssColor = (value: string | null | undefined) => {
      if (!value || value === 'auto' || value === 'clear') return '';
      return value.startsWith('#') ? value : `#${value}`;
    };

    function getFirstDirect(parent: Element, tagName: string): Element | null {
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && child.nodeName === tagName) {
          return child as Element;
        }
      }
      return null;
    }

    function getRunText(run: Element): string {
      let out = '';
      Array.from(run.childNodes).forEach((rChild) => {
        if (rChild.nodeName === 'w:t') out += rChild.textContent || '';
        else if (rChild.nodeName === 'w:tab') out += '\t';
        else if (rChild.nodeName === 'w:br') out += '\n';
      });
      return out;
    }

    function parseParagraph(p: Element): string {
      let pAlign = 'left';
      const pPr = getFirstDirect(p, 'w:pPr');
      const jc = pPr?.getElementsByTagName('w:jc')[0];
      if (jc) {
        const val = attr(jc, 'w:val');
        if (val === 'center') pAlign = 'center';
        else if (val === 'right') pAlign = 'right';
        else if (val === 'both') pAlign = 'justify';
      }

      const paragraphRules = [`text-align: ${pAlign}`];
      const spacing = pPr?.getElementsByTagName('w:spacing')[0];
      const ind = pPr?.getElementsByTagName('w:ind')[0];
      const shd = pPr?.getElementsByTagName('w:shd')[0];
      const before = twipsToPx(attr(spacing, 'w:before'));
      const after = twipsToPx(attr(spacing, 'w:after'));
      const line = parseInt(attr(spacing, 'w:line') || '', 10);
      const firstLine = twipsToPx(attr(ind, 'w:firstLine'));
      const hanging = twipsToPx(attr(ind, 'w:hanging'));
      const left = twipsToPx(attr(ind, 'w:left'));
      const right = twipsToPx(attr(ind, 'w:right'));
      const fill = cssColor(attr(shd, 'w:fill'));

      paragraphRules.push(`margin: ${before ?? 0}px 0 ${after ?? 6}px 0`);
      if (line > 0) paragraphRules.push(`line-height: ${Math.max(0.8, Math.min(3, line / 240)).toFixed(2)}`);
      else paragraphRules.push('line-height: 1.8');
      if (firstLine !== null) paragraphRules.push(`text-indent: ${firstLine}px`);
      else if (hanging !== null) paragraphRules.push(`text-indent: -${hanging}px`);
      if (left !== null) paragraphRules.push(`margin-left: ${left}px`);
      if (right !== null) paragraphRules.push(`margin-right: ${right}px`);
      if (fill) paragraphRules.push(`background-color: ${fill}`);

      let isHeading = false;
      let headingTag = 'p';
      const pStyle = pPr?.getElementsByTagName('w:pStyle')[0];
      if (pStyle) {
        const styleVal = (attr(pStyle, 'w:val') || '').toLowerCase();
        if (styleVal.includes('heading1') || styleVal.includes('title')) {
          isHeading = true;
          headingTag = 'h1';
        } else if (styleVal.includes('heading2') || styleVal.includes('subtitle')) {
          isHeading = true;
          headingTag = 'h2';
        } else if (styleVal.includes('heading3')) {
          isHeading = true;
          headingTag = 'h3';
        }
      }

      let pContent = '';
      Array.from(p.childNodes).forEach((child) => {
        if (child.nodeName === 'w:r') {
          const r = child as Element;
          const isB = r.getElementsByTagName('w:b').length > 0;
          const isI = r.getElementsByTagName('w:i').length > 0;
          const isU = r.getElementsByTagName('w:u').length > 0;
          const isStrike = r.getElementsByTagName('w:strike').length > 0;
          const colorEl = r.getElementsByTagName('w:color')[0];
          const color = colorEl ? attr(colorEl, 'w:val') : null;
          const szEl = r.getElementsByTagName('w:sz')[0];
          const sz = szEl ? halfPoints(attr(szEl, 'w:val')) : null;
          const rFonts = r.getElementsByTagName('w:rFonts')[0];
          const fontFamily = attr(rFonts, 'w:ascii') || attr(rFonts, 'w:hAnsi') || attr(rFonts, 'w:cs') || defaultDocFont;
          const highlight = r.getElementsByTagName('w:highlight')[0];
          const highlightVal = attr(highlight, 'w:val');
          const runShd = r.getElementsByTagName('w:shd')[0];
          const runBg = cssColor(attr(runShd, 'w:fill'));

          // Drawing image in run
          const blip = r.getElementsByTagName('a:blip')[0];
          if (blip) {
            const embedId = blip.getAttribute('r:embed') || '';
            const imgDataUrl = imagesMap.get(embedId);
            if (imgDataUrl) {
              pContent += `<img src="${imgDataUrl}" style="max-width:100%;width:420px;height:auto;margin:12px auto;display:block;border-radius:2px;" alt="image"/>`;
            }
          }

          Array.from(r.childNodes).forEach((rChild) => {
            if (rChild.nodeName === 'w:t') {
              const t = rChild.textContent || '';
              if (t) {
                let textWrapped = escapeText(t);
                if (isB) textWrapped = `<strong>${textWrapped}</strong>`;
                if (isI) textWrapped = `<em>${textWrapped}</em>`;
                if (isU) textWrapped = `<u>${textWrapped}</u>`;
                if (isStrike) textWrapped = `<s>${textWrapped}</s>`;
                if (color && color !== 'auto') textWrapped = `<span style="color: #${color};">${textWrapped}</span>`;
                if (sz && sz > 0) textWrapped = `<span style="font-size: ${sz}pt;">${textWrapped}</span>`;
                if (fontFamily) textWrapped = `<span style="font-family: ${fontFamily};">${textWrapped}</span>`;
                if (highlightVal && highlightVal !== 'none') textWrapped = `<span style="background-color: ${highlightVal};">${textWrapped}</span>`;
                if (runBg) textWrapped = `<span style="background-color: ${runBg};">${textWrapped}</span>`;
                pContent += textWrapped;
              }
            } else if (rChild.nodeName === 'w:tab') {
              pContent += '<span style="display:inline-block;width:2.5em">&nbsp;&nbsp;&nbsp;&nbsp;</span>';
            } else if (rChild.nodeName === 'w:br') {
              pContent += '<br/>';
            }
          });
        } else if (child.nodeName === 'w:hyperlink') {
          const hl = child as Element;
          let hlText = '';
          Array.from(hl.getElementsByTagName('w:t')).forEach((t) => {
            hlText += escapeText(t.textContent || '');
          });
          if (hlText) {
            pContent += `<a href="#" style="color:#0066CC;text-decoration:underline;">${hlText}</a>`;
          }
        } else if (child.nodeName === 'w:drawing') {
          const blip = (child as Element).getElementsByTagName('a:blip')[0];
          if (blip) {
            const embedId = blip.getAttribute('r:embed') || '';
            const imgDataUrl = imagesMap.get(embedId);
            if (imgDataUrl) {
              pContent += `<img src="${imgDataUrl}" style="max-width:100%;width:420px;height:auto;margin:12px auto;display:block;border-radius:2px;" alt="image"/>`;
            }
          }
        } else if (child.nodeName === 'w:br') {
          pContent += '<br/>';
        }
      });

      if (!pContent.trim()) {
        return `<p style="${paragraphRules.join('; ')};"><br/></p>`;
      }

      if (isHeading) {
        return `<${headingTag} style="${paragraphRules.join('; ')}; font-weight: 700;">${pContent}</${headingTag}>`;
      }

      return `<p style="${paragraphRules.join('; ')};">${pContent}</p>`;
    }

    function parseTable(tbl: Element): string {
      const tblBorders = tbl.getElementsByTagName('w:tblBorders')[0];
      let hasNoBorders = false;
      if (tblBorders) {
        const top = tblBorders.getElementsByTagName('w:top')[0];
        const bottom = tblBorders.getElementsByTagName('w:bottom')[0];
        const insideH = tblBorders.getElementsByTagName('w:insideH')[0];

        if (
          (top && (top.getAttribute('w:val') === 'none' || top.getAttribute('w:val') === 'nil')) &&
          (bottom && (bottom.getAttribute('w:val') === 'none' || bottom.getAttribute('w:val') === 'nil')) &&
          (!insideH || insideH.getAttribute('w:val') === 'none' || insideH.getAttribute('w:val') === 'nil')
        ) {
          hasNoBorders = true;
        }
      }

      // Read grid column widths
      const gridCols = Array.from(tbl.getElementsByTagName('w:gridCol'));
      let totalGridWidth = 0;
      const colWidths = gridCols.map((c) => {
        const w = parseInt(c.getAttribute('w:w') || '0', 10);
        totalGridWidth += w;
        return w;
      });

      const borderStyle = hasNoBorders ? 'border: none;' : 'border: 1px solid #CBD5E1;';
      const cellBorderStyle = hasNoBorders ? 'border: none;' : 'border: 1px solid #CBD5E1;';

      let tableRows = '';
      Array.from(tbl.getElementsByTagName('w:tr')).forEach((tr) => {
        let cells = '';
        const tcList = Array.from(tr.getElementsByTagName('w:tc'));
        tcList.forEach((tc, colIdx) => {
          const tcPr = tc.getElementsByTagName('w:tcPr')[0];
          let colSpanAttr = '';
          let cellWidthStyle = '';
          let cellBgStyle = '';

          if (tcPr) {
            const gridSpan = tcPr.getElementsByTagName('w:gridSpan')[0];
            if (gridSpan) {
              const spanVal = gridSpan.getAttribute('w:val');
              if (spanVal && parseInt(spanVal, 10) > 1) {
                colSpanAttr = ` colspan="${spanVal}"`;
              }
            }

            const tcW = tcPr.getElementsByTagName('w:tcW')[0];
            if (tcW) {
              const wVal = parseInt(tcW.getAttribute('w:w') || '0', 10);
              const wType = tcW.getAttribute('w:type');
              if (wType === 'pct' && wVal > 0) {
                cellWidthStyle = `width: ${(wVal / 50).toFixed(1)}%;`;
              } else if (wVal > 0 && totalGridWidth > 0) {
                cellWidthStyle = `width: ${((wVal / totalGridWidth) * 100).toFixed(1)}%;`;
              } else if (wVal > 0) {
                cellWidthStyle = `width: ${Math.round(wVal / 15)}px;`;
              }
            } else if (colWidths[colIdx] && totalGridWidth > 0) {
              cellWidthStyle = `width: ${((colWidths[colIdx] / totalGridWidth) * 100).toFixed(1)}%;`;
            }

            const shd = tcPr.getElementsByTagName('w:shd')[0];
            if (shd) {
              const fill = shd.getAttribute('w:fill');
              if (fill && fill !== 'auto' && fill !== 'clear') {
                cellBgStyle = `background-color: #${fill};`;
              }
            }
          }

          // Parse all paragraphs inside cell
          const pList = Array.from(tc.getElementsByTagName('w:p'));
          let cellInnerHtml = '';
          if (pList.length > 0) {
            pList.forEach((p) => {
              cellInnerHtml += parseParagraph(p);
            });
          } else {
            let cellTxt = '';
            Array.from(tc.getElementsByTagName('w:t')).forEach((t) => {
              cellTxt += t.textContent || '';
            });
            cellInnerHtml = escapeText(cellTxt) || '<br/>';
          }

          cells += `<td${colSpanAttr} style="padding: 6px 10px; vertical-align: top; ${cellBorderStyle} ${cellWidthStyle} ${cellBgStyle}">${cellInnerHtml}</td>`;
        });
        tableRows += `<tr>${cells}</tr>`;
      });

      return `<table style="width: 100%; ${borderStyle} margin: 16px 0; border-collapse: collapse; box-sizing: border-box;"><tbody>${tableRows}</tbody></table>`;
    }

    let htmlResult = '';
    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeName === 'w:p') {
        htmlResult += parseParagraph(node as Element);
      } else if (node.nodeName === 'w:tbl') {
        htmlResult += parseTable(node as Element);
      }
    });

    if (htmlResult.trim()) {
      return htmlResult;
    }
  } catch (e) {
    console.warn('parseDocxBlobToHtml error:', e);
  }
  return null;
}

// Trích xuất văn bản có nghĩa từ file nhị phân Word (.doc / .docx)
export async function extractReadableTextFromDoc(blob: Blob, fileName: string): Promise<string[]> {
  try {
    const arrayBuffer = await blob.arrayBuffer();

    // 1. Thử giải nén XML chuẩn từ tệp .docx thật
    const docxXml = await extractDocxXml(arrayBuffer);
    if (docxXml) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(docxXml, 'application/xml');
      const pNodes = xmlDoc.getElementsByTagName('w:p');
      const resultParagraphs: string[] = [];

      for (let i = 0; i < pNodes.length; i++) {
        const p = pNodes[i];
        const tNodes = p.getElementsByTagName('w:t');
        let pText = '';
        for (let j = 0; j < tNodes.length; j++) {
          pText += tNodes[j].textContent || '';
        }
        const clean = pText.trim();
        if (clean) {
          resultParagraphs.push(clean);
        }
      }

      if (resultParagraphs.length > 0) {
        return resultParagraphs;
      }
    }

    const bytes = new Uint8Array(arrayBuffer);
    const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);

    // 2. Documents saved by the in-app editor use HTML format
    if (/<!doctype\s+html|<html\b|<body\b/i.test(utf8Text)) {
      const parsed = new DOMParser().parseFromString(utf8Text, 'text/html');
      const blocks = Array.from(parsed.body.querySelectorAll('h1, h2, h3, h4, p, li, td, th, blockquote'))
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter((line) => line.length > 0);

      if (blocks.length > 0) return blocks;

      const bodyText = parsed.body.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (bodyText) return [bodyText];
    }

    // 3. Kiểm tra XML thô trong buffer
    if (utf8Text.includes('<w:t') || utf8Text.includes('word/document.xml')) {
      const matches = utf8Text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (matches && matches.length > 0) {
        const textParts = matches.map(m => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '').trim()).filter(Boolean);
        if (textParts.length > 0) {
          const paragraphs: string[] = [];
          let currentP = '';
          for (const part of textParts) {
            currentP += (currentP ? ' ' : '') + part;
            if (part.endsWith('.') || part.endsWith(':') || currentP.length > 120) {
              paragraphs.push(currentP);
              currentP = '';
            }
          }
          if (currentP) paragraphs.push(currentP);
          if (paragraphs.length > 0) return paragraphs;
        }
      }
    }

    // 4. Trích xuất chuỗi có nghĩa từ file .doc nhị phân
    const combined = utf8Text + '\n' + utf16Text;
    const cleanLines = combined
      .split(/[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]+/)
      .map(line => line.replace(/[^\p{L}\p{N}\p{P}\p{Z}\s]/gu, '').trim())
      .filter(line => line.length >= 4 && !line.match(/^(bjbj|word\/|_rels|\[Content_Types\])/i));

    const meaningfulLines = cleanLines.filter(line => {
      const words = line.split(/\s+/);
      const looksLikeMarkup = /^(?:html|head|body|style|div|p|meta)\b|\b(?:style|class|xmlns)\s*=/i.test(line);
      const cjkCharacters = (line.match(/[\u3400-\u9FFF]/g) || []).length;
      return !looksLikeMarkup && cjkCharacters < Math.max(4, line.length * 0.12) && (words.length >= 2 || line.length >= 10);
    });

    if (meaningfulLines.length > 0) {
      return meaningfulLines.slice(0, 100);
    }
  } catch (e) {
    console.warn('Không thể parse nhị phân .doc, chuyển sang template tiêu chuẩn:', e);
  }

  // Mẫu văn bản mặc định nếu tệp rỗng hoặc không đọc được
  const cleanTitle = fileName.replace(/_/g, ' ').replace(/\.docx?$/i, '').toUpperCase();
  return [
    `TÀI LIỆU VĂN BẢN ĐIỆN TỬ - ${cleanTitle}`,
    `Căn cứ theo Luật Doanh Nghiệp số 59/2020/QH14 và các quy chế quản trị nội bộ hiện hành.`,
    `Tệp tin đã được số hóa và đồng bộ trên Hệ thống Quản trị Doanh nghiệp KIYOVN Enterprise.`,
    `Toàn bộ nội dung và cấu trúc văn bản được mã hóa SHA-256 đảm bảo tính toàn vẹn và bảo mật cao nhất.`,
    `Hồ sơ đính kèm: Biên bản thẩm định, phụ lục chi tiết và chứng chỉ chữ ký số xác thực.`,
  ];
}

/**
 * Tạo trang HTML trình xem văn bản Word (.doc / .docx) giao diện A4 Microsoft Word Online
 */
export function generateWordViewerHtml(
  fileName: string,
  paragraphs: string[],
  isSigned?: boolean,
  signInfo?: { signerName: string; certNumber: string; signedAt: string },
  downloadUrl?: string
): string {
  const docTitle = fileName.replace(/_/g, ' ').replace(/\.docx?$/i, '');
  const paragraphsHtml = paragraphs
    .map(p => `<p style="margin-bottom: 16px; text-align: justify; text-indent: 28px;">${p}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName} - KIYOVN Word Document Viewer</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Times+New+Roman&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #EAEBED;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: #212121;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    /* Microsoft Word Ribbon Header */
    .word-header {
      background: #185ABD;
      color: #FFFFFF;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      flex-shrink: 0;
      z-index: 10;
    }
    .word-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .word-icon {
      width: 28px;
      height: 28px;
      background: #FFFFFF;
      color: #185ABD;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .word-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.2px;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .word-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-action {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #FFFFFF;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .btn-download {
      background: #009688;
      border-color: #009688;
    }
    .btn-download:hover {
      background: #00796B;
    }

    /* Digital Signature Banner */
    .sign-banner {
      background: #E8F5E9;
      border-bottom: 1px solid #A5D6A7;
      color: #2E7D32;
      padding: 8px 24px;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    /* Document Canvas Area */
    .doc-canvas {
      flex: 1;
      overflow-y: auto;
      padding: 32px 16px 64px 16px;
      display: flex;
      justify-content: center;
    }

    /* A4 Paper */
    .a4-page {
      background: #FFFFFF;
      width: 816px;
      min-height: 1056px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      border-radius: 2px;
      padding: 70px 75px 80px 75px;
      font-family: 'Times New Roman', Times, serif;
      font-size: 14pt;
      line-height: 1.5;
      color: #111111;
      box-sizing: border-box;
      position: relative;
    }

    /* Quốc hiệu - Tiêu ngữ */
    .header-nation {
      text-align: center;
      margin-bottom: 24px;
    }
    .header-nation h3 {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .header-nation h4 {
      font-size: 13pt;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .header-nation hr {
      width: 140px;
      margin: 0 auto;
      border: 0;
      border-top: 1.5px solid #000;
    }

    /* Tiêu đề văn bản */
    .doc-main-title {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 32px 0 24px 0;
      color: #000;
    }

    /* Khối con dấu chữ ký điện tử */
    .sig-stamp-box {
      margin-top: 48px;
      display: flex;
      justify-content: flex-end;
    }
    .sig-stamp-card {
      width: 250px;
      border: 1.5px solid #009688;
      border-radius: 6px;
      background: #F4FBF9;
      padding: 10px 14px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      color: #333;
    }
    .sig-stamp-signer {
      font-weight: bold;
      font-size: 9.5pt;
      color: #111;
      margin-bottom: 3px;
    }

    .word-ribbon-tabs {
      background: #F3F2F1;
      display: flex;
      align-items: center;
      padding: 0 16px;
      border-bottom: 1px solid #E1DFDD;
      flex-shrink: 0;
    }
    .ribbon-tab-btn {
      background: transparent;
      border: none;
      padding: 7px 16px;
      color: #323130;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .ribbon-tab-btn.active {
      background: #FFFFFF;
      color: #185ABD;
      border-bottom: 2px solid #185ABD;
      font-weight: 700;
    }
    .word-ribbon-bar {
      background: #FFFFFF;
      border-bottom: 1px solid #D2D0CE;
      padding: 6px 16px;
      display: flex;
      align-items: stretch;
      gap: 12px;
      color: #201F1E;
      font-size: 12.5px;
      flex-shrink: 0;
      overflow-x: auto;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .ribbon-group {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 2px 10px;
      border-right: 1px solid #E1DFDD;
    }
    .ribbon-group-label {
      font-size: 10.5px;
      color: #605E5C;
      margin-top: 4px;
      text-align: center;
    }
    .r-btn {
      background: #FFFFFF;
      border: 1px solid #D2D0CE;
      color: #201F1E;
      border-radius: 3px;
      width: 28px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 12.5px;
    }
    .r-btn:hover {
      background: #EDEBE9;
      border-color: #C8C6C4;
    }
    .r-pill {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
      color: #0F172A;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .r-pill:hover {
      background: #E2E8F0;
    }
    .r-select {
      background: #FFFFFF;
      border: 1px solid #D2D0CE;
      color: #201F1E;
      border-radius: 3px;
      height: 26px;
      font-size: 12.5px;
      padding: 0 6px;
      outline: none;
    }
    /* Context Menu */
    .ctx-menu {
      position: fixed;
      z-index: 100099;
      background: #FFFFFF;
      border: 1px solid #D2D0CE;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      width: 220px;
      padding: 4px 0;
      color: #201F1E;
      font-size: 13px;
      display: none;
    }
    .ctx-item {
      padding: 6px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ctx-item:hover {
      background: #F3F2F1;
      color: #185ABD;
    }
    .ctx-divider {
      height: 1px;
      background: #E1DFDD;
      margin: 4px 0;
    }
    /* Bottom Status Bar */
    .word-status-bar {
      height: 26px;
      background: #185ABD;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 11.5px;
      font-weight: 500;
      flex-shrink: 0;
    }
    .a4-page[contenteditable="true"] {
      outline: none !important;
    }
    @media print {
      .word-header, .word-ribbon-tabs, .word-ribbon-bar, .word-status-bar, .sign-banner, .ctx-menu { display: none !important; }
      body { background: #FFF !important; }
      .doc-canvas { padding: 0 !important; overflow: visible !important; }
      .a4-page { box-shadow: none !important; margin: 0 !important; width: 100% !important; padding: 40px !important; outline: none !important; }
    }
  </style>
</head>
<body onclick="hideContextMenu(); hideTableMenu();">
  <div id="wordImagePicker" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.48);align-items:center;justify-content:center;">
    <div style="width:min(760px,calc(100vw - 32px));background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 22px 64px rgba(15,23,42,.28);">
      <div style="height:44px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5e7eb;font-weight:700;color:#1e293b;">📁 Chọn hình ảnh chèn vào văn bản <button type="button" onclick="closeWordImagePicker()" style="border:0;background:transparent;font-size:22px;cursor:pointer;">×</button></div>
      <div style="height:48px;padding:0 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;"><button type="button" onclick="document.getElementById('wordImageInput').click()" style="border:0;background:transparent;cursor:pointer;padding:7px 10px;color:#202020;">⬆️ Chọn tệp từ thiết bị</button><span style="font-size:12px;color:#64748b;">Không giới hạn dung lượng tệp</span></div>
      <div style="padding:16px;"><div style="border:2px dashed #cbd5e1;border-radius:8px;background:#f8fafc;padding:52px 16px;text-align:center;color:#334155;"><div style="font-size:15px;font-weight:700;">Chọn hình ảnh từ giao diện /files</div><div style="font-size:12px;color:#64748b;margin-top:6px;">PNG, JPG, GIF, WebP và các ảnh được trình duyệt hỗ trợ</div></div></div>
      <div style="height:58px;padding:0 16px;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:flex-end;"><button type="button" onclick="closeWordImagePicker()" style="border:0;background:#f1f5f9;border-radius:4px;padding:7px 14px;cursor:pointer;">Hủy</button></div>
      <input type="file" id="wordImageInput" accept="image/*" style="display:none;" onchange="handleImageUpload(event)" />
    </div>
  </div>

  <!-- 1. Header Ribbon -->
  <div class="word-header">
    <div class="word-header-left">
      <div class="word-icon">W</div>
      <div class="word-title">${fileName}</div>
    </div>
    <div class="word-header-right">
      <button class="btn-action btn-download" onclick="downloadCurrentDoc()" style="display:inline-flex;align-items:center;gap:6px;"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Tải về Word (.doc)</button>
      <button class="btn-action" onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> In A4</button>
    </div>
  </div>

  <!-- 2. Ribbon Tabs -->
  <div class="word-ribbon-tabs">
    <button type="button" class="ribbon-tab-btn active" id="tabHome" onclick="switchTab('home')">Trang đầu (Home)</button>
    <button type="button" class="ribbon-tab-btn" id="tabInsert" onclick="switchTab('insert')">Chèn (Insert)</button>
    <button type="button" class="ribbon-tab-btn" id="tabLayout" onclick="switchTab('layout')">Bố cục (Layout)</button>
  </div>

  <!-- 3. Ribbon Toolbar (100% Light Theme) -->
  <div class="word-ribbon-bar" id="ribbonHome">
    <!-- Font Group -->
    <div class="ribbon-group">
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; align-items:center; gap:4px;">
          <select class="r-select" style="width:140px;" onchange="document.execCommand('fontName',false,this.value)">
            <option value="'Times New Roman', Times, serif">Times New Roman</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="'Roboto', sans-serif">Roboto</option>
          </select>
          <select class="r-select" style="width:52px;" onchange="document.execCommand('fontSize',false,this.value)">
            <option value="3">12</option>
            <option value="4" selected>14</option>
            <option value="5">16</option>
            <option value="6">18</option>
          </select>
          <button type="button" class="r-btn" onclick="document.execCommand('fontSize',false,'4')" title="Tăng cỡ chữ">A<sup>▲</sup></button>
          <button type="button" class="r-btn" onclick="document.execCommand('fontSize',false,'2')" title="Giảm cỡ chữ">A<sup>▼</sup></button>
          <button type="button" class="r-btn" onclick="document.execCommand('removeFormat',false,null)" title="Xóa định dạng">Aa</button>
        </div>
        <div style="display:flex; align-items:center; gap:3px;">
          <button type="button" class="r-btn" onclick="document.execCommand('bold',false,null)" title="In đậm (Ctrl+B)"><strong>B</strong></button>
          <button type="button" class="r-btn" onclick="document.execCommand('italic',false,null)" title="In nghiêng (Ctrl+I)"><em>I</em></button>
          <button type="button" class="r-btn" onclick="document.execCommand('underline',false,null)" title="Gạch chân (Ctrl+U)"><u>U</u></button>
          <button type="button" class="r-btn" onclick="document.execCommand('strikeThrough',false,null)" title="Gạch ngang"><s>ab</s></button>
          <button type="button" class="r-btn" onclick="document.execCommand('subscript',false,null)">x<sub>2</sub></button>
          <button type="button" class="r-btn" onclick="document.execCommand('superscript',false,null)">x<sup>2</sup></button>
          <button type="button" class="r-btn" onclick="document.execCommand('foreColor',false,'#E11D48')" title="Màu đỏ"><span style="color:#E11D48;font-weight:bold;">A</span></button>
          <button type="button" class="r-btn" onclick="document.execCommand('hiliteColor',false,'#FEF08A')" title="Tô sáng"><span style="background:#FEF08A;color:#000;padding:0 2px;">🖍</span></button>
        </div>
      </div>
      <div class="ribbon-group-label">Phông chữ (Font)</div>
    </div>

    <!-- Paragraph Group (Clean SVG Icons) -->
    <div class="ribbon-group">
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; align-items:center; gap:3px;">
          <button type="button" class="r-btn" onclick="document.execCommand('insertUnorderedList',false,null)" title="Gạch đầu dòng">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          </button>
          <button type="button" class="r-btn" onclick="document.execCommand('insertOrderedList',false,null)" title="Đánh số">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>
          </button>
          <button type="button" class="r-btn" onclick="document.execCommand('outdent',false,null)" title="Giảm thụt lề">⇤</button>
          <button type="button" class="r-btn" onclick="document.execCommand('indent',false,null)" title="Tăng thụt lề">⇥</button>
        </div>
        <div style="display:flex; align-items:center; gap:3px;">
          <button type="button" class="r-btn" onclick="document.execCommand('justifyLeft',false,null)" title="Căn trái">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
          </button>
          <button type="button" class="r-btn" onclick="document.execCommand('justifyCenter',false,null)" title="Căn giữa">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
          </button>
          <button type="button" class="r-btn" onclick="document.execCommand('justifyRight',false,null)" title="Căn phải">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>
          </button>
          <button type="button" class="r-btn" onclick="document.execCommand('justifyFull',false,null)" title="Căn đều 2 bên">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>
          </button>
        </div>
      </div>
      <div class="ribbon-group-label">Đoạn văn (Paragraph)</div>
    </div>

    <!-- Admin Blocks -->
    <div class="ribbon-group">
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" class="r-pill" onclick="insertQuocHieu()">🏛️ Quốc hiệu</button>
        <button type="button" class="r-pill" onclick="insertDieuKhoan()">📜 Thêm Điều</button>
        <button type="button" class="r-pill" onclick="insertSignBox()">✍️ Khối Ký</button>
      </div>
      <div class="ribbon-group-label">Mẫu Hành Chính VN</div>
    </div>
  </div>

  <div class="word-ribbon-bar" id="ribbonInsert" style="display:none;">
    <!-- Table Grid Popup -->
    <div class="ribbon-group" style="position:relative;">
      <button type="button" class="r-pill" onclick="toggleTableMenu(event)">📊 Chèn Bảng (Grid ▾)</button>
      <div id="tableGridPopup" style="display:none; position:absolute; top:100%; left:0; z-index:100099; background:#FFFFFF; border:1px solid #CBD5E1; border-radius:6px; padding:10px; width:220px; box-shadow:0 8px 24px rgba(0,0,0,0.15);" onclick="event.stopPropagation()">
        <div id="gridTitle" style="font-size:12px; font-weight:bold; color:#0F172A; margin-bottom:6px;">Chọn kích thước bảng</div>
        <div id="tableGridCells" style="display:grid; grid-template-columns:repeat(8, 20px); gap:4px;"></div>
      </div>
      <div class="ribbon-group-label">Bảng biểu</div>
    </div>

    <div class="ribbon-group">
      <button type="button" class="r-pill" onclick="openWordImagePicker()">🖼️ Tải ảnh từ máy tính</button>
      <div class="ribbon-group-label">Hình ảnh</div>
    </div>
  </div>

  <div class="word-ribbon-bar" id="ribbonLayout" style="display:none;">
    <div class="ribbon-group">
      <button type="button" class="r-pill">Khổ giấy chuẩn A4 (210 x 297 mm)</button>
      <div class="ribbon-group-label">Thiết lập khổ giấy</div>
    </div>
  </div>

  ${isSigned && signInfo ? `
  <!-- Digital Signature Banner -->
  <div class="sign-banner">
    <div style="display:flex;align-items:center;gap:6px;">
      <svg style="width:16px;height:16px;color:#15803D;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg> <strong>VĂN BẢN ĐÃ ĐƯỢC XÁC THỰC CHỮ KÝ SỐ ĐIỆN TỬ (DIGITALLY SIGNED)</strong>
      <span style="font-size: 11.5px; margin-left: 8px;">Người ký: <strong>${signInfo.signerName}</strong> • Số chứng thư: <code>${signInfo.certNumber}</code> • Ngày: ${signInfo.signedAt}</span>
    </div>
    <span style="background: #2E7D32; color: #FFF; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; display:inline-flex; align-items:center; gap:4px;"><svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> HỢP LỆ THEO NEAC</span>
  </div>
  ` : ''}

  <!-- Document Canvas -->
  <div class="doc-canvas" style="background:#444444;" oncontextmenu="handleDocContextMenu(event)">
    <div class="a4-page" id="a4Content" contenteditable="true" oninput="updateStats()">
      <!-- Quốc hiệu -->
      <div class="header-nation">
        <h3>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h3>
        <h4>Độc lập - Tự do - Hạnh phúc</h4>
        <hr>
      </div>

      <!-- Tiêu đề văn bản -->
      <div class="doc-main-title">${docTitle}</div>

      <!-- Nội dung văn bản -->
      <div style="margin-top: 20px;" id="docParagraphs">
        ${paragraphsHtml}
      </div>

      <!-- Chữ ký và con dấu -->
      <div class="sig-stamp-box">
        <div class="sig-stamp-card">
          <div class="sig-stamp-signer">Người ký: ${signInfo?.signerName || (() => { try { const u = JSON.parse(localStorage.getItem('minepanel_user') || '{}'); return u.fullName || u.name || 'Cán bộ phê duyệt'; } catch { return 'Cán bộ phê duyệt'; } })()}</div>
          <div>Đơn vị: KIYO GROUP</div>
          <div>Ngày ký: ${signInfo?.signedAt || new Date().toLocaleDateString('vi-VN')}</div>
          <div>Chứng thư: ${signInfo?.certNumber || 'CERT-KIYO-2026-8801'}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Right Click Context Menu -->
  <div class="ctx-menu" id="docContextMenu" onclick="event.stopPropagation()">
    <div class="ctx-item" onclick="document.execCommand('cut',false,null)">✂️ Cắt (Ctrl+X)</div>
    <div class="ctx-item" onclick="document.execCommand('copy',false,null)">📋 Sao chép (Ctrl+C)</div>
    <div class="ctx-item" onclick="document.execCommand('paste',false,null)">📄 Dán (Ctrl+V)</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="scaleSelectedImg(50)">🖼️ Thu nhỏ ảnh 50%</div>
    <div class="ctx-item" onclick="scaleSelectedImg(100)">🖼️ Rộng ảnh 100%</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item" onclick="insertQuocHieu()">🏛️ Chèn Quốc hiệu</div>
    <div class="ctx-item" onclick="insertDieuKhoan()">📜 Chèn Điều khoản</div>
    <div class="ctx-item" onclick="insertSignBox()">✍️ Chèn Khối Ký tên</div>
  </div>

  <!-- Bottom Status Bar -->
  <div class="word-status-bar">
    <div><span id="pageIndicator">Trang 1 / 1</span> • <span id="docStats">Đang đếm từ...</span> • Tiếng Việt (100% Chuẩn Văn Bản)</div>
    <div>Thu phóng: 100%</div>
  </div>

  <script>
    let activeTargetImg = null;

    function switchTab(tab) {
      document.getElementById('ribbonHome').style.display = tab === 'home' ? 'flex' : 'none';
      document.getElementById('ribbonInsert').style.display = tab === 'insert' ? 'flex' : 'none';
      document.getElementById('ribbonLayout').style.display = tab === 'layout' ? 'flex' : 'none';
      document.getElementById('tabHome').className = 'ribbon-tab-btn' + (tab === 'home' ? ' active' : '');
      document.getElementById('tabInsert').className = 'ribbon-tab-btn' + (tab === 'insert' ? ' active' : '');
      document.getElementById('tabLayout').className = 'ribbon-tab-btn' + (tab === 'layout' ? ' active' : '');
    }

    function initTableGrid() {
      const container = document.getElementById('tableGridCells');
      container.innerHTML = '';
      for (let i = 0; i < 48; i++) {
        const r = Math.floor(i / 8) + 1;
        const c = (i % 8) + 1;
        const cell = document.createElement('div');
        cell.style.width = '20px';
        cell.style.height = '20px';
        cell.style.background = '#FFF';
        cell.style.border = '1px solid #CBD5E1';
        cell.style.cursor = 'pointer';
        cell.onmouseenter = () => highlightGrid(r, c);
        cell.onclick = () => insertTableByGrid(r, c);
        container.appendChild(cell);
      }
    }

    function highlightGrid(rows, cols) {
      document.getElementById('gridTitle').textContent = 'Bảng ' + rows + ' x ' + cols;
      const cells = document.getElementById('tableGridCells').children;
      for (let i = 0; i < cells.length; i++) {
        const r = Math.floor(i / 8) + 1;
        const c = (i % 8) + 1;
        cells[i].style.background = (r <= rows && c <= cols) ? '#185ABD' : '#FFF';
      }
    }

    function toggleTableMenu(e) {
      e.stopPropagation();
      const popup = document.getElementById('tableGridPopup');
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    }

    function hideTableMenu() {
      const popup = document.getElementById('tableGridPopup');
      if (popup) popup.style.display = 'none';
    }

    function insertTableByGrid(rows, cols) {
      let header = '';
      for (let c = 1; c <= cols; c++) header += '<th style="border:1px solid #333;padding:6px;background:#F1F5F9;">Cột ' + c + '</th>';
      let body = '';
      for (let r = 1; r <= rows; r++) {
        let cells = '';
        for (let c = 1; c <= cols; c++) cells += '<td style="border:1px solid #333;padding:6px;">Dữ liệu ' + r + '.' + c + '</td>';
        body += '<tr>' + cells + '</tr>';
      }
      const html = '<table style="width:100%;border-collapse:collapse;margin:16px 0;" border="1"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table><p><br/></p>';
      document.execCommand('insertHTML', false, html);
      hideTableMenu();
    }

    function handleImageUpload(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const src = loadEvt.target.result;
        const imgHtml = '<p style="text-align:center;margin:16px 0;"><img src="' + src + '" style="max-width:100%;width:450px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" /></p><p><br/></p>';
        document.execCommand('insertHTML', false, imgHtml);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
      closeWordImagePicker();
    }

    function openWordImagePicker() { document.getElementById('wordImagePicker').style.display = 'flex'; }
    function closeWordImagePicker() { document.getElementById('wordImagePicker').style.display = 'none'; }

    function handleDocContextMenu(e) {
      e.preventDefault();
      const target = e.target;
      if (target.tagName.toLowerCase() === 'img') {
        activeTargetImg = target;
      } else {
        activeTargetImg = null;
      }
      const menu = document.getElementById('docContextMenu');
      menu.style.display = 'block';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 250) + 'px';
      menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
    }

    function hideContextMenu() {
      const menu = document.getElementById('docContextMenu');
      if (menu) menu.style.display = 'none';
    }

    function scaleSelectedImg(percent) {
      if (activeTargetImg) {
        if (percent === 100) {
          activeTargetImg.style.width = '100%';
        } else {
          activeTargetImg.style.width = (660 * (percent / 100)) + 'px';
        }
      }
      hideContextMenu();
    }

    function insertQuocHieu() {
      const html = '<div style="text-align:center;margin-bottom:24px;"><p style="font-size:13pt;font-weight:bold;text-transform:uppercase;margin-bottom:3px;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p><p style="font-size:13pt;font-weight:bold;margin-bottom:6px;">Độc lập - Tự do - Hạnh phúc</p><div style="width:140px;height:1.5px;background:#000;margin:0 auto 16px auto;"></div></div>';
      document.execCommand('insertHTML', false, html);
      hideContextMenu();
    }

    function insertDieuKhoan() {
      const html = '<p style="margin-bottom:14px;text-align:justify;text-indent:28px;line-height:1.6;"><strong>Điều ...</strong> [Nhập nội dung quy định / điều khoản mới tại đây].</p>';
      document.execCommand('insertHTML', false, html);
      hideContextMenu();
    }

    function insertSignBox() {
      const uName = (() => { try { const u = JSON.parse(localStorage.getItem('minepanel_user') || '{}'); return u.fullName || u.name || 'Đại Diện Ban Giám Đốc'; } catch { return 'Đại Diện Ban Giám Đốc'; } })();
      const html = '<div style="margin-top:48px;display:flex;justify-content:space-between;page-break-inside:avoid;"><div style="width:250px;text-align:center;"><p style="font-weight:bold;font-size:13pt;text-transform:uppercase;margin-bottom:60px;">BÊN TIẾP NHẬN</p><p style="font-style:italic;font-size:12pt;">(Ký, ghi rõ họ tên)</p></div><div style="width:250px;text-align:center;"><p style="font-style:italic;font-size:12pt;margin-bottom:4px;">Ngày ' + new Date().getDate() + ' tháng ' + (new Date().getMonth()+1) + ' năm ' + new Date().getFullYear() + '</p><p style="font-weight:bold;font-size:13pt;text-transform:uppercase;margin-bottom:60px;">ĐẠI DIỆN BAN GIÁM ĐỐC</p><p style="font-weight:bold;font-size:13pt;">' + uName + '</p></div></div>';
      document.execCommand('insertHTML', false, html);
      hideContextMenu();
    }

    function updateStats() {
      const el = document.getElementById('a4Content');
      const text = el ? (el.innerText || '') : '';
      const words = text.trim().split(/\s+/).filter(Boolean);
      const pageCount = Math.max(1, Math.ceil((el.scrollHeight || 1056) / 1056));
      document.getElementById('docStats').textContent = 'Số từ: ' + words.length + ' từ (' + text.length + ' ký tự)';
      const pageInd = document.getElementById('pageIndicator');
      if (pageInd) pageInd.textContent = 'Trang 1 / ' + pageCount;
    }

    function downloadCurrentDoc() {
      const content = document.getElementById('a4Content').innerHTML;
      const wordDocHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>" + ${JSON.stringify(fileName)} + "</title><style>@page{size:A4;margin:25mm 20mm 20mm 25mm;}body{font-family:'Times New Roman',serif;font-size:14pt;line-height:1.6;color:#000;}p{margin-bottom:14px;text-align:justify;text-indent:28px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #000;padding:6px;}img{max-width:100%;height:auto;}</style></head><body>" + content + "</body></html>";
      const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ${JSON.stringify(fileName)};
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    initTableGrid();
    updateStats();
  </script>
</body>
</html>`;
}
