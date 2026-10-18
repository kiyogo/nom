import puppeteer from 'puppeteer-core';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const testResults = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const fonts = [
      'Arial',
      'Times New Roman',
      'Calibri',
      'Segoe UI',
      'Tahoma'
    ];

    const texts = [
      'Cộng hòa xã hội chủ nghĩa Việt Nam',
      'Nguyễn Văn Minh - Giám đốc điều hành',
      'Đây là đoạn văn bản kiểm tra độ lệch của con trỏ chuột khi gõ văn bản dài trong trình soạn thảo',
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789'
    ];

    const scales = [1.0, 1.25, 1.5, 2.0, 2.5];
    const fontSize = 14;

    const rows = [];

    for (const font of fonts) {
      for (const text of texts) {
        // 1. Logical measure (1x)
        const logicalPx = (fontSize * 96) / 72;
        ctx.font = `normal normal ${fontSize}pt "${font}", "Segoe UI", Arial, sans-serif`;
        const logicalPtWidth = ctx.measureText(text).width;

        ctx.font = `normal normal ${logicalPx}px "${font}", "Segoe UI", Arial, sans-serif`;
        const logicalPxWidth = ctx.measureText(text).width;

        for (const scale of scales) {
          const physicalPx = logicalPx * scale;
          ctx.font = `normal normal ${physicalPx}px "${font}", "Segoe UI", Arial, sans-serif`;
          const physicalWidth = ctx.measureText(text).width;
          const mappedLogicalWidth = physicalWidth / scale;

          const diffFromPx = Math.abs(mappedLogicalWidth - logicalPxWidth);
          const diffFromPt = Math.abs(mappedLogicalWidth - logicalPtWidth);

          if (diffFromPx > 0.5 || diffFromPt > 0.5) {
            rows.push({
              font,
              scale,
              text: text.slice(0, 25) + '...',
              logicalPtWidth: Math.round(logicalPtWidth * 100) / 100,
              logicalPxWidth: Math.round(logicalPxWidth * 100) / 100,
              mappedLogicalWidth: Math.round(mappedLogicalWidth * 100) / 100,
              diffFromPt: Math.round(diffFromPt * 100) / 100,
              diffFromPx: Math.round(diffFromPx * 100) / 100
            });
          }
        }
      }
    }

    return rows;
  });

  console.log('Scale discrepancy test results:');
  console.table(testResults);

  await browser.close();
}

run().catch(console.error);
