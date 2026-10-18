import { DocumentModel } from '../core/model/document-model';
import { createInitialDocument, createParagraphWithText, createHeading, createTable } from '../core/model/defaults';
import { layoutEngine } from '../core/layout/layout-engine';
import { HitTester } from '../core/hit-testing/hit-tester';

export function runLayoutTests(): { passed: boolean; results: string[] } {
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

  const doc = new DocumentModel(createInitialDocument('doc-layout-test'));
  doc.blocks.push(createHeading(1, 'Tiêu đề chính văn bản'));
  doc.blocks.push(createParagraphWithText('Đây là đoạn văn bản đầu tiên được định dạng chuẩn với layout engine.'));
  doc.blocks.push(createTable(2, 2));

  // Test 1: Layout calculation
  const layout = layoutEngine.layoutDocument(doc);
  assert(layout.pages.length >= 1, 'Document has at least 1 page');
  assert(layout.pages[0].blocks.length === doc.blocks.length, 'All blocks are present in layout');
  assert(layout.pages[0].hitTestIndex.length > 0, 'Hit test index generated for page');

  // Test 2: Hit-Testing
  const firstBlock = doc.blocks[0];
  const caretGeom = HitTester.getCaretGeometry({ blockId: firstBlock.id, offset: 0 }, layout, doc);
  assert(caretGeom !== null, 'Found caret geometry for block offset 0');
  if (caretGeom) {
    assert(caretGeom.x >= 0 && caretGeom.y >= 0, 'Caret coordinates are valid positive numbers');
  }

  // Test 3: Selection Rectangles
  const selRects = HitTester.getSelectionRectangles(
    {
      anchor: { blockId: doc.blocks[1].id, offset: 0 },
      focus: { blockId: doc.blocks[1].id, offset: 10 },
    },
    layout,
    doc
  );
  assert(selRects.length > 0, 'Selection rectangles generated for text range');

  return { passed, results };
}
