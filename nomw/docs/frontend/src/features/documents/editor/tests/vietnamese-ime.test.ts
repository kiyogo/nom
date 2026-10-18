import { DocumentModel } from '../core/model/document-model';
import { createInitialDocument } from '../core/model/defaults';
import { TransactionEngine } from '../core/transactions/transaction-engine';
import { CommandRegistry } from '../core/commands/command-registry';
import { SelectionEngine } from '../core/selection/selection-engine';
import { CompositionManager } from '../core/input/composition-manager';
import { registerEditorCommands } from '../core/commands/editor-commands';
import { TypedEventBus } from '../core/utils/event-bus';
import { HistoryManager } from '../core/history/history-manager';
import { getPreviousGraphemeOffset, getNextGraphemeOffset, getGraphemeClusters } from '../core/utils/unicode';

export function runVietnameseImeTests(): { passed: boolean; results: string[] } {
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

  const eventBus = new TypedEventBus();
  const doc = new DocumentModel(createInitialDocument('doc-vi-test'));
  const selectionEngine = new SelectionEngine(eventBus);
  const transactionEngine = new TransactionEngine(doc, 'client-vi');
  const historyManager = new HistoryManager();
  const commandRegistry = new CommandRegistry();
  const compositionManager = new CompositionManager();

  registerEditorCommands(
    commandRegistry,
    doc,
    selectionEngine,
    transactionEngine,
    historyManager,
    () => {}
  );

  const firstBlock = doc.blocks[0];
  selectionEngine.setCursor(firstBlock.id, 0);

  // Test 1: Insert Vietnamese Text
  const viText = 'Xin chào Việt Nam, đây là công nghệ tài liệu KIYOVN.';
  commandRegistry.execute('insertText', { text: viText });
  assert(doc.getBlockText(firstBlock) === viText, 'Inserted full Vietnamese sentence accurately');

  // Test 2: Grapheme clusters & accented character segmentation
  const complexVi = 'Nguyễn Đức Đại Sơn';
  const clusters = getGraphemeClusters(complexVi);
  assert(clusters.length === complexVi.length, 'Segmented accented Vietnamese graphemes without splitting combining marks');

  // Test 3: Emoji and composite characters
  const emojiStr = 'Xin chào 👋 Việt Nam 🇻🇳';
  const emojiClusters = getGraphemeClusters(emojiStr);
  assert(emojiClusters.includes('👋'), 'Preserved wave hand emoji cluster');
  assert(emojiClusters.includes('🇻🇳'), 'Preserved flag emoji combining sequence');

  // Test 4: Grapheme deletion (Backspace on emoji and accents)
  const prevOffset = getPreviousGraphemeOffset(emojiStr, emojiStr.length);
  assert(prevOffset < emojiStr.length, 'Calculated previous grapheme offset before flag emoji');
  assert(emojiStr.slice(0, prevOffset) === 'Xin chào 👋 Việt Nam ', 'Backspace deletes whole flag emoji without corrupting surrogate pair');

  // Test 5: Composition Manager (Telex / VNI IME)
  compositionManager.startComposition(firstBlock.id, 0);
  assert(compositionManager.isComposing() === true, 'Composition started');
  compositionManager.updateComposition('vieetj');
  assert(compositionManager.getComposingText() === 'vieetj', 'Composition updated buffer');
  const compEnd = compositionManager.endComposition();
  assert(compEnd !== null, 'Composition ended with result');
  assert(compositionManager.isComposing() === false, 'Composition state reset');

  return { passed, results };
}
