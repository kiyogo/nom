import { DocumentModel } from '../core/model/document-model';
import { createInitialDocument, createParagraphWithText } from '../core/model/defaults';
import { TransactionEngine } from '../core/transactions/transaction-engine';
import { HistoryManager } from '../core/history/history-manager';

export function runTransactionTests(): { passed: boolean; results: string[] } {
  const results: string[] = [];
  let passed = true;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      passed = false;
      results.push(`FAIL: ${msg}`);
      console.error(`FAIL: ${msg}`);
    } else {
      results.push(`PASS: ${msg}`);
    }
  };

  const doc = new DocumentModel(createInitialDocument('doc-tx-test'));
  const engine = new TransactionEngine(doc, 'client-test');
  const history = new HistoryManager();

  const firstBlock = doc.blocks[0];

  // Test 1: Insert Text
  const tx1 = engine.createTransaction([
    {
      type: 'insert-text',
      blockId: firstBlock.id,
      offset: 0,
      text: 'Hello World',
    },
  ]);
  const res1 = engine.applyTransaction(tx1);
  history.record(tx1, res1.inverseTx);

  assert(doc.getBlockText(firstBlock) === 'Hello World', 'Inserted text successfully');
  assert(history.canUndo() === true, 'Undo stack has entry');

  // Test 2: Undo Insert Text
  const undoEntry = history.popUndo();
  assert(undoEntry !== null, 'Popped undo entry');
  if (undoEntry) {
    engine.applyTransaction(undoEntry.inverseTransaction);
    assert(doc.getBlockText(firstBlock) === '', 'Undid insert text correctly');
    assert(history.canRedo() === true, 'Redo stack has entry');
  }

  // Test 3: Redo Insert Text
  const redoEntry = history.popRedo();
  assert(redoEntry !== null, 'Popped redo entry');
  if (redoEntry) {
    engine.applyTransaction(redoEntry.transaction);
    assert(doc.getBlockText(firstBlock) === 'Hello World', 'Redid insert text correctly');
  }

  return { passed, results };
}
