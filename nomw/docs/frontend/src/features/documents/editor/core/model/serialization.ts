import {
  DocumentModelData,
  BlockNode,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  ImageBlock,
  HorizontalRuleBlock,
  PageBreakBlock,
  TextRun,
  TextMarks,
  ParagraphStyle,
} from './types';
import {
  createInitialDocument,
  DEFAULT_TEXT_MARKS,
  DEFAULT_PARAGRAPH_STYLE,
  createEmptyParagraph,
  createParagraphWithText,
} from './defaults';
import { generateBlockId, generateRunId } from '../utils/id-generator';
import { DocumentModel } from './document-model';

export function serializeDocument(doc: DocumentModelData): string {
  return JSON.stringify(doc);
}

export function deserializeDocument(jsonStr: string): DocumentModelData {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return createInitialDocument(generateBlockId('doc'));
    }
    return migrateDocumentSchema(parsed);
  } catch (e) {
    console.error('Failed to deserialize document JSON, creating empty fallback:', e);
    return createInitialDocument(generateBlockId('doc'));
  }
}

export function migrateDocumentSchema(data: any): DocumentModelData {
  if (!data) return createInitialDocument(generateBlockId('doc'));

  let current = { ...data };
  if (!current.schemaVersion) {
    current.schemaVersion = 1;
  }

  return validateDocumentData(current);
}

export function validateDocumentData(data: any): DocumentModelData {
  const fallback = createInitialDocument(data.id || generateBlockId('doc'), data.title || 'Văn bản chưa đặt tên');

  const validDoc: DocumentModelData = {
    schemaVersion: Number(data.schemaVersion) || 1,
    id: String(data.id || fallback.id),
    title: String(data.title || fallback.title),
    revision: Number(data.revision) || 1,
    settings: {
      pageSize: data.settings?.pageSize || fallback.settings.pageSize,
      orientation: data.settings?.orientation || fallback.settings.orientation,
      margins: {
        top: Number(data.settings?.margins?.top ?? fallback.settings.margins.top),
        bottom: Number(data.settings?.margins?.bottom ?? fallback.settings.margins.bottom),
        left: Number(data.settings?.margins?.left ?? fallback.settings.margins.left),
        right: Number(data.settings?.margins?.right ?? fallback.settings.margins.right),
      },
      pageColor: String(data.settings?.pageColor || fallback.settings.pageColor),
    },
    metadata: {
      createdAt: String(data.metadata?.createdAt || fallback.metadata.createdAt),
      updatedAt: String(data.metadata?.updatedAt || fallback.metadata.updatedAt),
      version: Number(data.metadata?.version || 1),
    },
    blocks: Array.isArray(data.blocks) && data.blocks.length > 0 ? data.blocks : fallback.blocks,
  };

  return validDoc;
}

/**
 * Converts plain text string into DocumentModelData
 */
export function plainTextToDocumentModel(text: string, title?: string): DocumentModelData {
  const doc = createInitialDocument(generateBlockId('doc'), title || 'Văn bản thô');
  const lines = text.split(/\r?\n/);
  const blocks: BlockNode[] = [];

  for (const line of lines) {
    blocks.push(createParagraphWithText(line));
  }

  doc.blocks = blocks.length > 0 ? blocks : [createEmptyParagraph()];
  return doc;
}

function parseHtmlFallback(html: string): BlockNode[] {
  const blocks: BlockNode[] = [];

  const parseInlineRuns = (content: string): TextRun[] => {
    const runs: TextRun[] = [];
    const inlineRegex = /<(strong|b|em|i|u|s|strike)([^>]*)>([\s\S]*?)<\/\1>|([^<]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = inlineRegex.exec(content)) !== null) {
      if (m[4]) {
        const text = m[4];
        if (text) runs.push({ id: generateRunId(), text, marks: {} });
      } else {
        const tag = m[1].toLowerCase();
        const inner = m[3];
        const marks: TextMarks = {};
        if (tag === 'b' || tag === 'strong') marks.bold = true;
        if (tag === 'i' || tag === 'em') marks.italic = true;
        if (tag === 'u') marks.underline = true;
        if (tag === 's' || tag === 'strike') marks.strike = true;

        if (inner.includes('<')) {
          const nested = parseInlineRuns(inner);
          for (const nr of nested) {
            runs.push({
              id: generateRunId(),
              text: nr.text,
              marks: { ...nr.marks, ...marks },
            });
          }
        } else {
          runs.push({ id: generateRunId(), text: inner, marks });
        }
      }
    }
    return DocumentModel.normalizeRuns(runs.length > 0 ? runs : [{ id: generateRunId(), text: content.replace(/<[^>]+>/g, ''), marks: {} }]);
  };

  const blockRegex = /<(h[1-6]|p|li|blockquote|div|hr|table|img)([^>]*)>([\s\S]*?)<\/\1>|<(hr|img)([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = (match[1] || match[4] || '').toLowerCase();
    const attrs = match[2] || match[5] || '';
    const content = match[3] || '';

    if (tag.startsWith('h')) {
      const parsedLevel = parseInt(tag[1], 10) || 1;
      const level = Math.min(5, Math.max(1, parsedLevel)) as 1 | 2 | 3 | 4 | 5;
      blocks.push({
        id: generateBlockId('h'),
        type: 'heading',
        level,
        style: { ...DEFAULT_PARAGRAPH_STYLE },
        runs: parseInlineRuns(content),
      });
    } else if (tag === 'li') {
      blocks.push({
        id: generateBlockId('li'),
        type: 'list-item',
        listStyle: { listType: 'bullet', level: 0 },
        style: { ...DEFAULT_PARAGRAPH_STYLE },
        runs: parseInlineRuns(content),
      });
    } else if (tag === 'hr') {
      blocks.push({ id: generateBlockId('hr'), type: 'horizontal-rule' });
    } else {
      blocks.push({
        id: generateBlockId('para'),
        type: 'paragraph',
        style: { ...DEFAULT_PARAGRAPH_STYLE },
        runs: parseInlineRuns(content),
      });
    }
  }

  return blocks;
}

/**
 * Converts rich HTML content into DocumentModelData with full fidelity
 */
export function htmlToDocumentModel(html: string, title?: string): DocumentModelData {
  const doc = createInitialDocument(generateBlockId('doc'), title || 'Tài liệu không tên');

  if (!html || !html.trim()) {
    return doc;
  }

  // Check if string is already raw JSON
  if (html.trim().startsWith('{') && html.includes('"blocks"')) {
    try {
      return deserializeDocument(html);
    } catch {}
  }

  if (typeof DOMParser === 'undefined') {
    const fallbackBlocks = parseHtmlFallback(html);
    if (fallbackBlocks.length > 0) {
      doc.blocks = fallbackBlocks;
      return doc;
    }
    return plainTextToDocumentModel(html, title);
  }

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');
  const body = parsedDoc.body;

  const blocks: BlockNode[] = [];

  const extractMarksFromElement = (el: HTMLElement, parentMarks: TextMarks = {}): TextMarks => {
    const marks: TextMarks = { ...parentMarks };
    const tag = el.tagName.toLowerCase();

    if (['b', 'strong'].includes(tag)) marks.bold = true;
    if (['i', 'em'].includes(tag)) marks.italic = true;
    if (['u', 'ins'].includes(tag)) marks.underline = true;
    if (['s', 'strike', 'del'].includes(tag)) marks.strike = true;
    if (tag === 'a') marks.link = el.getAttribute('href') || undefined;

    // Inline style overrides
    const style = el.style;
    if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) marks.bold = true;
    if (style.fontStyle === 'italic') marks.italic = true;
    if (style.textDecoration?.includes('underline')) marks.underline = true;
    if (style.textDecoration?.includes('line-through')) marks.strike = true;

    if (style.color) marks.foregroundColor = style.color;
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      marks.backgroundColor = style.backgroundColor;
    }
    if (style.fontFamily) {
      marks.fontFamily = style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
    }
    if (style.fontSize) {
      const match = style.fontSize.match(/([0-9.]+)(pt|px)?/);
      if (match) {
        let size = parseFloat(match[1]);
        if (match[2] === 'px') size = Math.round((size * 72) / 96);
        if (size >= 6 && size <= 144) marks.fontSize = size;
      }
    }

    return marks;
  };

  const collectRuns = (node: Node, currentMarks: TextMarks = {}): TextRun[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return [];
      return [{ id: generateRunId(), text, marks: { ...currentMarks } }];
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        return [{ id: generateRunId(), text: '\n', marks: { ...currentMarks } }];
      }

      const combinedMarks = extractMarksFromElement(el, currentMarks);
      const runs: TextRun[] = [];

      for (const child of Array.from(el.childNodes)) {
        runs.push(...collectRuns(child, combinedMarks));
      }
      return runs;
    }

    return [];
  };

  const extractParagraphStyle = (el: HTMLElement): ParagraphStyle => {
    const style = el.style;
    const paraStyle: ParagraphStyle = { ...DEFAULT_PARAGRAPH_STYLE };

    if (style.textAlign) {
      const align = style.textAlign.toLowerCase();
      if (['left', 'center', 'right', 'justify'].includes(align)) {
        paraStyle.alignment = align as any;
      }
    }

    if (style.lineHeight) {
      const lh = parseFloat(style.lineHeight);
      if (!isNaN(lh) && lh >= 0.8 && lh <= 3.0) {
        paraStyle.lineHeight = lh;
      }
    }

    if (style.marginBottom) {
      const mb = parseFloat(style.marginBottom);
      if (!isNaN(mb)) paraStyle.spaceAfter = mb;
    }
    if (style.marginTop) {
      const mt = parseFloat(style.marginTop);
      if (!isNaN(mt)) paraStyle.spaceBefore = mt;
    }
    if (style.textIndent) {
      const ti = parseFloat(style.textIndent);
      if (!isNaN(ti)) paraStyle.firstLineIndent = ti;
    }
    if (style.marginLeft) {
      const ml = parseFloat(style.marginLeft);
      if (!isNaN(ml)) paraStyle.indentStart = ml;
    }
    if (style.marginRight) {
      const mr = parseFloat(style.marginRight);
      if (!isNaN(mr)) paraStyle.indentEnd = mr;
    }

    return paraStyle;
  };

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        blocks.push(createParagraphWithText(text));
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Check for explicit page break
    if (
      el.style.pageBreakAfter === 'always' ||
      el.classList.contains('docx-page-break') ||
      el.getAttribute('data-page-break') === 'true'
    ) {
      blocks.push({ id: generateBlockId('pb'), type: 'page-break' } as PageBreakBlock);
      return;
    }

    if (tag === 'hr') {
      blocks.push({ id: generateBlockId('hr'), type: 'horizontal-rule' } as HorizontalRuleBlock);
      return;
    }

    if (tag === 'img') {
      const img = el as HTMLImageElement;
      blocks.push({
        id: generateBlockId('img'),
        type: 'image',
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        width: parseInt(img.style.width || String(img.width || 300), 10) || 300,
        height: parseInt(img.style.height || String(img.height || 200), 10) || 200,
        alignment: 'center',
      } as ImageBlock);
      return;
    }

    if (tag === 'table') {
      const rows: any[] = [];
      const trs = Array.from(el.querySelectorAll('tr'));
      let maxCols = 0;
      const isTableBorderNone = el.style.border === 'none' || el.getAttribute('border') === '0';

      for (const tr of trs) {
        const cells: any[] = [];
        const tds = Array.from(tr.querySelectorAll('td, th'));
        if (tds.length > maxCols) maxCols = tds.length;

        for (const td of tds) {
          const tdEl = td as HTMLElement;
          const isCellBorderNone = isTableBorderNone || tdEl.style.border === 'none' || tdEl.getAttribute('border') === '0';
          const cellBlocks: BlockNode[] = [];
          const childElements = Array.from(tdEl.children) as HTMLElement[];
          const paraElements = childElements.filter(c => ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(c.tagName.toLowerCase()));

          if (paraElements.length > 0) {
            for (const pEl of paraElements) {
              const pRuns = collectRuns(pEl);
              const pStyle = extractParagraphStyle(pEl);
              if (!pEl.style.textAlign && tdEl.style.textAlign) {
                pStyle.alignment = tdEl.style.textAlign.toLowerCase() as any;
              }
              cellBlocks.push({
                id: generateBlockId('para'),
                type: 'paragraph',
                style: pStyle,
                runs: DocumentModel.normalizeRuns(pRuns),
              });
            }
          } else {
            const cellRuns = collectRuns(tdEl);
            const cellStyle = extractParagraphStyle(tdEl);
            cellBlocks.push({
              id: generateBlockId('para'),
              type: 'paragraph',
              style: cellStyle,
              runs: DocumentModel.normalizeRuns(cellRuns),
            });
          }

          if (cellBlocks.length === 0) {
            cellBlocks.push({
              id: generateBlockId('para'),
              type: 'paragraph',
              style: { ...DEFAULT_PARAGRAPH_STYLE },
              runs: [{ id: generateRunId(), text: '', marks: {} }],
            });
          }

          cells.push({
            id: generateBlockId('cell'),
            colSpan: 1,
            rowSpan: 1,
            blocks: cellBlocks,
            style: {
              border: isCellBorderNone ? 'none' : undefined,
              backgroundColor: tdEl.style.backgroundColor && tdEl.style.backgroundColor !== 'transparent' ? tdEl.style.backgroundColor : undefined,
            },
          });
        }
        rows.push({ id: generateBlockId('row'), cells });
      }

      const totalContentWidth = 650;
      const colWidth = Math.floor(totalContentWidth / Math.max(1, maxCols));
      const columns = Array.from({ length: Math.max(1, maxCols) }).map(() => ({
        width: colWidth,
      }));

      blocks.push({
        id: generateBlockId('tbl'),
        type: 'table',
        rows,
        columns,
        style: {
          border: isTableBorderNone ? 'none' : undefined,
        },
      } as TableBlock);
      return;
    }

    if (['ul', 'ol'].includes(tag)) {
      const isNumbered = tag === 'ol';
      const lis = Array.from(el.querySelectorAll('li'));
      for (const li of lis) {
        const runs = collectRuns(li);
        blocks.push({
          id: generateBlockId('list'),
          type: 'list-item',
          style: extractParagraphStyle(li),
          runs: DocumentModel.normalizeRuns(runs),
          listStyle: {
            listType: isNumbered ? 'numbered' : 'bullet',
            level: 0,
          },
        } as ListItemBlock);
      }
      return;
    }

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      const level = parseInt(tag.charAt(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const runs = collectRuns(el, { bold: true, fontSize: 18 - (level - 1) * 2 });
      blocks.push({
        id: generateBlockId('head'),
        type: 'heading',
        level,
        style: extractParagraphStyle(el),
        runs: DocumentModel.normalizeRuns(runs),
      } as HeadingBlock);
      return;
    }

    // Check if element is a block container holding child block elements
    const isContainer = ['div', 'section', 'article', 'main', 'header', 'footer', 'blockquote'].includes(tag);
    const hasBlockChildren = isContainer && Array.from(el.children).some(child =>
      ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'ul', 'ol', 'hr', 'img', 'section', 'article'].includes(child.tagName.toLowerCase())
    );

    if (hasBlockChildren) {
      for (const child of Array.from(el.childNodes)) {
        processNode(child);
      }
      return;
    }

    // Default paragraph / single div / inline wrapper
    const runs = collectRuns(el);
    if (runs.length > 0) {
      blocks.push({
        id: generateBlockId('para'),
        type: 'paragraph',
        style: extractParagraphStyle(el),
        runs: DocumentModel.normalizeRuns(runs),
      } as ParagraphBlock);
    }
  };

  // Top level traversal
  for (const child of Array.from(body.childNodes)) {
    processNode(child);
  }

  if (blocks.length === 0) {
    blocks.push(createEmptyParagraph());
  }

  doc.blocks = blocks;
  return doc;
}

/**
 * Converts DocumentModel into standard semantic HTML string
 */
export function documentModelToHtml(docOrData: DocumentModelData | DocumentModel): string {
  const docData: DocumentModelData = 'data' in docOrData ? (docOrData as DocumentModel).data : docOrData;
  const blocks = docData.blocks || [];

  const escapeHtml = (text: string): string =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const renderRun = (run: TextRun): string => {
    let text = escapeHtml(run.text);
    if (text === '') return '';

    const marks = run.marks || {};
    if (marks.bold) text = `<strong>${text}</strong>`;
    if (marks.italic) text = `<em>${text}</em>`;
    if (marks.underline) text = `<u>${text}</u>`;
    if (marks.strike) text = `<s>${text}</s>`;

    const styles: string[] = [];
    if (marks.foregroundColor && marks.foregroundColor !== DEFAULT_TEXT_MARKS.foregroundColor) {
      styles.push(`color: ${marks.foregroundColor}`);
    }
    if (marks.backgroundColor) {
      styles.push(`background-color: ${marks.backgroundColor}`);
    }
    if (marks.fontFamily && marks.fontFamily !== DEFAULT_TEXT_MARKS.fontFamily) {
      styles.push(`font-family: '${marks.fontFamily}', sans-serif`);
    }
    if (marks.fontSize && marks.fontSize !== DEFAULT_TEXT_MARKS.fontSize) {
      styles.push(`font-size: ${marks.fontSize}pt`);
    }

    if (styles.length > 0) {
      text = `<span style="${styles.join('; ')}">${text}</span>`;
    }

    if (marks.link) {
      text = `<a href="${escapeHtml(marks.link)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }

    return text;
  };

  const renderParagraphStyle = (style?: ParagraphStyle): string => {
    if (!style) return '';
    const rules: string[] = [];
    if (style.alignment && style.alignment !== 'left') {
      rules.push(`text-align: ${style.alignment}`);
    }
    if (style.lineHeight && style.lineHeight !== DEFAULT_PARAGRAPH_STYLE.lineHeight) {
      rules.push(`line-height: ${style.lineHeight}`);
    }
    if (style.spaceBefore) {
      rules.push(`margin-top: ${style.spaceBefore}px`);
    }
    if (style.spaceAfter) {
      rules.push(`margin-bottom: ${style.spaceAfter}px`);
    }
    if (style.firstLineIndent) {
      rules.push(`text-indent: ${style.firstLineIndent}px`);
    }
    if (style.indentStart) {
      rules.push(`padding-left: ${style.indentStart}px`);
    }
    return rules.length > 0 ? ` style="${rules.join('; ')}"` : '';
  };

  const output: string[] = [];
  let inList: 'numbered' | 'bullet' | null = null;

  for (const block of blocks) {
    if (block.type === 'page-break') {
      if (inList) {
        output.push(inList === 'numbered' ? '</ol>' : '</ul>');
        inList = null;
      }
      output.push('<div class="docx-page-break" style="page-break-after: always;"></div>');
      continue;
    }

    if (block.type === 'horizontal-rule') {
      if (inList) {
        output.push(inList === 'numbered' ? '</ol>' : '</ul>');
        inList = null;
      }
      output.push('<hr style="border: none; border-top: 1px solid #CBD5E1; margin: 16px 0;" />');
      continue;
    }

    if (block.type === 'image') {
      if (inList) {
        output.push(inList === 'numbered' ? '</ol>' : '</ul>');
        inList = null;
      }
      const img = block as ImageBlock;
      output.push(
        `<p style="text-align: ${img.alignment || 'center'}; margin: 12px 0;"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || '')}" width="${img.width || 300}" height="${img.height || 200}" style="max-width: 100%; border-radius: 4px;" /></p>`
      );
      continue;
    }

    if (block.type === 'table') {
      if (inList) {
        output.push(inList === 'numbered' ? '</ol>' : '</ul>');
        inList = null;
      }
      const tbl = block as TableBlock;
      const rowsHtml: string[] = [];

      for (const row of tbl.rows) {
        const cellsHtml: string[] = [];
        for (const cell of row.cells) {
          const cellContent = cell.blocks.map((cb) => ('runs' in cb ? cb.runs.map(renderRun).join('') : '')).join('<br/>');
          cellsHtml.push(`<td style="border: 1px solid #CBD5E1; padding: 6px 10px; min-width: 60px;">${cellContent || '<br/>'}</td>`);
        }
        rowsHtml.push(`<tr>${cellsHtml.join('')}</tr>`);
      }

      output.push(`<table style="border-collapse: collapse; width: 100%; margin: 12px 0;"><tbody>${rowsHtml.join('')}</tbody></table>`);
      continue;
    }

    if (block.type === 'list-item') {
      const listBlock = block as ListItemBlock;
      const listType = listBlock.listStyle.listType;
      const targetList = listType === 'numbered' ? 'numbered' : 'bullet';

      if (inList !== targetList) {
        if (inList) output.push(inList === 'numbered' ? '</ol>' : '</ul>');
        output.push(targetList === 'numbered' ? '<ol style="padding-left: 24px; margin: 4px 0;">' : '<ul style="padding-left: 24px; margin: 4px 0;">');
        inList = targetList;
      }

      const runsHtml = listBlock.runs.map(renderRun).join('') || '<br/>';
      output.push(`<li>${runsHtml}</li>`);
      continue;
    }

    // Close open list if exiting
    if (inList) {
      output.push(inList === 'numbered' ? '</ol>' : '</ul>');
      inList = null;
    }

    if (block.type === 'heading') {
      const heading = block as HeadingBlock;
      const level = heading.level || 1;
      const runsHtml = heading.runs.map(renderRun).join('') || '<br/>';
      output.push(`<h${level}${renderParagraphStyle(heading.style)}>${runsHtml}</h${level}>`);
      continue;
    }

    if (block.type === 'paragraph') {
      const para = block as ParagraphBlock;
      const runsHtml = para.runs.map(renderRun).join('') || '<br/>';
      output.push(`<p${renderParagraphStyle(para.style)}>${runsHtml}</p>`);
      continue;
    }
  }

  if (inList) {
    output.push(inList === 'numbered' ? '</ol>' : '</ul>');
  }

  return output.join('\n');
}
