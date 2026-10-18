import { htmlToDocumentModel, documentModelToHtml, plainTextToDocumentModel } from '../core/model/serialization';
import { DocumentModel } from '../core/model/document-model';

export function runSerializationTests(): { passed: boolean; results: string[] } {
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

  // Test 1: Plain text conversion
  const plain = 'Dòng 1\nDòng 2\nDòng 3';
  const plainDoc = plainTextToDocumentModel(plain, 'Test Plain');
  assert(plainDoc.blocks.length === 3, 'Plain text split into 3 paragraph blocks');

  // Test 2: HTML with bold, italic, headings, lists
  const inputHtml = `
    <h1>Tiêu đề hợp đồng</h1>
    <p>Đoạn văn có <strong>in đậm</strong> và <em>in nghiêng</em>.</p>
    <ul>
      <li>Mục danh sách 1</li>
      <li>Mục danh sách 2</li>
    </ul>
    <hr />
  `;

  const parsedDoc = htmlToDocumentModel(inputHtml, 'Hợp đồng số hóa');
  assert(parsedDoc.blocks.length >= 4, 'Parsed all blocks from HTML structure');
  assert(parsedDoc.blocks[0].type === 'heading', 'First block is heading');
  assert(parsedDoc.blocks[1].type === 'paragraph', 'Second block is paragraph');
  assert(parsedDoc.blocks[2].type === 'list-item', 'Third block is list item');

  // Test 3: Round-trip HTML serialization
  const generatedHtml = documentModelToHtml(parsedDoc);
  assert(generatedHtml.includes('<h1'), 'Output contains <h1> tag');
  assert(generatedHtml.includes('<strong>in đậm</strong>'), 'Output contains <strong>in đậm</strong> tag');
  assert(generatedHtml.includes('<em>in nghiêng</em>'), 'Output contains <em>in nghiêng</em> tag');
  assert(generatedHtml.includes('<li>Mục danh sách 1</li>'), 'Output contains <li> tag');

  // Test 4: Document Model class wrapping
  const model = new DocumentModel(parsedDoc);
  assert(model.blocks.length === parsedDoc.blocks.length, 'DocumentModel loaded parsed blocks cleanly');

  return { passed, results };
}
