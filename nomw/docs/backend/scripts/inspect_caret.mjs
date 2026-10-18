import puppeteer from 'puppeteer-core';
import path from 'path';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:3088/files/document/wnom/1...');
  await page.goto('http://localhost:3088/files/document/wnom/1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // Inspect fontMetrics and measureText differences directly in the browser environment!
  const results = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const testCases = [
      { text: "Cộng hòa xã hội chủ nghĩa Việt Nam", font: "13pt Arial" },
      { text: "Độc lập - Tự do - Hạnh phúc", font: "13pt Arial" },
      { text: "Văn bản mẫu hiển thị kiểm tra con trỏ chuột", font: "14pt Arial" },
      { text: "Văn bản mẫu hiển thị kiểm tra con trỏ chuột", font: "14pt 'Times New Roman'" },
      { text: "AV To We Ta Wa Tr Tu Ty yo vo ya", font: "14pt 'Times New Roman'" },
      { text: "dddddddddđ22222222222222222222222222222222222222222222222222", font: "14pt Arial" },
      { text: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", font: "14pt Arial" }
    ];

    const measurements = [];
    for (const tc of testCases) {
      ctx.font = tc.font;
      const fullWidth = ctx.measureText(tc.text).width;
      
      // Sum of individual characters (old flawed measureClusters)
      let sumWidth = 0;
      const chars = Array.from(tc.text);
      for (const ch of chars) {
        sumWidth += ctx.measureText(ch).width;
      }

      // Prefix measurement (ideal measureClusters)
      let prefixWidth = 0;
      for (let i = 1; i <= tc.text.length; i++) {
        prefixWidth = ctx.measureText(tc.text.slice(0, i)).width;
      }

      measurements.push({
        text: tc.text.slice(0, 30) + (tc.text.length > 30 ? '...' : ''),
        font: tc.font,
        fullWidth: Math.round(fullWidth * 100) / 100,
        sumWidth: Math.round(sumWidth * 100) / 100,
        drift: Math.round((sumWidth - fullWidth) * 100) / 100,
        prefixMatchesFull: Math.abs(prefixWidth - fullWidth) < 0.001
      });
    }

    return measurements;
  });

  console.log('Measurement results:');
  console.table(results);

  await browser.close();
}

run().catch(console.error);
