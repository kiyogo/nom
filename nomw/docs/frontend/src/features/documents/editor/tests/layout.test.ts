import { DocumentModel } from '../core/model/document-model';
import { createInitialDocument, createParagraphWithText, createHeading, createTable } from '../core/model/defaults';
import { layoutEngine } from '../core/layout/layout-engine';
import { HitTester } from '../core/hit-testing/hit-tester';
import { layoutParagraphLines } from '../core/layout/line-breaker';
import { fontMetrics } from '../core/fonts/font-metrics-service';
import { getGraphemeClusters } from '../core/utils/unicode';

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

  // Typing after Space must fill the current line before wrapping only the
  // overflow; existing characters must not jump with the entire new token.
  const marks = { fontFamily: 'Times New Roman', fontSize: 14 };
  const prefix = 'g'.repeat(20) + ' ';
  const fittingText = prefix + 'g'.repeat(25);
  const contentWidth = fontMetrics.measureWidth(fittingText, marks) + 0.1;
  for (const alignment of ['left', 'center', 'right', 'justify'] as const) {
    for (const count of [25, 26, 40, 80]) {
      const text = prefix + 'g'.repeat(count);
      const result = layoutParagraphLines({
        blockId: 'space-wrap-regression',
        runs: [{ id: 'space-wrap-run', text, marks }],
        style: { alignment }, contentWidth, startX: 0, startY: 0,
      });
      const firstLineText = result.lines[0].runs.map(run => run.text).join('');
      assert(firstLineText === fittingText, `${alignment}: typing ${count} letters after Space fills first line`);
      assert(result.lines.flatMap(line => line.runs.map(run => run.text)).join('') === text,
        `${alignment}: wrapping preserves all spaces and characters (${count})`);
      assert(result.lines.every(line => line.rect.width <= contentWidth + 0.5),
        `${alignment}: wrapped lines stay inside text width (${count})`);
    }
  }

  const unicodeText = 'Việt Nam a\u0301👩‍💻'.repeat(12);
  const unicodeLayout = layoutParagraphLines({
    blockId: 'unicode-wrap', runs: [{ id: 'unicode-run', text: unicodeText, marks }],
    style: {}, contentWidth: 120, startX: 0, startY: 0,
  });
  const boundaries = new Set([0]);
  let offset = 0;
  for (const cluster of getGraphemeClusters(unicodeText)) {
    offset += cluster.length;
    boundaries.add(offset);
  }
  assert(unicodeLayout.lines.every(line => boundaries.has(line.startOffset) && boundaries.has(line.endOffset)),
    'Wrapping never splits Vietnamese combining accents or emoji graphemes');

  return { passed, results };
}
