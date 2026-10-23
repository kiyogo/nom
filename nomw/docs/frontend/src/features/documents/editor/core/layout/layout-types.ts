import { TextMarks } from '../model/types';
import { PaintCommand } from '../rendering/display-list';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedCluster {
  cluster: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetInBlock: number;
}

export interface PositionedRun {
  runId: string;
  text: string;
  marks: TextMarks;
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
  startOffset: number;
  endOffset: number;
  clusters: PositionedCluster[];
}

export interface TextLineLayout {
  lineIndex: number;
  blockId: string;
  pageIndex: number;
  rect: Rect;
  baseline: number;
  runs: PositionedRun[];
  startOffset: number;
  endOffset: number;
}

export interface ListMarkerLayout {
  text: string;
  x: number;
  y: number;
  baseline: number;
  isChecklist?: boolean;
  checked?: boolean;
  marks: TextMarks;
}

export interface TableCellLayout {
  cellId: string;
  rect: Rect; // relative to page
  blocks: BlockLayout[];
  style?: any;
}

export interface TableRowLayout {
  rowId: string;
  rect: Rect;
  cells: TableCellLayout[];
}

export interface TableBlockLayout {
  rect: Rect;
  rows: TableRowLayout[];
  columns: { width: number }[];
  style?: any;
}

export interface ImageBlockLayout {
  rect: Rect;
  src: string;
  alt?: string;
  alignment: 'left' | 'center' | 'right';
}

export interface BlockLayout {
  blockId: string;
  blockType: string;
  pageIndex: number;
  rect: Rect;
  lines: TextLineLayout[];
  listMarker?: ListMarkerLayout;
  tableLayout?: TableBlockLayout;
  imageLayout?: ImageBlockLayout;
}

export interface HitTestEntry {
  pageIndex: number;
  blockId: string;
  lineIndex: number;
  rect: Rect;
  baseline: number;
  startOffset: number;
  endOffset: number;
  clusters: PositionedCluster[];
}

export interface PageLayout {
  pageIndex: number;
  width: number;
  height: number;
  contentRect: Rect;
  blocks: BlockLayout[];
  hitTestIndex: HitTestEntry[];
  displayList: PaintCommand[];
  readonly hasRenderResources?: boolean;
  releaseRenderResources?: () => void;
  version?: number;
}

export interface DocumentLayout {
  pages: PageLayout[];
  documentHeight: number;
  pageHeightIndex?: any;
  pageCount?: number;
  getPage?: (index: number) => PageLayout;
  ensurePageRange?: (start: number, end: number) => void;
}
