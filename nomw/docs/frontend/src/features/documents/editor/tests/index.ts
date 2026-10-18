import { runModelTests } from './model.test';
import { runTransactionTests } from './transaction.test';
import { runLayoutTests } from './layout.test';
import { runVietnameseImeTests } from './vietnamese-ime.test';
import { runSerializationTests } from './serialization.test';

export function runAllEditorTests(): { allPassed: boolean; testCount: number; results: string[] } {
  const modelRes = runModelTests();
  const txRes = runTransactionTests();
  const layoutRes = runLayoutTests();
  const viRes = runVietnameseImeTests();
  const serRes = runSerializationTests();

  const allPassed =
    modelRes.passed && txRes.passed && layoutRes.passed && viRes.passed && serRes.passed;
  const results = [
    ...modelRes.results,
    ...txRes.results,
    ...layoutRes.results,
    ...viRes.results,
    ...serRes.results,
  ];

  return {
    allPassed,
    testCount: results.length,
    results,
  };
}
