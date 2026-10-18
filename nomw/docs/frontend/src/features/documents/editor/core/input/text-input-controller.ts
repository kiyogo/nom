import { CommandRegistry } from '../commands/command-registry';
import { CompositionManager } from './composition-manager';
import { SelectionEngine } from '../selection/selection-engine';
import { DocumentModel } from '../model/document-model';
import type { KeyboardController } from './keyboard-controller';

export type OptimisticTextHandler = (text: string) => void;

export class TextInputController {
  private inputElement: HTMLTextAreaElement | null = null;
  private commands: CommandRegistry;
  private compositionManager: CompositionManager;
  private selectionEngine: SelectionEngine;
  private doc: DocumentModel;
  private keyboardController: KeyboardController | null = null;
  private isProcessingInput = false;
  private justFinishedComposition = false;
  private compositionTimeout: any = null;
  private listenerAbortController: AbortController | null = null;
  private optimisticTextHandler: OptimisticTextHandler | null = null;

  constructor(
    commands: CommandRegistry,
    compositionManager: CompositionManager,
    selectionEngine: SelectionEngine,
    doc: DocumentModel,
    keyboardController?: KeyboardController | null
  ) {
    this.commands = commands;
    this.compositionManager = compositionManager;
    this.selectionEngine = selectionEngine;
    this.doc = doc;
    this.keyboardController = keyboardController || null;
  }

  public setDocument(doc: DocumentModel): void {
    this.doc = doc;
  }

  public setKeyboardController(kc: KeyboardController | null): void {
    this.keyboardController = kc;
  }

  public setOptimisticTextHandler(handler: OptimisticTextHandler | null): void {
    this.optimisticTextHandler = handler;
  }

  public attach(element: HTMLTextAreaElement): void {
    this.listenerAbortController?.abort();
    this.inputElement = element;
    this.setupEventListeners();
  }

  public focus(): void {
    if (this.inputElement && document.activeElement !== this.inputElement) {
      this.inputElement.focus({ preventScroll: true });
    }
  }

  public blur(): void {
    this.inputElement?.blur();
  }

  private setupEventListeners(): void {
    if (!this.inputElement) return;

    const el = this.inputElement;
    this.listenerAbortController = new AbortController();
    const listenerOptions = { signal: this.listenerAbortController.signal };

    // Composition events (Vietnamese Telex/VNI, CJK IME)
    el.addEventListener('compositionstart', () => {
      if (this.compositionTimeout) {
        clearTimeout(this.compositionTimeout);
        this.compositionTimeout = null;
      }
      this.justFinishedComposition = false;

      const sel = this.selectionEngine.getSelection();
      if (!sel) return;
      this.compositionManager.startComposition(sel.focus.blockId, sel.focus.offset);
    }, listenerOptions);

    el.addEventListener('compositionupdate', (e: CompositionEvent) => {
      this.justFinishedComposition = false;
      const update = this.compositionManager.updateComposition(e.data);
      if (update) {
        this.commands.execute('replaceCompositionText', update);
      }
    }, listenerOptions);

    el.addEventListener('compositionend', (e: CompositionEvent) => {
      const finalVal = e.data;
      const endRes = this.compositionManager.endComposition(finalVal);
      if (endRes) {
        this.commands.execute('replaceCompositionText', endRes);
      }
      el.value = '';
      this.justFinishedComposition = true;

      if (this.compositionTimeout) {
        clearTimeout(this.compositionTimeout);
      }
      this.compositionTimeout = setTimeout(() => {
        this.justFinishedComposition = false;
      }, 80);
    }, listenerOptions);

    // Beforeinput event (intercepts standard browser text inputs & Unikey replacement events)
    el.addEventListener('beforeinput', (e: InputEvent) => {
      if (this.compositionManager.isComposing()) {
        return;
      }

      // If composition has just finished, ignore trailing composition insert events
      if (e.inputType === 'insertFromComposition' || e.inputType === 'insertCompositionText') {
        e.preventDefault();
        this.justFinishedComposition = false;
        el.value = '';
        return;
      }

      const inputType = e.inputType;

      if ((inputType === 'insertText' || inputType === 'insertReplacementText') && e.data) {
        e.preventDefault();
        this.optimisticTextHandler?.(e.data);
        this.commands.execute('insertText', { text: e.data });
        el.value = '';
      } else if (inputType === 'deleteContentBackward') {
        e.preventDefault();
        this.optimisticTextHandler?.('');
        const now = Date.now();
        // If keyboardController already handled Backspace via keydown in the last 45ms,
        // ignore duplicate deleteContentBackward to prevent deleting 2 characters (e.g. Unikey/EVKey)
        if (this.keyboardController && now - this.keyboardController.lastBackspaceHandledTime < 45) {
          el.value = '';
          return;
        }
        if (this.keyboardController) {
          this.keyboardController.lastBackspaceHandledTime = now;
        }
        this.commands.execute('deleteBackward');
        el.value = '';
      } else if (inputType === 'deleteContentForward') {
        e.preventDefault();
        this.optimisticTextHandler?.('');
        const now = Date.now();
        if (this.keyboardController && now - this.keyboardController.lastDeleteHandledTime < 45) {
          el.value = '';
          return;
        }
        if (this.keyboardController) {
          this.keyboardController.lastDeleteHandledTime = now;
        }
        this.commands.execute('deleteForward');
        el.value = '';
      } else if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
        e.preventDefault();
        this.optimisticTextHandler?.('');
        // Guard against IME candidate commit Enter splitting paragraph
        if (this.compositionManager.isRecentComposition(150)) {
          el.value = '';
          return;
        }
        const now = Date.now();
        if (this.keyboardController && now - this.keyboardController.lastEnterHandledTime < 45) {
          el.value = '';
          return;
        }
        if (this.keyboardController) {
          this.keyboardController.lastEnterHandledTime = now;
        }
        this.commands.execute('insertParagraph');
        el.value = '';
      } else if (inputType === 'insertFromPaste') {
        e.preventDefault();
        el.value = '';
      }
    }, listenerOptions);

    // Always clear the hidden input value on input event so it never holds buffer text
    el.addEventListener('input', () => {
      el.value = '';
    }, listenerOptions);
  }
}
