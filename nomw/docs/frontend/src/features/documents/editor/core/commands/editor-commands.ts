import { DocumentModel } from '../model/document-model';
import { SelectionEngine } from '../selection/selection-engine';
import { TransactionEngine } from '../transactions/transaction-engine';
import { HistoryManager } from '../history/history-manager';
import { CommandRegistry } from './command-registry';
import {
  TextMarks,
  ParagraphStyle,
  ParagraphPreset,
  ListType,
  BlockNode,
  ListItemBlock,
  HeadingBlock,
} from '../model/types';
import {
  isSelectionCollapsed,
  normalizeSelection,
  DocPosition,
} from '../selection/position';
import {
  getPreviousGraphemeOffset,
  getNextGraphemeOffset,
} from '../utils/unicode';
import {
  createEmptyParagraph,
  createTable,
  createImageBlock,
  DEFAULT_TEXT_MARKS,
  DEFAULT_PARAGRAPH_STYLE,
  PARAGRAPH_PRESETS,
} from '../model/defaults';
import { generateBlockId } from '../utils/id-generator';
import { EditorOperation } from '../transactions/operations';

export function registerEditorCommands(
  registry: CommandRegistry,
  doc: DocumentModel,
  selectionEngine: SelectionEngine,
  transactionEngine: TransactionEngine,
  historyManager: HistoryManager,
  onMutated: () => void
): void {
  const executeTx = (ops: EditorOperation[], source: any = 'keyboard') => {
    if (ops.length === 0) return;
    const selBefore = selectionEngine.getSelection();
    const tx = transactionEngine.createTransaction(ops, source, selBefore);
    const { inverseTx } = transactionEngine.applyTransaction(tx);
    historyManager.record(tx, inverseTx);
    const op = ops[0];
    const opDetail = op?.type === 'insert-text' ? `insert "${(op as any).text}"` : op?.type;
    if (typeof window !== 'undefined' && (window as any).__debugEditorLogs) {
      console.log(`[INPUT] ${opDetail}\n  documentVersion = ${doc.revision}\n  blockId = ${op && 'blockId' in op ? (op as any).blockId : 'N/A'}`);
    }
    onMutated();
  };

  // 1. Insert Text
  registry.register('insertText', (args: { text: string; marks?: TextMarks }) => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;

    const ops: EditorOperation[] = [];
    let targetBlockId = sel.focus.blockId;
    let targetOffset = sel.focus.offset;

    // If selection is non-collapsed, delete selected range first
    if (!isSelectionCollapsed(sel)) {
      const { start, end } = normalizeSelection(sel, doc);
      ops.push({
        type: 'delete-range',
        start,
        end,
      });
      targetBlockId = start.blockId;
      targetOffset = start.offset;
    }

    const marks = args.marks || selectionEngine.getActiveMarks(doc);

    ops.push({
      type: 'insert-text',
      blockId: targetBlockId,
      offset: targetOffset,
      text: args.text,
      marks,
    });

    selectionEngine.setCursor(targetBlockId, targetOffset + args.text.length, undefined, { silent: true });
    executeTx(ops, 'keyboard');
  });

  // 1b. Replace Composition Text (for Vietnamese Telex/VNI & CJK IME)
  registry.register('replaceCompositionText', (args: { blockId: string; startOffset: number; replaceLength: number; text: string }) => {
    const { blockId, startOffset, replaceLength, text } = args;
    const ops: EditorOperation[] = [];

    if (replaceLength > 0) {
      ops.push({
        type: 'delete-range',
        start: { blockId, offset: startOffset },
        end: { blockId, offset: startOffset + replaceLength },
      });
    }

    if (text.length > 0) {
      const marks = selectionEngine.getActiveMarks(doc);
      ops.push({
        type: 'insert-text',
        blockId,
        offset: startOffset,
        text,
        marks,
      });
    }

    selectionEngine.setCursor(blockId, startOffset + text.length, undefined, { silent: true });
    executeTx(ops, 'keyboard');
  });

  // 2. Delete Backward (Backspace)
  registry.register('deleteBackward', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;

    if (!isSelectionCollapsed(sel)) {
      const { start, end } = normalizeSelection(sel, doc);
      selectionEngine.setCursor(start.blockId, start.offset, undefined, { silent: true });
      executeTx([{ type: 'delete-range', start, end }], 'keyboard');
      return;
    }

    const block = doc.getBlockById(sel.focus.blockId);
    if (!block) return;

    // Inside block: delete previous grapheme
    if (sel.focus.offset > 0) {
      const blockText = doc.getBlockText(block);
      const prevOffset = getPreviousGraphemeOffset(blockText, sel.focus.offset);
      selectionEngine.setCursor(sel.focus.blockId, prevOffset, undefined, { silent: true });
      executeTx(
        [
          {
            type: 'delete-range',
            start: { blockId: sel.focus.blockId, offset: prevOffset },
            end: { blockId: sel.focus.blockId, offset: sel.focus.offset },
          },
        ],
        'keyboard'
      );
      return;
    }

    // At offset 0: Check if list item or heading
    if (block.type === 'list-item') {
      const listBlock = block as ListItemBlock;
      if (listBlock.listStyle.level > 0) {
        // Decrease indent level
        executeTx([
          {
            type: 'set-paragraph-style',
            blockIds: [block.id],
            style: {},
            blockType: 'list-item',
            listStyle: { ...listBlock.listStyle, level: listBlock.listStyle.level - 1 },
          },
        ]);
      } else {
        // Convert to normal paragraph
        executeTx([
          {
            type: 'set-paragraph-style',
            blockIds: [block.id],
            style: { ...DEFAULT_PARAGRAPH_STYLE },
            blockType: 'paragraph',
          },
        ]);
      }
      return;
    }

    if (block.type === 'heading') {
      executeTx([
        {
          type: 'set-paragraph-style',
          blockIds: [block.id],
          style: { ...DEFAULT_PARAGRAPH_STYLE },
          blockType: 'paragraph',
        },
      ]);
      return;
    }

    // Merge with previous block if at offset 0
    const idx = doc.getBlockIndex(block.id);
    if (idx > 0) {
      const prevBlock = doc.blocks[idx - 1];
      if (prevBlock && 'runs' in prevBlock && Array.isArray(prevBlock.runs)) {
        const prevLen = doc.getBlockLength(prevBlock);
        selectionEngine.setCursor(prevBlock.id, prevLen, undefined, { silent: true });
        executeTx([
          {
            type: 'merge-paragraph',
            prevBlockId: prevBlock.id,
            nextBlockId: block.id,
          },
        ]);
      }
    }
  });

  // 3. Delete Forward (Delete)
  registry.register('deleteForward', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;

    if (!isSelectionCollapsed(sel)) {
      const { start, end } = normalizeSelection(sel, doc);
      selectionEngine.setCursor(start.blockId, start.offset, undefined, { silent: true });
      executeTx([{ type: 'delete-range', start, end }], 'keyboard');
      return;
    }

    const block = doc.getBlockById(sel.focus.blockId);
    if (!block) return;
    const blockLen = doc.getBlockLength(block);

    if (sel.focus.offset < blockLen) {
      const blockText = doc.getBlockText(block);
      const nextOffset = getNextGraphemeOffset(blockText, sel.focus.offset);
      selectionEngine.setCursor(sel.focus.blockId, sel.focus.offset, undefined, { silent: true });
      executeTx(
        [
          {
            type: 'delete-range',
            start: { blockId: sel.focus.blockId, offset: sel.focus.offset },
            end: { blockId: sel.focus.blockId, offset: nextOffset },
          },
        ],
        'keyboard'
      );
      return;
    }

    // At end of block: merge with next block
    const idx = doc.getBlockIndex(block.id);
    if (idx < doc.blocks.length - 1) {
      const nextBlock = doc.blocks[idx + 1];
      selectionEngine.setCursor(block.id, blockLen, undefined, { silent: true });
      executeTx([
        {
          type: 'merge-paragraph',
          prevBlockId: block.id,
          nextBlockId: nextBlock.id,
        },
      ]);
    }
  });

  // 4. Insert Paragraph (Enter)
  registry.register('insertParagraph', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;

    const ops: EditorOperation[] = [];
    let targetBlockId = sel.focus.blockId;
    let targetOffset = sel.focus.offset;

    if (!isSelectionCollapsed(sel)) {
      const { start, end } = normalizeSelection(sel, doc);
      ops.push({ type: 'delete-range', start, end });
      targetBlockId = start.blockId;
      targetOffset = start.offset;
    }

    const block = doc.getBlockById(targetBlockId);
    if (!block) return;

    // Check empty list item -> exit list
    if (block.type === 'list-item' && doc.getBlockLength(block) === 0) {
      ops.push({
        type: 'set-paragraph-style',
        blockIds: [block.id],
        style: { ...DEFAULT_PARAGRAPH_STYLE },
        blockType: 'paragraph',
      });
      selectionEngine.setCursor(block.id, 0, undefined, { silent: true });
      executeTx(ops);
      return;
    }

    const newBlockId = generateBlockId(block.type);
    ops.push({
      type: 'split-paragraph',
      blockId: targetBlockId,
      offset: targetOffset,
      newBlockId,
    });

    selectionEngine.setCursor(newBlockId, 0, undefined, { silent: true });
    executeTx(ops);
  });

  // 5. Formatting Toggle (Bold, Italic, Underline, Strike, Colors, Links, etc.)
  registry.register('toggleMark', (args: { key: keyof TextMarks; value?: any }) => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;

    const activeMarks = selectionEngine.getActiveMarks(doc);
    let nextVal = args.value;
    if (nextVal === undefined) {
      nextVal = !activeMarks[args.key];
    }

    const markUpdate: Partial<TextMarks> = { [args.key]: nextVal };

    if (isSelectionCollapsed(sel)) {
      selectionEngine.setPendingMarks({ ...activeMarks, ...markUpdate });
      const block = doc.getBlockById(sel.focus.blockId);
      if (block && 'runs' in block && (block.runs.length <= 1 && (block.runs[0]?.text || '') === '')) {
        executeTx(
          [
            {
              type: 'set-text-style',
              start: sel.focus,
              end: sel.focus,
              marks: markUpdate,
            },
          ],
          'toolbar'
        );
      }
    } else {
      const { start, end } = normalizeSelection(sel, doc);
      executeTx(
        [
          {
            type: 'set-text-style',
            start,
            end,
            marks: markUpdate,
          },
        ],
        'toolbar'
      );
    }
  });

  registry.register('toggleBold', () => registry.execute('toggleMark', { key: 'bold' }));
  registry.register('toggleItalic', () => registry.execute('toggleMark', { key: 'italic' }));
  registry.register('toggleUnderline', () => registry.execute('toggleMark', { key: 'underline' }));
  registry.register('toggleStrike', () => registry.execute('toggleMark', { key: 'strike' }));
  registry.register('setFontSize', (size: number) => registry.execute('toggleMark', { key: 'fontSize', value: size }));
  registry.register('setFontFamily', (family: string) => registry.execute('toggleMark', { key: 'fontFamily', value: family }));
  registry.register('setTextColor', (color: string) => registry.execute('toggleMark', { key: 'foregroundColor', value: color }));
  registry.register('setHighlightColor', (color: string) => registry.execute('toggleMark', { key: 'backgroundColor', value: color }));
  registry.register('setLink', (url: string) => registry.execute('toggleMark', { key: 'link', value: url }));

  registry.register('growFont', () => {
    const activeMarks = selectionEngine.getActiveMarks(doc);
    const current = activeMarks.fontSize || 11;
    const next = Math.min(72, current + (current >= 12 ? 2 : 1));
    registry.execute('setFontSize', next);
  });

  registry.register('shrinkFont', () => {
    const activeMarks = selectionEngine.getActiveMarks(doc);
    const current = activeMarks.fontSize || 11;
    const next = Math.max(6, current - (current > 12 ? 2 : 1));
    registry.execute('setFontSize', next);
  });

  registry.register('setTextCase', (args: { mode: 'uppercase' | 'lowercase' | 'capitalize' }) => {
    const sel = selectionEngine.getSelection();
    if (!sel || isSelectionCollapsed(sel)) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    for (let i = startIdx; i <= endIdx; i++) {
      const block = doc.blocks[i];
      if ('runs' in block && Array.isArray(block.runs)) {
        for (const run of block.runs) {
          let text = run.text;
          if (args.mode === 'uppercase') text = text.toUpperCase();
          else if (args.mode === 'lowercase') text = text.toLowerCase();
          else if (args.mode === 'capitalize') {
            text = text.replace(/\b\w/g, (c) => c.toUpperCase());
          }
          run.text = text;
        }
      }
    }
    onMutated();
  });

  registry.register('insertDateTime', (args?: { format?: string }) => {
    const now = new Date();
    const str = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    registry.execute('insertText', { text: str });
  });

  registry.register('insertSymbol', (args: { symbol: string }) => {
    if (args && args.symbol) {
      registry.execute('insertText', { text: args.symbol });
    }
  });

  // 6. Paragraph Styles and Alignment
  registry.register('setParagraphStyle', (style: Partial<ParagraphStyle>) => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    const blockIds = doc.blocks.slice(startIdx, endIdx + 1).map((b) => b.id);
    executeTx([{ type: 'set-paragraph-style', blockIds, style }], 'toolbar');
  });

  registry.register('setAlignment', (alignment: 'left' | 'center' | 'right' | 'justify') => {
    registry.execute('setParagraphStyle', { alignment });
  });

  registry.register('setLineSpacing', (lineHeight: number) => {
    registry.execute('setParagraphStyle', { lineHeight });
  });

  registry.register('setParagraphPreset', (preset: ParagraphPreset) => {
    const cfg = PARAGRAPH_PRESETS[preset] || PARAGRAPH_PRESETS.normal;
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    const blockIds = doc.blocks.slice(startIdx, endIdx + 1).map((b) => b.id);
    const blockType = preset.startsWith('h') ? 'heading' : 'paragraph';
    const headingLevel = preset === 'h1' ? 1 : preset === 'h2' ? 2 : preset === 'h3' ? 3 : undefined;

    executeTx(
      [
        {
          type: 'set-paragraph-style',
          blockIds,
          style: cfg.style,
          blockType,
          headingLevel: headingLevel as any,
        },
        {
          type: 'set-text-style',
          start,
          end,
          marks: cfg.marks,
        },
      ],
      'toolbar'
    );
  });

  // 7. Lists
  registry.register('toggleList', (listType: ListType) => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    const blocks = doc.blocks.slice(startIdx, endIdx + 1);
    const allMatching = blocks.every(
      (b) => b.type === 'list-item' && (b as ListItemBlock).listStyle.listType === listType
    );

    const blockIds = blocks.map((b) => b.id);
    if (allMatching) {
      // Toggle off -> convert to normal paragraph
      executeTx([
        {
          type: 'set-paragraph-style',
          blockIds,
          style: { ...DEFAULT_PARAGRAPH_STYLE },
          blockType: 'paragraph',
        },
      ]);
    } else {
      // Toggle on
      executeTx([
        {
          type: 'set-paragraph-style',
          blockIds,
          style: { ...DEFAULT_PARAGRAPH_STYLE, spaceBefore: 0, spaceAfter: 3 },
          blockType: 'list-item',
          listStyle: { listType, level: 0 },
        },
      ]);
    }
  });

  // 8. Indents
  registry.register('increaseIndent', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    const ops: EditorOperation[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const b = doc.blocks[i];
      if (b.type === 'list-item') {
        const listBlock = b as ListItemBlock;
        ops.push({
          type: 'set-paragraph-style',
          blockIds: [b.id],
          style: {},
          blockType: 'list-item',
          listStyle: { ...listBlock.listStyle, level: Math.min(5, listBlock.listStyle.level + 1) },
        });
      } else if ('style' in b && b.type !== 'table') {
        const pStyle = (b as any).style;
        ops.push({
          type: 'set-paragraph-style',
          blockIds: [b.id],
          style: { indentStart: ((pStyle?.indentStart || 0) + 36) },
        });
      }
    }
    executeTx(ops, 'toolbar');
  });

  registry.register('decreaseIndent', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    const { start, end } = normalizeSelection(sel, doc);
    const startIdx = doc.getBlockIndex(start.blockId);
    const endIdx = doc.getBlockIndex(end.blockId);
    if (startIdx === -1 || endIdx === -1) return;

    const ops: EditorOperation[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const b = doc.blocks[i];
      if (b.type === 'list-item') {
        const listBlock = b as ListItemBlock;
        if (listBlock.listStyle.level > 0) {
          ops.push({
            type: 'set-paragraph-style',
            blockIds: [b.id],
            style: {},
            blockType: 'list-item',
            listStyle: { ...listBlock.listStyle, level: listBlock.listStyle.level - 1 },
          });
        } else {
          ops.push({
            type: 'set-paragraph-style',
            blockIds: [b.id],
            style: { ...DEFAULT_PARAGRAPH_STYLE },
            blockType: 'paragraph',
          });
        }
      } else if ('style' in b && b.type !== 'table') {
        const pStyle = (b as any).style;
        ops.push({
          type: 'set-paragraph-style',
          blockIds: [b.id],
          style: { indentStart: Math.max(0, (pStyle?.indentStart || 0) - 36) },
        });
      }
    }
    executeTx(ops, 'toolbar');
  });

  // 9. Table Insertion
  registry.register('insertTable', (args: { rows: number; columns: number }) => {
    const sel = selectionEngine.getSelection();
    const currentIdx = sel ? doc.getBlockIndex(sel.focus.blockId) : doc.blocks.length - 1;
    const targetIdx = currentIdx !== -1 ? currentIdx + 1 : doc.blocks.length;

    const tableBlock = createTable(args.rows || 3, args.columns || 3);
    executeTx([{ type: 'insert-block', index: targetIdx, block: tableBlock }], 'toolbar');

    const firstCellBlock = tableBlock.rows[0]?.cells[0]?.blocks[0];
    if (firstCellBlock) {
      selectionEngine.setCursor(firstCellBlock.id, 0);
    }
  });

  const getActiveTableContext = () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return null;
    const loc = doc.getBlockLocation(sel.focus.blockId);
    if (!loc || !loc.table || !loc.cell) return null;

    const table = loc.table;
    let rowIndex = -1;
    let colIndex = -1;

    for (let r = 0; r < table.rows.length; r++) {
      const cIdx = table.rows[r].cells.findIndex((c: any) => c.id === loc.cell.id);
      if (cIdx !== -1) {
        rowIndex = r;
        colIndex = cIdx;
        break;
      }
    }

    return { table, rowIndex, colIndex, cell: loc.cell };
  };

  registry.register('insertTableRowAbove', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, rowIndex } = ctx;
    const colsCount = table.columns?.length || table.rows[0]?.cells.length || 1;
    const colWidth = table.columns?.[0]?.width || 100;
    const newRow = {
      id: generateBlockId('row'),
      cells: Array.from({ length: colsCount }, (_, idx) => ({
        id: generateBlockId('cell'),
        width: table.columns?.[idx]?.width || colWidth,
        blocks: [createEmptyParagraph()],
        style: { ...table.rows[0]?.cells[0]?.style },
      })),
    };
    table.rows.splice(rowIndex, 0, newRow);
    const targetBlock = newRow.cells[0]?.blocks[0];
    if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    onMutated();
  });

  registry.register('insertTableRowBelow', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, rowIndex } = ctx;
    const colsCount = table.columns?.length || table.rows[0]?.cells.length || 1;
    const colWidth = table.columns?.[0]?.width || 100;
    const newRow = {
      id: generateBlockId('row'),
      cells: Array.from({ length: colsCount }, (_, idx) => ({
        id: generateBlockId('cell'),
        width: table.columns?.[idx]?.width || colWidth,
        blocks: [createEmptyParagraph()],
        style: { ...table.rows[0]?.cells[0]?.style },
      })),
    };
    table.rows.splice(rowIndex + 1, 0, newRow);
    const targetBlock = newRow.cells[0]?.blocks[0];
    if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    onMutated();
  });

  registry.register('insertTableColumnLeft', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, colIndex } = ctx;
    const totalCols = (table.columns?.length || table.rows[0]?.cells.length || 1) + 1;
    const colWidth = Math.floor(650 / totalCols);
    table.columns = Array.from({ length: totalCols }, () => ({ width: colWidth }));

    for (const row of table.rows) {
      const newCell = {
        id: generateBlockId('cell'),
        width: colWidth,
        blocks: [createEmptyParagraph()],
        style: { ...row.cells[0]?.style },
      };
      row.cells.splice(colIndex, 0, newCell);
    }
    const targetBlock = table.rows[ctx.rowIndex]?.cells[colIndex]?.blocks[0];
    if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    onMutated();
  });

  registry.register('insertTableColumnRight', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, colIndex } = ctx;
    const totalCols = (table.columns?.length || table.rows[0]?.cells.length || 1) + 1;
    const colWidth = Math.floor(650 / totalCols);
    table.columns = Array.from({ length: totalCols }, () => ({ width: colWidth }));

    for (const row of table.rows) {
      const newCell = {
        id: generateBlockId('cell'),
        width: colWidth,
        blocks: [createEmptyParagraph()],
        style: { ...row.cells[0]?.style },
      };
      row.cells.splice(colIndex + 1, 0, newCell);
    }
    const targetBlock = table.rows[ctx.rowIndex]?.cells[colIndex + 1]?.blocks[0];
    if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    onMutated();
  });

  registry.register('deleteTableRow', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, rowIndex } = ctx;
    if (table.rows.length <= 1) {
      const tblIdx = doc.getBlockIndex(table.id);
      if (tblIdx !== -1) {
        doc.blocks.splice(tblIdx, 1);
        if (doc.blocks.length === 0) doc.blocks.push(createEmptyParagraph());
        const target = doc.blocks[Math.min(tblIdx, doc.blocks.length - 1)];
        if (target) selectionEngine.setCursor(target.id, 0);
      }
    } else {
      table.rows.splice(rowIndex, 1);
      const targetRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
      const targetBlock = targetRow?.cells[Math.min(ctx.colIndex, targetRow.cells.length - 1)]?.blocks[0];
      if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    }
    onMutated();
  });

  registry.register('deleteTableColumn', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table, colIndex } = ctx;
    const currentCols = table.columns?.length || table.rows[0]?.cells.length || 1;
    if (currentCols <= 1) {
      const tblIdx = doc.getBlockIndex(table.id);
      if (tblIdx !== -1) {
        doc.blocks.splice(tblIdx, 1);
        if (doc.blocks.length === 0) doc.blocks.push(createEmptyParagraph());
        const target = doc.blocks[Math.min(tblIdx, doc.blocks.length - 1)];
        if (target) selectionEngine.setCursor(target.id, 0);
      }
    } else {
      for (const row of table.rows) {
        row.cells.splice(colIndex, 1);
      }
      if (table.columns && table.columns.length > colIndex) {
        table.columns.splice(colIndex, 1);
      }
      const newCols = currentCols - 1;
      const colWidth = Math.floor(650 / newCols);
      table.columns = Array.from({ length: newCols }, () => ({ width: colWidth }));
      const targetRow = table.rows[ctx.rowIndex];
      const targetBlock = targetRow?.cells[Math.min(colIndex, targetRow.cells.length - 1)]?.blocks[0];
      if (targetBlock) selectionEngine.setCursor(targetBlock.id, 0);
    }
    onMutated();
  });

  registry.register('deleteTable', () => {
    const ctx = getActiveTableContext();
    if (!ctx) return;
    const { table } = ctx;
    const tblIdx = doc.getBlockIndex(table.id);
    if (tblIdx !== -1) {
      doc.blocks.splice(tblIdx, 1);
      if (doc.blocks.length === 0) doc.blocks.push(createEmptyParagraph());
      const target = doc.blocks[Math.min(tblIdx, doc.blocks.length - 1)];
      if (target) selectionEngine.setCursor(target.id, 0);
    }
    onMutated();
  });

  // 10. Image Insertion
  registry.register('insertImage', (args: { src: string; width?: number; height?: number; alt?: string }) => {
    const sel = selectionEngine.getSelection();
    const currentIdx = sel ? doc.getBlockIndex(sel.focus.blockId) : doc.blocks.length - 1;
    const targetIdx = currentIdx !== -1 ? currentIdx + 1 : doc.blocks.length;

    const imgBlock = createImageBlock(args.src, args.width || 400, args.height || 260, args.alt || '');
    executeTx([{ type: 'insert-block', index: targetIdx, block: imgBlock }], 'toolbar');
  });

  // 11. Horizontal Rule & Page Break
  registry.register('insertHorizontalRule', () => {
    const sel = selectionEngine.getSelection();
    const currentIdx = sel ? doc.getBlockIndex(sel.focus.blockId) : doc.blocks.length - 1;
    const targetIdx = currentIdx !== -1 ? currentIdx + 1 : doc.blocks.length;

    executeTx([{ type: 'insert-block', index: targetIdx, block: { id: generateBlockId('hr'), type: 'horizontal-rule' } }], 'toolbar');
  });

  registry.register('insertPageBreak', () => {
    const sel = selectionEngine.getSelection();
    const currentIdx = sel ? doc.getBlockIndex(sel.focus.blockId) : doc.blocks.length - 1;
    const targetIdx = currentIdx !== -1 ? currentIdx + 1 : doc.blocks.length;

    executeTx([{ type: 'insert-block', index: targetIdx, block: { id: generateBlockId('pb'), type: 'page-break' } }], 'toolbar');
  });

  // 12. Undo & Redo
  registry.register('undo', () => {
    const entry = historyManager.popUndo();
    if (!entry) return;
    const { inverseTx } = transactionEngine.applyTransaction(entry.inverseTransaction);
    if (entry.transaction.selectionBefore) {
      selectionEngine.setSelection(entry.transaction.selectionBefore);
    }
    onMutated();
  });

  registry.register('redo', () => {
    const entry = historyManager.popRedo();
    if (!entry) return;
    transactionEngine.applyTransaction(entry.transaction);
    if (entry.transaction.selectionAfter) {
      selectionEngine.setSelection(entry.transaction.selectionAfter);
    }
    onMutated();
  });

  // 13. Select All
  registry.register('selectAll', () => {
    if (doc.blocks.length === 0) return;
    const firstBlock = doc.blocks[0];
    const lastBlock = doc.blocks[doc.blocks.length - 1];
    selectionEngine.setSelection({
      anchor: { blockId: firstBlock.id, offset: 0 },
      focus: { blockId: lastBlock.id, offset: doc.getBlockLength(lastBlock) },
    });
  });

  // 14. Clear Formatting
  registry.register('clearFormatting', () => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    if (!isSelectionCollapsed(sel)) {
      const { start, end } = normalizeSelection(sel, doc);
      executeTx(
        [
          {
            type: 'set-text-style',
            start,
            end,
            marks: {
              bold: false,
              italic: false,
              underline: false,
              strike: false,
              foregroundColor: DEFAULT_TEXT_MARKS.foregroundColor,
              backgroundColor: undefined,
              fontSize: DEFAULT_TEXT_MARKS.fontSize,
              fontFamily: DEFAULT_TEXT_MARKS.fontFamily,
              link: undefined,
            },
          },
        ],
        'toolbar'
      );
    }
  });
}
