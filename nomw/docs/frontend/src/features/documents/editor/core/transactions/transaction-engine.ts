import { DocumentModel } from '../model/document-model';
import { EditorOperation, applyOperation } from './operations';
import { EditorSelection } from '../selection/position';
import { generateTransactionId } from '../utils/id-generator';

export type TransactionSource =
  | 'keyboard'
  | 'toolbar'
  | 'paste'
  | 'remote'
  | 'history'
  | 'system';

export interface EditorTransaction {
  id: string;
  documentId: string;
  clientId: string;
  baseRevision: number;
  operations: EditorOperation[];
  inverseOperations?: EditorOperation[];
  timestamp: number;
  source: TransactionSource;
  selectionBefore?: EditorSelection | null;
  selectionAfter?: EditorSelection | null;
}

export class TransactionEngine {
  private doc: DocumentModel;
  private clientId: string;

  constructor(doc: DocumentModel, clientId: string) {
    this.doc = doc;
    this.clientId = clientId;
  }

  public setDocument(doc: DocumentModel): void {
    this.doc = doc;
  }

  public createTransaction(
    operations: EditorOperation[],
    source: TransactionSource = 'keyboard',
    selectionBefore?: EditorSelection | null,
    selectionAfter?: EditorSelection | null
  ): EditorTransaction {
    return {
      id: generateTransactionId(),
      documentId: this.doc.id,
      clientId: this.clientId,
      baseRevision: this.doc.revision,
      operations,
      timestamp: Date.now(),
      source,
      selectionBefore,
      selectionAfter,
    };
  }

  /**
   * Applies all operations in a transaction sequentially and generates inverted operations for undo.
   */
  public applyTransaction(tx: EditorTransaction): { success: boolean; inverseTx: EditorTransaction } {
    const inverseOps: EditorOperation[] = [];

    for (const op of tx.operations) {
      const inverse = applyOperation(op, this.doc);
      if (inverse) {
        inverseOps.unshift(inverse); // Inverted operations apply in reverse order
      }
    }

    this.doc.data.metadata.updatedAt = new Date().toISOString();
    this.doc.incrementRevision();

    const inverseTx: EditorTransaction = {
      id: generateTransactionId(),
      documentId: tx.documentId,
      clientId: this.clientId,
      baseRevision: tx.baseRevision,
      operations: inverseOps,
      timestamp: Date.now(),
      source: 'history',
      selectionBefore: tx.selectionAfter,
      selectionAfter: tx.selectionBefore,
    };

    return { success: true, inverseTx };
  }
}
