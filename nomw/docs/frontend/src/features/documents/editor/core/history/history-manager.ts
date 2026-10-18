import { EditorTransaction } from '../transactions/transaction-engine';

export interface HistoryEntry {
  transaction: EditorTransaction;
  inverseTransaction: EditorTransaction;
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxStackSize: number = 200;
  private lastTypingTime: number = 0;
  private isGroupingTyping: boolean = false;

  constructor(maxStackSize = 200) {
    this.maxStackSize = maxStackSize;
  }

  public record(tx: EditorTransaction, inverseTx: EditorTransaction): void {
    if (tx.source === 'history' || tx.source === 'remote') {
      return; // Do not record history replay or remote collaborator operations in local undo
    }

    // Check if we should merge consecutive single typing operations
    const isSingleTyping =
      tx.source === 'keyboard' &&
      tx.operations.length === 1 &&
      tx.operations[0].type === 'insert-text' &&
      tx.operations[0].text.length === 1;

    const now = Date.now();
    const canGroup = isSingleTyping && this.isGroupingTyping && now - this.lastTypingTime < 1000;

    if (canGroup && this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1];
      // Append operations to existing top entry
      top.transaction.operations.push(...tx.operations);
      top.transaction.selectionAfter = tx.selectionAfter;
      top.inverseTransaction.operations.unshift(...inverseTx.operations);
      top.inverseTransaction.selectionBefore = tx.selectionAfter;
      this.lastTypingTime = now;
      return;
    }

    // New history entry
    this.undoStack.push({ transaction: tx, inverseTransaction: inverseTx });
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    // Clear redo stack on new action
    this.redoStack = [];

    this.isGroupingTyping = isSingleTyping;
    this.lastTypingTime = now;
  }

  public breakGroup(): void {
    this.isGroupingTyping = false;
    this.lastTypingTime = 0;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public popUndo(): HistoryEntry | null {
    this.breakGroup();
    if (this.undoStack.length === 0) return null;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);
    return entry;
  }

  public popRedo(): HistoryEntry | null {
    this.breakGroup();
    if (this.redoStack.length === 0) return null;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);
    return entry;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.breakGroup();
  }
}
