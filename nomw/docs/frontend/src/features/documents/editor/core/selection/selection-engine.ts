import { DocumentModel } from '../model/document-model';
import { TextMarks, ParagraphStyle } from '../model/types';
import {
  DocPosition,
  EditorSelection,
  isSelectionCollapsed,
  normalizeSelection,
  clonePosition,
} from './position';
import { DEFAULT_TEXT_MARKS, DEFAULT_PARAGRAPH_STYLE } from '../model/defaults';
import { TypedEventBus } from '../utils/event-bus';

export class SelectionEngine {
  private selection: EditorSelection | null = null;
  private pendingMarks: TextMarks | null = null;
  private preferredCaretX: number | null = null;
  private eventBus: TypedEventBus;

  constructor(eventBus: TypedEventBus) {
    this.eventBus = eventBus;
  }

  public getSelection(): EditorSelection | null {
    return this.selection;
  }

  public setSelection(
    sel: EditorSelection | null,
    options: { resetPendingMarks?: boolean; resetPreferredX?: boolean; silent?: boolean } = {}
  ): void {
    const prev = this.selection;
    if (
      prev === sel ||
      (
        prev &&
        sel &&
        prev.anchor.blockId === sel.anchor.blockId &&
        prev.anchor.offset === sel.anchor.offset &&
        prev.focus.blockId === sel.focus.blockId &&
        prev.focus.offset === sel.focus.offset
      )
    ) {
      return;
    }

    this.selection = sel;

    if (options.resetPendingMarks ?? true) {
      this.pendingMarks = null;
    }

    if (options.resetPreferredX ?? true) {
      this.preferredCaretX = null;
    }

    if (!options.silent) {
      this.eventBus.emit('selectionChanged', {
        hasSelection: Boolean(sel),
        isCollapsed: isSelectionCollapsed(sel),
      });
    }
  }

  public setCursor(
    blockId: string,
    offset: number,
    affinity?: 'forward' | 'backward',
    options?: { resetPendingMarks?: boolean; resetPreferredX?: boolean; silent?: boolean }
  ): void {
    const pos: DocPosition = { blockId, offset, affinity };
    this.setSelection({ anchor: pos, focus: pos }, options);
  }

  public setPreferredCaretX(x: number | null): void {
    this.preferredCaretX = x;
  }

  public getPreferredCaretX(): number | null {
    return this.preferredCaretX;
  }

  public setPendingMarks(marks: TextMarks | null): void {
    this.pendingMarks = marks ? { ...marks } : null;
  }

  public getPendingMarks(): TextMarks | null {
    return this.pendingMarks;
  }

  /**
   * Resolves currently active text marks at cursor or across selection.
   */
  public getActiveMarks(doc: DocumentModel): TextMarks {
    if (this.pendingMarks) {
      return { ...DEFAULT_TEXT_MARKS, ...this.pendingMarks };
    }

    if (!this.selection) {
      return { ...DEFAULT_TEXT_MARKS };
    }

    const { start } = normalizeSelection(this.selection, doc);
    const block = doc.getBlockById(start.blockId);
    if (!block || !('runs' in block) || block.runs.length === 0) {
      return { ...DEFAULT_TEXT_MARKS };
    }

    let offset = 0;
    for (const run of block.runs) {
      offset += run.text.length;
      if (offset >= start.offset || offset === 0) {
        return { ...DEFAULT_TEXT_MARKS, ...run.marks };
      }
    }

    const lastRun = block.runs[block.runs.length - 1];
    return { ...DEFAULT_TEXT_MARKS, ...(lastRun?.marks || {}) };
  }

  /**
   * Resolves currently active paragraph style.
   */
  public getActiveParagraphStyle(doc: DocumentModel): ParagraphStyle {
    if (!this.selection) return { ...DEFAULT_PARAGRAPH_STYLE };
    const { start } = normalizeSelection(this.selection, doc);
    const block = doc.getBlockById(start.blockId);
    if (block && 'style' in block) {
      return { ...DEFAULT_PARAGRAPH_STYLE, ...block.style };
    }
    return { ...DEFAULT_PARAGRAPH_STYLE };
  }
}
