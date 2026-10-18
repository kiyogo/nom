import { PaperSize } from '../utils/units';

export interface TextMarks {
  fontFamily?: string;
  fontSize?: number; // in points (e.g. 11, 12, 14, 16)
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  foregroundColor?: string; // e.g. '#202124'
  backgroundColor?: string; // highlight color
  link?: string;
}

export interface TextRun {
  id: string;
  text: string;
  marks: TextMarks;
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface ParagraphStyle {
  alignment?: TextAlignment;
  lineHeight?: number; // multiplier, e.g. 1.15, 1.25, 1.5, 2.0
  spaceBefore?: number; // in points/px
  spaceAfter?: number; // in points/px
  indentStart?: number; // left indent in points/px
  indentEnd?: number; // right indent in points/px
  firstLineIndent?: number; // first line indent in points/px
  direction?: 'ltr' | 'rtl' | 'auto';
}

export type ListType = 'bullet' | 'numbered' | 'checklist';

export interface ListStyle {
  listType: ListType;
  level: number; // 0-indexed
  checked?: boolean; // for checklist
  startIndex?: number; // for custom numbered starting values
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type ParagraphPreset = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3';

export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  style: ParagraphStyle;
  runs: TextRun[];
}

export interface HeadingBlock {
  id: string;
  type: 'heading';
  level: HeadingLevel;
  style: ParagraphStyle;
  runs: TextRun[];
}

export interface ListItemBlock {
  id: string;
  type: 'list-item';
  listStyle: ListStyle;
  style: ParagraphStyle;
  runs: TextRun[];
}

export interface CellStyle {
  backgroundColor?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface TableCell {
  id: string;
  colSpan?: number;
  rowSpan?: number;
  width?: number; // explicit width in px
  style?: CellStyle;
  blocks: BlockNode[]; // usually ParagraphBlocks
}

export interface TableRow {
  id: string;
  height?: number;
  cells: TableCell[];
}

export interface TableColumn {
  width: number; // in px
}

export interface TableStyle {
  alignment?: 'left' | 'center' | 'right';
  borderColor?: string;
  borderWidth?: number;
}

export interface TableBlock {
  id: string;
  type: 'table';
  rows: TableRow[];
  columns: TableColumn[];
  style?: TableStyle;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  fileId?: string;
  src: string;
  width: number; // display width in px
  height: number; // display height in px
  originalWidth?: number;
  originalHeight?: number;
  alt?: string;
  alignment: 'left' | 'center' | 'right';
}

export interface HorizontalRuleBlock {
  id: string;
  type: 'horizontal-rule';
}

export interface PageBreakBlock {
  id: string;
  type: 'page-break';
}

export type BlockNode =
  | ParagraphBlock
  | HeadingBlock
  | ListItemBlock
  | TableBlock
  | ImageBlock
  | HorizontalRuleBlock
  | PageBreakBlock;

export interface PageMargins {
  top: number; // in px (or points converted to px)
  bottom: number;
  left: number;
  right: number;
}

export interface DocumentSettings {
  pageSize: PaperSize;
  orientation: 'portrait' | 'landscape';
  margins: PageMargins;
  pageColor: string; // e.g. '#FFFFFF'
}

export interface DocumentMetadata {
  createdAt: string;
  updatedAt: string;
  author?: string;
  version?: number;
}

export interface DocumentModelData {
  schemaVersion: number;
  id: string;
  title: string;
  revision: number;
  settings: DocumentSettings;
  metadata: DocumentMetadata;
  blocks: BlockNode[];
}
