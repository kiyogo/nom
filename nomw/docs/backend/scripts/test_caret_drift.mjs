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
  await new Promise(r => setTimeout(r, 800));

  // Click on the middle of the first page to place caret
  const canvasBox = await page.evaluate(() => {
    const canvas = document.querySelector('.doc-base-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + 200, y: rect.top + 200 };
  });

  if (!canvasBox) {
    console.error('Canvas not found');
    await browser.close();
    return;
  }

  console.log('Clicking canvas at', canvasBox);
  await page.mouse.click(canvasBox.x, canvasBox.y);
  await new Promise(r => setTimeout(r, 400));

  // Check state after click
  const stateAfterClick = await page.evaluate(() => {
    return {
      caret: (window).__debugLastCaret || null,
      activeTag: document.activeElement?.tagName,
      activeClass: document.activeElement?.className
    };
  });
  console.log('State after click:', stateAfterClick);

  // Now let's test caret drift after typing characters
  // Let's create an evaluation function in page to track caret position vs text measurement
  const driftReport = await page.evaluate(async () => {
    const hiddenInput = document.querySelector('.doc-hidden-input');
    if (!hiddenInput) return { error: 'Hidden input not found' };

    // Find the editor state / hooks or inspect the interaction canvas
    const getCaretPos = () => {
      // We can inspect the caret rendered or layout
      // Or get from DOM
      return (window).__debugLastCaret;
    };

    return { ok: true };
  });

  console.log('Drift report setup:', driftReport);
  await browser.close();
}

run().catch(console.error);
