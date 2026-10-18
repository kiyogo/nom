import { DocumentModel } from '../model/document-model';
import {
  BlockNode,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  TextRun,
  TextMarks,
  ParagraphStyle,
  DocumentSettings,
} from '../model/types';
import { DocPosition, normalizeSelection, comparePositions } from '../selection/position';
import { sliceBlockRuns } from '../selection/range';
import { generateRunId, generateBlockId } from '../utils/id-generator';
import { createEmptyParagraph, DEFAULT_TEXT_MARKS } from '../model/defaults';

export interface InsertTextOp {
  type: 'insert-text';
  blockId: string;
  offset: number;
  text: string;
  marks?: TextMarks;
}

export interface DeleteRangeOp {
  type: 'delete-range';
  start: DocPosition;
  end: DocPosition;
  deletedBlocks?: BlockNode[];
  deletedText?: string;
}

export interface SplitParagraphOp {
  type: 'split-paragraph';
  blockId: string;
  offset: number;
  newBlockId: string;
}

export interface MergeParagraphOp {
  type: 'merge-paragraph';
  prevBlockId: string;
  nextBlockId: string;
  prevLength?: number;
}

export interface SetTextStyleOp {
  type: 'set-text-style';
  start: DocPosition;
  end: DocPosition;
  marks: Partial<TextMarks>;
}

export interface SetParagraphStyleOp {
  type: 'set-paragraph-style';
  blockIds: string[];
  style: Partial<ParagraphStyle>;
  blockType?: 'paragraph' | 'heading' | 'list-item';
  headingLevel?: 1 | 2 | 3;
  listStyle?: any;
}

export interface InsertBlockOp {
  type: 'insert-block';
  index: number;
  block: BlockNode;
}

export interface DeleteBlockOp {
  type: 'delete-block';
  blockId: string;
  deletedBlock?: BlockNode;
  deletedIndex?: number;
}

export interface SetDocumentSettingsOp {
  type: 'set-settings';
  settings: Partial<DocumentSettings>;
  previousSettings?: DocumentSettings;
}

export interface SetDocumentTitleOp {
  type: 'set-title';
  title: string;
  previousTitle?: string;
}

export type EditorOperation =
  | InsertTextOp
  | DeleteRangeOp
  | SplitParagraphOp
  | MergeParagraphOp
  | SetTextStyleOp
  | SetParagraphStyleOp
  | InsertBlockOp
  | DeleteBlockOp
  | SetDocumentSettingsOp
  | SetDocumentTitleOp;

/**
 * Apply operation to DocumentModel
 */
export function applyOperation(op: EditorOperation, doc: DocumentModel): EditorOperation | null {
  switch (op.type) {
    case 'insert-text': {
      let block = doc.getBlockById(op.blockId);
      if (block && block.type === 'table') {
        const firstCellBlock = (block as TableBlock).rows[0]?.cells[0]?.blocks[0];
        if (firstCellBlock) {
          block = firstCellBlock;
          op.blockId = firstCellBlock.id;
        }
      }
      if (!block || !('runs' in block)) return null;

      let currentOffset = 0;
      let inserted = false;
      const newRuns: TextRun[] = [];

      for (const run of block.runs) {
        const runLen = run.text.length;
        if (!inserted && op.offset >= currentOffset && op.offset <= currentOffset + runLen) {
          const splitIdx = op.offset - currentOffset;
          const leftText = run.text.slice(0, splitIdx);
          const rightText = run.text.slice(splitIdx);

          if (leftText.length > 0) {
            newRuns.push({ ...run, text: leftText });
          }

          // Insert text run with marks (prefer specified marks or inherit from current run)
          const runMarks = op.marks ? { ...op.marks } : { ...run.marks };
          newRuns.push({
            id: generateRunId(),
            text: op.text,
            marks: runMarks,
          });

          if (rightText.length > 0) {
            newRuns.push({ ...run, id: generateRunId(), text: rightText });
          }
          inserted = true;
        } else {
          newRuns.push({ ...run });
        }
        currentOffset += runLen;
      }

      if (!inserted) {
        newRuns.push({
          id: generateRunId(),
          text: op.text,
          marks: op.marks ? { ...op.marks } : { ...DEFAULT_TEXT_MARKS },
        });
      }

      block.runs = DocumentModel.normalizeRuns(newRuns);
      doc.incrementBlockVersion(op.blockId);

      // Return inverse: delete the inserted range
      return {
        type: 'delete-range',
        start: { blockId: op.blockId, offset: op.offset },
        end: { blockId: op.blockId, offset: op.offset + op.text.length },
      };
    }

    case 'delete-range': {
      // 1. Single block deletion (supports paragraphs, headings, and table cells)
      if (op.start.blockId === op.end.blockId) {
        const block = doc.getBlockById(op.start.blockId);
        if (!block || !('runs' in block)) return null;

        const minOffset = Math.min(op.start.offset, op.end.offset);
        const maxOffset = Math.max(op.start.offset, op.end.offset);
        if (minOffset === maxOffset) return null;

        const { before, middle, after } = sliceBlockRuns(block.runs, minOffset, maxOffset);
        const combined = [...before, ...after];
        block.runs = DocumentModel.normalizeRuns(combined);
        doc.incrementBlockVersion(op.start.blockId);

        const deletedText = middle.map((r) => r.text).join('');
        return {
          type: 'insert-text',
          blockId: op.start.blockId,
          offset: minOffset,
          text: deletedText,
        };
      }

      const cmp = comparePositions(op.start, op.end, doc);
      if (cmp === 0) return null;
      const start = cmp < 0 ? op.start : op.end;
      const end = cmp < 0 ? op.end : op.start;

      const locStart = doc.getBlockLocation(start.blockId);
      const locEnd = doc.getBlockLocation(end.blockId);
      if (!locStart || !locEnd) return null;

      // Check if both blocks share the same parent container (e.g. top-level or same cell)
      if (locStart.parentArray === locEnd.parentArray) {
        const startIdx = locStart.index;
        const endIdx = locEnd.index;
        const startBlock = locStart.parentArray[startIdx];
        const endBlock = locStart.parentArray[endIdx];
        const deletedBlocks = locStart.parentArray.slice(startIdx, endIdx + 1);

        if ('runs' in startBlock && 'runs' in endBlock) {
          const startSlice = sliceBlockRuns(startBlock.runs, start.offset, doc.getBlockLength(startBlock));
          const endSlice = sliceBlockRuns(endBlock.runs, 0, end.offset);
          startBlock.runs = DocumentModel.normalizeRuns([...startSlice.before, ...endSlice.after]);
        }

        doc.incrementBlockVersion(startBlock.id);
        for (let i = startIdx + 1; i <= endIdx; i++) {
          const b = locStart.parentArray[i];
          if (b) doc.incrementBlockVersion(b.id);
        }

        locStart.parentArray.splice(startIdx + 1, endIdx - startIdx);
        doc.invalidateBlockIndexMap();

        return {
          type: 'insert-block',
          index: startIdx,
          block: deletedBlocks[0],
        };
      }

      return null;
    }

    case 'split-paragraph': {
      const loc = doc.getBlockLocation(op.blockId);
      if (!loc) return null;
      const block = loc.parentArray[loc.index];
      if (!('runs' in block)) return null;

      const { before, after } = sliceBlockRuns(block.runs, op.offset, doc.getBlockLength(block));
      block.runs = DocumentModel.normalizeRuns(before);

      const freshAfter = (after.length > 0 ? after : [{ id: generateRunId(), text: '', marks: { ...DEFAULT_TEXT_MARKS } }]).map((r) => ({
        ...r,
        id: generateRunId(),
        marks: { ...r.marks },
      }));

      const newBlock: BlockNode = {
        ...block,
        id: op.newBlockId,
        runs: DocumentModel.normalizeRuns(freshAfter),
      };

      // Reset heading style on enter to normal if heading
      if (newBlock.type === 'heading') {
        (newBlock as any).type = 'paragraph';
        delete (newBlock as any).level;
      }

      loc.parentArray.splice(loc.index + 1, 0, newBlock);
      doc.incrementBlockVersion(op.blockId);
      doc.incrementBlockVersion(op.newBlockId);
      doc.invalidateBlockIndexMap();

      return {
        type: 'merge-paragraph',
        prevBlockId: op.blockId,
        nextBlockId: op.newBlockId,
      };
    }

    case 'merge-paragraph': {
      const locPrev = doc.getBlockLocation(op.prevBlockId);
      const locNext = doc.getBlockLocation(op.nextBlockId);
      if (!locPrev || !locNext || locPrev.parentArray !== locNext.parentArray || locNext.index !== locPrev.index + 1) return null;

      const prevBlock = locPrev.parentArray[locPrev.index];
      const nextBlock = locNext.parentArray[locNext.index];

      if ('runs' in prevBlock && 'runs' in nextBlock) {
        const prevLength = doc.getBlockLength(prevBlock);
        prevBlock.runs = DocumentModel.normalizeRuns([...prevBlock.runs, ...nextBlock.runs]);
        locPrev.parentArray.splice(locNext.index, 1);
        doc.incrementBlockVersion(op.prevBlockId);
        doc.incrementBlockVersion(op.nextBlockId);
        doc.invalidateBlockIndexMap();

        return {
          type: 'split-paragraph',
          blockId: op.prevBlockId,
          offset: prevLength,
          newBlockId: op.nextBlockId,
        };
      }
      return null;
    }

    case 'set-text-style': {
      if (op.start.blockId === op.end.blockId) {
        const block = doc.getBlockById(op.start.blockId);
        if (!block || !('runs' in block)) return null;

        const minOffset = Math.min(op.start.offset, op.end.offset);
        const maxOffset = Math.max(op.start.offset, op.end.offset);

        // If collapsed selection on an empty block, update the block's run marks directly
        if (minOffset === maxOffset && (block.runs.length <= 1 && (block.runs[0]?.text || '') === '')) {
          if (block.runs.length === 0) {
            block.runs = [{ id: generateRunId(), text: '', marks: { ...DEFAULT_TEXT_MARKS, ...op.marks } }];
          } else {
            block.runs[0].marks = { ...block.runs[0].marks, ...op.marks };
          }
          doc.incrementBlockVersion(op.start.blockId);
          return null;
        }

        const { before, middle, after } = sliceBlockRuns(block.runs, minOffset, maxOffset);

        for (const run of middle) {
          run.marks = { ...run.marks, ...op.marks };
        }

        block.runs = DocumentModel.normalizeRuns([...before, ...middle, ...after]);
        doc.incrementBlockVersion(op.start.blockId);
        return null;
      }

      const { start, end } = normalizeSelection({ anchor: op.start, focus: op.end }, doc);
      const startIdx = doc.getBlockIndex(start.blockId);
      const endIdx = doc.getBlockIndex(end.blockId);
      if (startIdx === -1 || endIdx === -1) return null;

      for (let i = startIdx; i <= endIdx; i++) {
        const block = doc.blocks[i];
        if (!('runs' in block)) continue;

        const blockLen = doc.getBlockLength(block);
        const blockStartOffset = i === startIdx ? start.offset : 0;
        const blockEndOffset = i === endIdx ? end.offset : blockLen;

        const { before, middle, after } = sliceBlockRuns(block.runs, blockStartOffset, blockEndOffset);

        for (const run of middle) {
          run.marks = { ...run.marks, ...op.marks };
        }

        block.runs = DocumentModel.normalizeRuns([...before, ...middle, ...after]);
        doc.incrementBlockVersion(block.id);
      }
      return null;
    }

    case 'set-paragraph-style': {
      for (const blockId of op.blockIds) {
        const block = doc.getBlockById(blockId);
        if (!block) continue;

        if (op.style && 'style' in block) {
          block.style = { ...block.style, ...op.style };
        }

        if (op.blockType) {
          if (op.blockType === 'paragraph') {
            block.type = 'paragraph';
            delete (block as any).level;
            delete (block as any).listStyle;
          } else if (op.blockType === 'heading') {
            block.type = 'heading';
            (block as HeadingBlock).level = op.headingLevel || 1;
            delete (block as any).listStyle;
          } else if (op.blockType === 'list-item') {
            block.type = 'list-item';
            (block as ListItemBlock).listStyle = op.listStyle || { listType: 'bullet', level: 0 };
            delete (block as any).level;
          }
        }
        doc.incrementBlockVersion(blockId);
      }
      return null;
    }

    case 'insert-block': {
      doc.blocks.splice(op.index, 0, op.block);
      doc.incrementBlockVersion(op.block.id);
      doc.invalidateBlockIndexMap();
      return {
        type: 'delete-block',
        blockId: op.block.id,
      };
    }

    case 'delete-block': {
      const idx = doc.getBlockIndex(op.blockId);
      if (idx === -1) return null;
      const [deleted] = doc.blocks.splice(idx, 1);
      doc.invalidateBlockIndexMap();
      if (doc.blocks.length === 0) {
        doc.blocks.push(createEmptyParagraph());
      }
      return {
        type: 'insert-block',
        index: idx,
        block: deleted,
      };
    }

    case 'set-settings': {
      const prev = { ...doc.settings };
      doc.settings = { ...doc.settings, ...op.settings };
      doc.incrementRevision();
      return {
        type: 'set-settings',
        settings: prev,
      };
    }

    case 'set-title': {
      const prev = doc.title;
      doc.title = op.title;
      doc.incrementRevision();
      return {
        type: 'set-title',
        title: prev,
      };
    }

    default:
      return null;
  }
}
