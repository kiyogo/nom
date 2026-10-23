import { DocumentModel } from '../model/document-model';
import { SelectionEngine } from '../selection/selection-engine';
import { CommandRegistry } from '../commands/command-registry';
import {
  getNextGraphemeOffset,
  getPreviousGraphemeOffset,
  getNextWordOffset,
  getPreviousWordOffset,
} from '../utils/unicode';
import { DocPosition, isSelectionCollapsed, normalizeSelection } from '../selection/position';
import { DocumentLayout } from '../layout/layout-types';
import { HitTester } from '../hit-testing/hit-tester';
import { CompositionManager } from './composition-manager';

export class KeyboardController {
  private doc: DocumentModel;
  private selectionEngine: SelectionEngine;
  private commands: CommandRegistry;
  private getLayout: () => DocumentLayout;
  private compositionManager?: CompositionManager | null;

  public lastBackspaceHandledTime = 0;
  public lastDeleteHandledTime = 0;
  public lastEnterHandledTime = 0;

  constructor(
    doc: DocumentModel,
    selectionEngine: SelectionEngine,
    commands: CommandRegistry,
    getLayout: () => DocumentLayout,
    compositionManager?: CompositionManager | null
  ) {
    this.doc = doc;
    this.selectionEngine = selectionEngine;
    this.commands = commands;
    this.getLayout = getLayout;
    this.compositionManager = compositionManager;
  }

  public setDocument(doc: DocumentModel): void {
    this.doc = doc;
  }

  public setCompositionManager(cm: CompositionManager | null): void {
    this.compositionManager = cm;
  }

  private executeCommand(name: string, payload?: any): void {
    if (this.commands && typeof this.commands.execute === 'function') {
      this.commands.execute(name, payload);
    }
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (e.isComposing || e.keyCode === 229) {
      return false;
    }

    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key;

    // 1. History (Undo / Redo)
    if (mod && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      if (shift) {
        this.executeCommand('redo');
      } else {
        this.executeCommand('undo');
      }
      return true;
    }
    if (mod && (key === 'y' || key === 'Y')) {
      e.preventDefault();
      this.executeCommand('redo');
      return true;
    }

    // 2. Select All
    if (mod && (key === 'a' || key === 'A')) {
      e.preventDefault();
      this.executeCommand('selectAll');
      return true;
    }

    // 3. Clipboard (Copy / Cut / Paste)
    if (mod && (key === 'c' || key === 'C')) {
      e.preventDefault();
      this.executeCommand('copy');
      return true;
    }
    if (mod && (key === 'x' || key === 'X')) {
      e.preventDefault();
      this.executeCommand('cut');
      return true;
    }
    if (mod && (key === 'v' || key === 'V')) {
      // Let each native paste event insert once, including key auto-repeat.
      // Do not also read/insert clipboard data from the keydown handler.
      return false;
    }

    // 4. Formatting Shortcuts
    if (mod && (key === 'b' || key === 'B')) {
      e.preventDefault();
      this.executeCommand('toggleBold');
      return true;
    }
    if (mod && (key === 'i' || key === 'I')) {
      e.preventDefault();
      this.executeCommand('toggleItalic');
      return true;
    }
    if (mod && (key === 'u' || key === 'U')) {
      e.preventDefault();
      this.executeCommand('toggleUnderline');
      return true;
    }

    // 5. Save
    if (mod && (key === 's' || key === 'S')) {
      e.preventDefault();
      this.executeCommand('save');
      return true;
    }

    // 6. Find & Replace
    if (mod && (key === 'f' || key === 'F')) {
      e.preventDefault();
      this.executeCommand('openFind');
      return true;
    }
    if (mod && (key === 'h' || key === 'H')) {
      e.preventDefault();
      this.executeCommand('openReplace');
      return true;
    }

    // 7. Print
    if (mod && (key === 'p' || key === 'P')) {
      e.preventDefault();
      this.executeCommand('print');
      return true;
    }

    // 6. Navigation: Arrow Left / Right
    if (key === 'ArrowLeft') {
      e.preventDefault();
      this.handleArrowHorizontal('left', mod, shift);
      return true;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      this.handleArrowHorizontal('right', mod, shift);
      return true;
    }

    // 7. Navigation: Arrow Up / Down
    if (key === 'ArrowUp') {
      e.preventDefault();
      this.handleArrowVertical('up', shift);
      return true;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      this.handleArrowVertical('down', shift);
      return true;
    }

    // 8. Navigation: Home / End
    if (key === 'Home') {
      e.preventDefault();
      this.handleHomeEnd('home', mod, shift);
      return true;
    }
    if (key === 'End') {
      e.preventDefault();
      this.handleHomeEnd('end', mod, shift);
      return true;
    }

    // 9. Backspace & Delete
    if (key === 'Backspace') {
      e.preventDefault();
      this.lastBackspaceHandledTime = Date.now();
      this.executeCommand('deleteBackward');
      return true;
    }
    if (key === 'Delete') {
      e.preventDefault();
      this.lastDeleteHandledTime = Date.now();
      this.executeCommand('deleteForward');
      return true;
    }

    // 10. Enter & Shift+Enter
    if (key === 'Enter') {
      e.preventDefault();
      // If an IME composition (Vietnamese Telex, VNI, CJK) has just completed,
      // the Enter key was used solely to commit the word candidate.
      // Do NOT split the paragraph or insert an unexpected newline!
      if (this.compositionManager?.isRecentComposition(150)) {
        return true;
      }
      this.lastEnterHandledTime = Date.now();
      if (shift) {
        this.executeCommand('insertLineBreak');
      } else {
        this.executeCommand('insertParagraph');
      }
      return true;
    }

    // 11. Tab / Shift+Tab (Indent)
    if (key === 'Tab') {
      e.preventDefault();
      if (shift) {
        this.executeCommand('decreaseIndent');
      } else {
        this.executeCommand('increaseIndent');
      }
      return true;
    }

    return false;
  }

  private handleArrowHorizontal(direction: 'left' | 'right', wordJump: boolean, extend: boolean): void {
    const sel = this.selectionEngine.getSelection();
    if (!sel) return;

    const currentFocus = sel.focus;
    const block = this.doc.getBlockById(currentFocus.blockId);
    if (!block) return;

    const blockText = this.doc.getBlockText(block);
    let nextOffset = currentFocus.offset;
    let nextBlockId = currentFocus.blockId;

    if (direction === 'left') {
      if (wordJump) {
        nextOffset = getPreviousWordOffset(blockText, currentFocus.offset);
      } else {
        if (currentFocus.offset > 0) {
          nextOffset = getPreviousGraphemeOffset(blockText, currentFocus.offset);
        } else {
          // Jump to previous block end
          const idx = this.doc.getBlockIndex(currentFocus.blockId);
          if (idx > 0) {
            const prevBlock = this.doc.blocks[idx - 1];
            nextBlockId = prevBlock.id;
            nextOffset = this.doc.getBlockLength(prevBlock);
          }
        }
      }
    } else {
      // right
      if (wordJump) {
        nextOffset = getNextWordOffset(blockText, currentFocus.offset);
      } else {
        if (currentFocus.offset < blockText.length) {
          nextOffset = getNextGraphemeOffset(blockText, currentFocus.offset);
        } else {
          // Jump to next block start
          const idx = this.doc.getBlockIndex(currentFocus.blockId);
          if (idx < this.doc.blocks.length - 1) {
            const nextBlock = this.doc.blocks[idx + 1];
            nextBlockId = nextBlock.id;
            nextOffset = 0;
          }
        }
      }
    }

    const nextPos: DocPosition = { blockId: nextBlockId, offset: nextOffset };

    if (extend) {
      this.selectionEngine.setSelection({
        anchor: sel.anchor,
        focus: nextPos,
      });
    } else {
      if (!isSelectionCollapsed(sel) && !wordJump) {
        // Collapse selection to start (left) or end (right)
        const { start, end } = normalizeSelection(sel, this.doc);
        const targetPos = direction === 'left' ? start : end;
        this.selectionEngine.setSelection({ anchor: targetPos, focus: targetPos });
      } else {
        this.selectionEngine.setSelection({ anchor: nextPos, focus: nextPos });
      }
    }
  }

  private handleArrowVertical(direction: 'up' | 'down', extend: boolean): void {
    const sel = this.selectionEngine.getSelection();
    if (!sel) return;

    const layout = this.getLayout();
    const currentCaret = HitTester.getCaretGeometry(sel.focus, layout, this.doc);
    if (!currentCaret) return;

    let targetX = this.selectionEngine.getPreferredCaretX();
    if (targetX === null) {
      targetX = currentCaret.x;
      this.selectionEngine.setPreferredCaretX(targetX);
    }

    const lineHeight = currentCaret.height;
    const targetY = direction === 'up' ? currentCaret.y - lineHeight / 2 - 4 : currentCaret.y + lineHeight + 4;
    let targetPage = currentCaret.pageIndex;

    // Check page boundaries
    if (targetY < 0 && targetPage > 0) {
      targetPage -= 1;
    } else if (targetY > layout.pages[targetPage]?.height && targetPage < layout.pages.length - 1) {
      targetPage += 1;
    }

    const nextPos = HitTester.hitTestPoint(targetPage, targetX, targetY, layout, this.doc);
    if (!nextPos) return;

    if (extend) {
      this.selectionEngine.setSelection(
        { anchor: sel.anchor, focus: nextPos },
        { resetPreferredX: false }
      );
    } else {
      this.selectionEngine.setSelection(
        { anchor: nextPos, focus: nextPos },
        { resetPreferredX: false }
      );
    }
  }

  private handleHomeEnd(key: 'home' | 'end', mod: boolean, extend: boolean): void {
    const sel = this.selectionEngine.getSelection();
    if (!sel) return;

    let nextPos: DocPosition;

    if (mod) {
      // Whole document start/end
      if (key === 'home') {
        const firstBlock = this.doc.blocks[0];
        nextPos = { blockId: firstBlock.id, offset: 0 };
      } else {
        const lastBlock = this.doc.blocks[this.doc.blocks.length - 1];
        nextPos = { blockId: lastBlock.id, offset: this.doc.getBlockLength(lastBlock) };
      }
    } else {
      // Current block start/end
      const block = this.doc.getBlockById(sel.focus.blockId);
      if (!block) return;
      nextPos = {
        blockId: sel.focus.blockId,
        offset: key === 'home' ? 0 : this.doc.getBlockLength(block),
      };
    }

    if (extend) {
      this.selectionEngine.setSelection({ anchor: sel.anchor, focus: nextPos });
    } else {
      this.selectionEngine.setSelection({ anchor: nextPos, focus: nextPos });
    }
  }
}
