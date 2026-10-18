import { DocumentModel } from '../core/model/document-model';
import { createInitialDocument, createParagraphWithText, DEFAULT_SETTINGS } from '../core/model/defaults';
import { generateBlockId } from '../core/utils/id-generator';

export function runModelTests(): { passed: boolean; results: string[] } {
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

  // Test 1: Initial Document
  const docData = createInitialDocument('doc-test-1', 'Báo cáo mẫu');
  const doc = new DocumentModel(docData);
  assert(doc.id === 'doc-test-1', 'Document ID matches');
  assert(doc.title === 'Báo cáo mẫu', 'Document title matches');
  assert(doc.blocks.length === 1, 'Initial document has 1 block');

  // Test 2: Text Runs Normalization
  const runs = [
    { id: 'r1', text: 'Xin chào ', marks: { bold: true } },
    { id: 'r2', text: 'Việt Nam', marks: { bold: true } },
    { id: 'r3', text: '!', marks: { bold: false } },
  ];
  const normalized = DocumentModel.normalizeRuns(runs);
  assert(normalized.length === 2, 'Adjacent runs with same marks are merged');
  assert(normalized[0].text === 'Xin chào Việt Nam', 'Merged run text is combined');
  assert(normalized[1].text === '!', 'Different run remains intact');

  // Test 3: Block Queries
  const para = createParagraphWithText('Dòng văn bản thử nghiệm');
  doc.blocks.push(para);
  assert(doc.blocks.length === 2, 'Added block successfully');
  assert(doc.getBlockLength(para) === 'Dòng văn bản thử nghiệm'.length, 'Calculated correct block length');
  assert(doc.getBlockText(para) === 'Dòng văn bản thử nghiệm', 'Extracted correct block plain text');

  return { passed, results };
}
