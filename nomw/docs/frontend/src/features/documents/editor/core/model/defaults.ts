import {
  DocumentModelData,
  DocumentSettings,
  ParagraphStyle,
  TextMarks,
  ParagraphPreset,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  ImageBlock,
} from './types';
import { generateBlockId, generateRunId } from '../utils/id-generator';
import { PAPER_SIZES } from '../utils/units';

export const DEFAULT_FONT_FAMILY = 'Times New Roman';
export const DEFAULT_FONT_SIZE = 14; // 14pt (standard Vietnamese document size)
export const DEFAULT_FOREGROUND_COLOR = '#202124';
export const DEFAULT_LINE_HEIGHT = 1.25;

export const DEFAULT_SETTINGS: DocumentSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: {
    top: 72, // 1 inch (72 pt / 96 px default or 72 px)
    bottom: 72,
    left: 72,
    right: 72,
  },
  pageColor: '#FFFFFF',
};

export const DEFAULT_TEXT_MARKS: TextMarks = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  foregroundColor: DEFAULT_FOREGROUND_COLOR,
};

export const DEFAULT_PARAGRAPH_STYLE: ParagraphStyle = {
  alignment: 'left',
  lineHeight: DEFAULT_LINE_HEIGHT,
  spaceBefore: 0,
  spaceAfter: 6,
  indentStart: 0,
  indentEnd: 0,
  firstLineIndent: 0,
  direction: 'ltr',
};

export const PARAGRAPH_PRESETS: Record<
  ParagraphPreset,
  { name: string; marks: TextMarks; style: ParagraphStyle }
> = {
  normal: {
    name: 'Văn bản thường',
    marks: { fontSize: 14, bold: false, foregroundColor: '#202124' },
    style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 0, spaceAfter: 6 },
  },
  title: {
    name: 'Tiêu đề lớn',
    marks: { fontSize: 26, bold: false, foregroundColor: '#202124' },
    style: { alignment: 'left', lineHeight: 1.2, spaceBefore: 12, spaceAfter: 8 },
  },
  subtitle: {
    name: 'Phụ đề',
    marks: { fontSize: 15, bold: false, foregroundColor: '#5F6368' },
    style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 0, spaceAfter: 12 },
  },
  h1: {
    name: 'Tiêu đề 1',
    marks: { fontSize: 20, bold: true, foregroundColor: '#202124' },
    style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 14, spaceAfter: 6 },
  },
  h2: {
    name: 'Tiêu đề 2',
    marks: { fontSize: 16, bold: true, foregroundColor: '#202124' },
    style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 12, spaceAfter: 4 },
  },
  h3: {
    name: 'Tiêu đề 3',
    marks: { fontSize: 13, bold: true, foregroundColor: '#3C4043' },
    style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 10, spaceAfter: 4 },
  },
};

export function createEmptyParagraph(preset: ParagraphPreset = 'normal'): ParagraphBlock {
  const cfg = PARAGRAPH_PRESETS[preset] || PARAGRAPH_PRESETS.normal;
  return {
    id: generateBlockId('paragraph'),
    type: 'paragraph',
    style: { ...DEFAULT_PARAGRAPH_STYLE, ...cfg.style },
    runs: [
      {
        id: generateRunId(),
        text: '',
        marks: { ...DEFAULT_TEXT_MARKS, ...cfg.marks },
      },
    ],
  };
}

export function createParagraphWithText(
  text: string,
  preset: ParagraphPreset = 'normal',
  marks?: TextMarks
): ParagraphBlock {
  const cfg = PARAGRAPH_PRESETS[preset] || PARAGRAPH_PRESETS.normal;
  return {
    id: generateBlockId('paragraph'),
    type: 'paragraph',
    style: { ...DEFAULT_PARAGRAPH_STYLE, ...cfg.style },
    runs: [
      {
        id: generateRunId(),
        text,
        marks: { ...DEFAULT_TEXT_MARKS, ...cfg.marks, ...marks },
      },
    ],
  };
}

export function createHeading(level: 1 | 2 | 3, text: string = ''): HeadingBlock {
  const presetKey: ParagraphPreset = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  const cfg = PARAGRAPH_PRESETS[presetKey];
  return {
    id: generateBlockId('heading'),
    type: 'heading',
    level,
    style: { ...DEFAULT_PARAGRAPH_STYLE, ...cfg.style },
    runs: [
      {
        id: generateRunId(),
        text,
        marks: { ...DEFAULT_TEXT_MARKS, ...cfg.marks },
      },
    ],
  };
}

export function createListItem(
  listType: 'bullet' | 'numbered' | 'checklist',
  text: string = '',
  level: number = 0
): ListItemBlock {
  return {
    id: generateBlockId('list'),
    type: 'list-item',
    listStyle: { listType, level, checked: false },
    style: { ...DEFAULT_PARAGRAPH_STYLE, spaceBefore: 0, spaceAfter: 3 },
    runs: [
      {
        id: generateRunId(),
        text,
        marks: { ...DEFAULT_TEXT_MARKS },
      },
    ],
  };
}

export function createTable(rowsCount: number, colsCount: number, totalWidth: number = 600): TableBlock {
  const colWidth = Math.floor(totalWidth / Math.max(1, colsCount));
  const columns = Array.from({ length: colsCount }, () => ({ width: colWidth }));
  const rows = Array.from({ length: rowsCount }, () => ({
    id: generateBlockId('row'),
    cells: Array.from({ length: colsCount }, () => ({
      id: generateBlockId('cell'),
      width: colWidth,
      blocks: [createEmptyParagraph()],
      style: {
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 8,
        paddingRight: 8,
        borderColor: '#D1D5DB',
        borderWidth: 1,
        verticalAlign: 'top' as const,
      },
    })),
  }));

  return {
    id: generateBlockId('table'),
    type: 'table',
    columns,
    rows,
    style: { alignment: 'left', borderColor: '#D1D5DB', borderWidth: 1 },
  };
}

export function createImageBlock(src: string, width = 300, height = 200, alt = ''): ImageBlock {
  return {
    id: generateBlockId('image'),
    type: 'image',
    src,
    width,
    height,
    alt,
    alignment: 'center',
  };
}

export function createInitialDocument(id: string, title = 'Văn bản chưa đặt tên'): DocumentModelData {
  return {
    schemaVersion: 1,
    id,
    title,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    },
    blocks: [createEmptyParagraph('normal')],
  };
}
