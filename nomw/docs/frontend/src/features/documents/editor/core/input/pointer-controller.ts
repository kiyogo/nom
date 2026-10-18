import { DocumentModel } from '../model/document-model';
import { SelectionEngine } from '../selection/selection-engine';
import { DocumentLayout } from '../layout/layout-types';
import { HitTester } from '../hit-testing/hit-tester';
import { getWordBoundsAtOffset } from '../utils/unicode';
import { DocPosition } from '../selection/position';
import { CommandRegistry } from '../commands/command-registry';

export class PointerController {
  private doc: DocumentModel;
  private selectionEngine: SelectionEngine;
  private getLayout: () => DocumentLayout;
  private commands?: CommandRegistry;
  private isSelecting: boolean = false;
  private clickCount: number = 0;
  private lastClickTime: number = 0;
  private lastClickPos: { x: number; y: number } | null = null;
  private autoScrollInterval: number | null = null;
  private pendingSelection:
    | { anchor: DocPosition; focus: DocPosition }
    | null = null;
  private selectionFrame: number | null = null;

  constructor(
    doc: DocumentModel,
    selectionEngine: SelectionEngine,
    getLayout: () => DocumentLayout,
    commands?: CommandRegistry
  ) {
    this.doc = doc;
    this.selectionEngine = selectionEngine;
    this.getLayout = getLayout;
    this.commands = commands;
  }

  public setDocument(doc: DocumentModel): void {
    this.doc = doc;
  }

  public setCommands(commands: CommandRegistry): void {
    this.commands = commands;
  }

  public handlePointerDown(
    e: React.PointerEvent<HTMLCanvasElement>,
    pageIndex: number,
    zoom: number
  ): void {
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}

    const rect = target.getBoundingClientRect();
    const docX = (e.clientX - rect.left) / zoom;
    const docY = (e.clientY - rect.top) / zoom;

    const now = Date.now();
    if (
      this.lastClickPos &&
      now - this.lastClickTime < 350 &&
      Math.hypot(e.clientX - this.lastClickPos.x, e.clientY - this.lastClickPos.y) < 8
    ) {
      this.clickCount += 1;
    } else {
      this.clickCount = 1;
    }

    this.lastClickTime = now;
    this.lastClickPos = { x: e.clientX, y: e.clientY };

    const layout = this.getLayout();
    const page = layout.pages[pageIndex];

    const pos = HitTester.hitTestPoint(pageIndex, docX, docY, layout, this.doc);

    // Click-and-Type: only if user clicked significantly below all blocks on the last page
    if (!pos && page && page.blocks.length > 0 && this.commands && this.clickCount === 1) {
      const pageBottomY = page.blocks.reduce((maxY, b) => Math.max(maxY, b.rect.y + b.rect.height), 0);
      if (docY > pageBottomY + 20) {
        const lastBlock = this.doc.blocks[this.doc.blocks.length - 1];
        if (lastBlock) {
          const lastLen = this.doc.getBlockLength(lastBlock);
          this.selectionEngine.setCursor(lastBlock.id, lastLen);
        }

        const lineHeight = 24;
        const linesToAdd = Math.min(20, Math.max(1, Math.floor((docY - pageBottomY) / lineHeight)));
        for (let i = 0; i < linesToAdd; i++) {
          this.commands.execute('insertParagraph');
        }

        const updatedLayout = this.getLayout();
        const newPos = HitTester.hitTestPoint(pageIndex, docX, docY, updatedLayout, this.doc);
        if (newPos) {
          this.selectionEngine.setCursor(newPos.blockId, newPos.offset);
          this.isSelecting = true;
          return;
        }
      }
    }

    if (!pos) return;

    if (this.clickCount === 2) {
      // Double click: Select Word
      const block = this.doc.getBlockById(pos.blockId);
      if (block) {
        const text = this.doc.getBlockText(block);
        const { start, end } = getWordBoundsAtOffset(text, pos.offset);
        this.selectionEngine.setSelection({
          anchor: { blockId: pos.blockId, offset: start },
          focus: { blockId: pos.blockId, offset: end },
        });
      }
      this.isSelecting = false;
      return;
    }

    if (this.clickCount >= 3) {
      // Triple click: Select Entire Paragraph
      const block = this.doc.getBlockById(pos.blockId);
      if (block) {
        this.selectionEngine.setSelection({
          anchor: { blockId: pos.blockId, offset: 0 },
          focus: { blockId: pos.blockId, offset: this.doc.getBlockLength(block) },
        });
      }
      this.isSelecting = false;
      return;
    }

    // Single click / Shift+Click
    if (e.shiftKey) {
      const currentSel = this.selectionEngine.getSelection();
      if (currentSel) {
        this.selectionEngine.setSelection({
          anchor: currentSel.anchor,
          focus: pos,
        });
        return;
      }
    }

    this.isSelecting = true;
    this.selectionEngine.setCursor(pos.blockId, pos.offset, pos.affinity);
  }

  public handlePointerMove(
    e: React.PointerEvent<HTMLCanvasElement>,
    pageIndex: number,
    zoom: number
  ): void {
    if (!this.isSelecting) return;

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const docX = (e.clientX - rect.left) / zoom;
    const docY = (e.clientY - rect.top) / zoom;

    const layout = this.getLayout();
    const pos = HitTester.hitTestPoint(pageIndex, docX, docY, layout, this.doc);
    if (!pos) return;

    const currentSel = this.selectionEngine.getSelection();
    if (currentSel) {
      this.queueSelection({
        anchor: currentSel.anchor,
        focus: pos,
      });
    }
  }

  public handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (this.pendingSelection) {
      this.flushSelection();
    }
    if (this.isSelecting) {
      this.isSelecting = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }

  private queueSelection(selection: { anchor: DocPosition; focus: DocPosition }): void {
    this.pendingSelection = selection;
    if (this.selectionFrame !== null) return;

    this.selectionFrame = window.requestAnimationFrame(() => {
      this.flushSelection();
    });
  }

  private flushSelection(): void {
    if (this.selectionFrame !== null) {
      window.cancelAnimationFrame(this.selectionFrame);
      this.selectionFrame = null;
    }
    if (!this.pendingSelection) return;
    const next = this.pendingSelection;
    this.pendingSelection = null;
    this.selectionEngine.setSelection(next);
  }
}
