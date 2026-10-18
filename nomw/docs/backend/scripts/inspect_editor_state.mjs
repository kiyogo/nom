import puppeteer from 'puppeteer-core';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:3088/files/document/wnom/1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));

  // Focus and type
  const result = await page.evaluate(async () => {
    // Expose layout and caret from window if we can, or click
    const canvas = document.querySelector('.doc-interaction-canvas');
    if (!canvas) return { error: 'Interaction canvas not found' };

    const rect = canvas.getBoundingClientRect();
    // Dispatch pointer events to click near the title
    return {
      canvasRect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    };
  });

  console.log('Canvas info:', result);
  await browser.close();
}

run().catch(console.error);
