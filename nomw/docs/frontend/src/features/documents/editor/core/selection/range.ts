import { DocumentModel } from '../model/document-model';
import { BlockNode, TextRun } from '../model/types';
import { EditorSelection, normalizeSelection, isSelectionCollapsed } from './position';
import { generateRunId } from '../utils/id-generator';

export function getSelectedText(selection: EditorSelection | null, doc: DocumentModel): string {
  if (!selection || isSelectionCollapsed(selection)) return '';

  const { start, end } = normalizeSelection(selection, doc);
  const blocks = iterateSelectedBlocks(selection, doc);

  if (blocks.length === 0) return '';

  if (blocks.length === 1) {
    const block = blocks[0];
    const fullText = doc.getBlockText(block);
    return fullText.slice(start.offset, end.offset);
  }

  const chunks: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const fullText = doc.getBlockText(block);

    if (i === 0) {
      chunks.push(fullText.slice(start.offset));
    } else if (i === blocks.length - 1) {
      chunks.push(fullText.slice(0, end.offset));
    } else {
      chunks.push(fullText);
    }
  }

  return chunks.join('\n');
}

export function iterateSelectedBlocks(selection: EditorSelection | null, doc: DocumentModel): BlockNode[] {
  if (!selection) return [];

  const { start, end } = normalizeSelection(selection, doc);
  const startIdx = doc.getBlockIndex(start.blockId);
  const endIdx = doc.getBlockIndex(end.blockId);

  if (startIdx === -1 || endIdx === -1) {
    const startBlock = doc.getBlockById(start.blockId);
    return startBlock ? [startBlock] : [];
  }

  return doc.blocks.slice(startIdx, endIdx + 1);
}

/**
 * Splits runs of a block around start/end offsets.
 * Useful for applying marks to a range inside a single block.
 */
export function sliceBlockRuns(
  runs: TextRun[],
  startOffset: number,
  endOffset: number
): { before: TextRun[]; middle: TextRun[]; after: TextRun[] } {
  const before: TextRun[] = [];
  const middle: TextRun[] = [];
  const after: TextRun[] = [];

  let currentOffset = 0;

  for (const run of runs) {
    const runStart = currentOffset;
    const runEnd = currentOffset + run.text.length;
    currentOffset = runEnd;

    // Case 1: Entirely before range
    if (runEnd <= startOffset) {
      before.push({ ...run, id: generateRunId(), marks: { ...run.marks } });
      continue;
    }

    // Case 2: Entirely after range
    if (runStart >= endOffset) {
      after.push({ ...run, id: generateRunId(), marks: { ...run.marks } });
      continue;
    }

    // Case 3: Overlaps range -> slice into parts
    const beforeText = run.text.slice(0, Math.max(0, startOffset - runStart));
    const midText = run.text.slice(
      Math.max(0, startOffset - runStart),
      Math.min(run.text.length, endOffset - runStart)
    );
    const afterText = run.text.slice(Math.min(run.text.length, endOffset - runStart));

    if (beforeText.length > 0) {
      before.push({ id: run.id + '-b', text: beforeText, marks: { ...run.marks } });
    }
    if (midText.length > 0) {
      middle.push({ id: run.id + '-m', text: midText, marks: { ...run.marks } });
    }
    if (afterText.length > 0) {
      after.push({ id: run.id + '-a', text: afterText, marks: { ...run.marks } });
    }
  }

  return { before, middle, after };
}
