import { DocumentModel } from '../model/document-model';

export class AccessibilityTree {
  /**
   * Generates a semantic text stream for assistive technology (screen readers)
   */
  public static generateSemanticText(doc: DocumentModel): string {
    const lines: string[] = [];

    lines.push(`Tài liệu: ${doc.title || 'Văn bản chưa đặt tên'}`);
    lines.push(`Tổng số đoạn: ${doc.blocks.length}`);
    lines.push('----------------------------------------');

    for (const block of doc.blocks) {
      if (block.type === 'heading') {
        lines.push(`[Tiêu đề ${block.level}]: ${doc.getBlockText(block)}`);
      } else if (block.type === 'list-item') {
        lines.push(`[Mục danh sách]: ${doc.getBlockText(block)}`);
      } else if (block.type === 'table') {
        lines.push(`[Bảng: ${block.rows.length} hàng, ${block.columns.length} cột]`);
      } else if (block.type === 'image') {
        lines.push(`[Hình ảnh: ${block.alt || 'Ảnh minh họa'}]`);
      } else if (block.type === 'page-break') {
        lines.push('[Ngắt trang]');
      } else {
        lines.push(doc.getBlockText(block));
      }
    }

    return lines.join('\n');
  }
}
