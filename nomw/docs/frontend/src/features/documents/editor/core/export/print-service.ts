import { DocumentModel } from '../model/document-model';
import { DocumentLayout } from '../layout/layout-types';
import { CanvasRenderer } from '../rendering/canvas-renderer';

export class PrintService {
  /**
   * Generates a clean print window containing only document canvas pages
   */
  public static printDocument(doc: DocumentModel, layout: DocumentLayout): void {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${doc.title || 'In tài liệu'}</title>
          <style>
            @page {
              size: ${doc.settings.pageSize} ${doc.settings.orientation};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #FFFFFF;
            }
            .page-container {
              page-break-after: always;
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
            }
            .page-container:last-child {
              page-break-after: avoid;
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <div id="print-root"></div>
        </body>
      </html>
    `);
    iframeDoc.close();

    const root = iframeDoc.getElementById('print-root');
    if (!root) return;

    // Render each page to an image and append to print iframe
    for (let i = 0; i < layout.pages.length; i++) {
      const page = layout.pages[i];
      const canvas = document.createElement('canvas');
      canvas.width = page.width * 2;
      canvas.height = page.height * 2;
      CanvasRenderer.renderPage(canvas, page, 2);

      const pageWrapper = iframeDoc.createElement('div');
      pageWrapper.className = 'page-container';

      const img = iframeDoc.createElement('img');
      img.src = canvas.toDataURL('image/png');
      pageWrapper.appendChild(img);
      root.appendChild(pageWrapper);
    }

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 3000);
    }, 500);
  }
}
