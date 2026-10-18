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

    const tests = [
      { text: "Cộng hòa xã hội chủ nghĩa Việt Nam", font: "14pt Arial" },
      { text: "Cộng hòa xã hội chủ nghĩa Việt Nam", font: "14pt 'Times New Roman'" },
      { text: "Cộng hòa xã hội chủ nghĩa Việt Nam", font: "14pt 'Segoe UI'" },
      { text: "Đây là một đoạn văn bản dài để kiểm tra độ trôi của con trỏ chuột khi người dùng nhập văn bản", font: "14pt 'Times New Roman'" },
      { text: "Đây là một đoạn văn bản dài để kiểm tra độ trôi của con trỏ chuột khi người dùng nhập văn bản", font: "14pt Arial" },
      { text: "The quick brown fox jumps over the lazy dog repeatedly and consistently", font: "14pt 'Times New Roman'" },
      { text: "The quick brown fox jumps over the lazy dog repeatedly and consistently", font: "14pt Calibri" }
    ];

    const out = [];

    for (const t of tests) {
      ctx.font = t.font;
      const fullWidth = ctx.measureText(t.text).width;

      // Split into words and spaces like line-breaker.ts
      const segments = t.text.match(/\s+|[^\s]+/g) || [];
      let wordSumWidth = 0;
      for (const seg of segments) {
        wordSumWidth += ctx.measureText(seg).width;
      }

      // Individual char sum (current measureClusters)
      let charSumWidth = 0;
      for (const ch of t.text) {
        charSumWidth += ctx.measureText(ch).width;
      }

      out.push({
        font: t.font,
        text: t.text.slice(0, 20) + '...',
        fullWidth: Math.round(fullWidth * 100) / 100,
        wordSumWidth: Math.round(wordSumWidth * 100) / 100,
        wordDiff: Math.round((wordSumWidth - fullWidth) * 100) / 100,
        charSumWidth: Math.round(charSumWidth * 100) / 100,
        charDiff: Math.round((charSumWidth - fullWidth) * 100) / 100
      });
    }

    return out;
  });

  console.log('Word and char sum differences:');
  console.table(testResults);

  await browser.close();
}

run().catch(console.error);
