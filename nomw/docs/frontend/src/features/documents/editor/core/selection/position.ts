import { DocumentModel } from '../model/document-model';

export interface DocPosition {
  blockId: string;
  offset: number; // character offset in the block
  affinity?: 'forward' | 'backward';
  tableBlockId?: string;
  tableCellId?: string;
}

export interface EditorSelection {
  anchor: DocPosition;
  focus: DocPosition;
}

export interface NormalizedSelection {
  start: DocPosition;
  end: DocPosition;
  isBackward: boolean;
  isCollapsed: boolean;
}

/**
 * Compare two logical document positions.
 * Returns -1 if a comes before b, 0 if equal, 1 if a comes after b.
 */
export function comparePositions(a: DocPosition, b: DocPosition, doc: DocumentModel): number {
  if (a.blockId === b.blockId) {
    if (a.offset < b.offset) return -1;
    if (a.offset > b.offset) return 1;
    return 0;
  }

  const idxA = doc.getBlockIndex(a.blockId);
  const idxB = doc.getBlockIndex(b.blockId);

  if (idxA !== -1 && idxB !== -1) {
    return idxA < idxB ? -1 : 1;
  }

  // Handle table cell blocks or nested blocks
  return 0;
}

/**
 * Check if a selection is collapsed (cursor with no range)
 */
export function isSelectionCollapsed(sel: EditorSelection | null): boolean {
  if (!sel) return true;
  return (
    sel.anchor.blockId === sel.focus.blockId &&
    sel.anchor.offset === sel.focus.offset &&
    sel.anchor.tableCellId === sel.focus.tableCellId
  );
}

/**
 * Normalizes selection into start and end positions where start is always <= end
 */
export function normalizeSelection(sel: EditorSelection, doc: DocumentModel): NormalizedSelection {
  const cmp = comparePositions(sel.anchor, sel.focus, doc);
  const isBackward = cmp > 0;
  const isCollapsed = cmp === 0;

  return {
    start: isBackward ? sel.focus : sel.anchor,
    end: isBackward ? sel.anchor : sel.focus,
    isBackward,
    isCollapsed,
  };
}

/**
 * Clones a DocPosition
 */
export function clonePosition(pos: DocPosition): DocPosition {
  return {
    blockId: pos.blockId,
    offset: pos.offset,
    affinity: pos.affinity,
    tableBlockId: pos.tableBlockId,
    tableCellId: pos.tableCellId,
  };
}

/**
 * Clones an EditorSelection
 */
export function cloneSelection(sel: EditorSelection | null): EditorSelection | null {
  if (!sel) return null;
  return {
    anchor: clonePosition(sel.anchor),
    focus: clonePosition(sel.focus),
  };
}

/**
 * Extract plain text inside an EditorSelection
 */
export function getSelectedText(sel: EditorSelection | null, doc: DocumentModel): string {
  if (!sel || isSelectionCollapsed(sel)) return '';
  const { start, end } = normalizeSelection(sel, doc);
  const startIdx = doc.getBlockIndex(start.blockId);
  const endIdx = doc.getBlockIndex(end.blockId);
  if (startIdx === -1 || endIdx === -1) return '';

  if (startIdx === endIdx) {
    const text = doc.getBlockText(doc.blocks[startIdx]);
    return text.slice(start.offset, end.offset);
  }

  const result: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const text = doc.getBlockText(doc.blocks[i]);
    if (i === startIdx) {
      result.push(text.slice(start.offset));
    } else if (i === endIdx) {
      result.push(text.slice(0, end.offset));
    } else {
      result.push(text);
    }
  }
  return result.join('\n');
}
