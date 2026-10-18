import { PDFDocument } from 'pdf-lib';
import { DocumentModel } from '../model/document-model';
import { DocumentLayout } from '../layout/layout-types';
import { CanvasRenderer } from '../rendering/canvas-renderer';

export class PdfExporter {
  /**
   * Generates a high-fidelity PDF preserving canonical layout dimensions and styling
   */
  public static async exportToPdf(doc: DocumentModel, layout: DocumentLayout): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < layout.pages.length; i++) {
      const pageLayout = layout.pages[i];

      // Convert page canvas to high-res PNG (2x physical resolution)
      const canvas = document.createElement('canvas');
      canvas.width = pageLayout.width * 2;
      canvas.height = pageLayout.height * 2;
      CanvasRenderer.renderPage(canvas, pageLayout, 2);

      const pngDataUrl = canvas.toDataURL('image/png');
      const pngImageBytes = await fetch(pngDataUrl).then((res) => res.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngImageBytes);

      // Points: 72 points per inch (Canvas is 96 DPI CSS Pixels -> 1 px = 72/96 points = 0.75 points)
      const pdfWidth = (pageLayout.width * 72) / 96;
      const pdfHeight = (pageLayout.height * 72) / 96;

      const page = pdfDoc.addPage([pdfWidth, pdfHeight]);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  }

  public static async downloadPdf(doc: DocumentModel, layout: DocumentLayout): Promise<void> {
    const blob = await PdfExporter.exportToPdf(doc, layout);
    const fileName = `${doc.title.replace(/[\\/:*?"<>|]/g, '_') || 'tai_lieu'}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
