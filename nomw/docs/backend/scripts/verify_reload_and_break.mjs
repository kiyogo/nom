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

  // 1. Reload document
  console.log('Navigating to http://localhost:3088/files/document/wnom/1...');
  await page.goto('http://localhost:3088/files/document/wnom/1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // Check that NO cursor is active on reload
  const reloadState = await page.evaluate(() => {
    const hiddenInput = document.querySelector('.doc-hidden-input');
    return {
      activeElement: document.activeElement?.className || document.activeElement?.tagName,
      isTextareaFocused: document.activeElement === hiddenInput
    };
  });
  console.log('Reload state (should NOT be focused):', reloadState);

  // Take screenshot on initial reload (should be completely clean with NO blue caret)
  const initialScreenshot = path.resolve('..', 'verify_reload_clean.png');
  await page.screenshot({ path: initialScreenshot });
  console.log('Initial clean reload screenshot saved to:', initialScreenshot);

  // 2. Click to place cursor in the body of the document
  console.log('Clicking to place cursor in the body paragraph...');
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  // Click on the body paragraph area
  await page.mouse.click(box.x + 250, box.y + 280);
  await new Promise(r => setTimeout(r, 400));

  // 3. Test typing a long continuous word to verify character-by-character line breaking
  console.log('Typing long continuous word to verify character-by-character breaking...');
  const testLongString = 'dddddddddđ2222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222333333333333333333333333333';
  await page.keyboard.type(testLongString, { delay: 4 });

  await new Promise(r => setTimeout(r, 600));

  const afterTypingScreenshot = path.resolve('..', 'verify_fix_break_word.png');
  await page.screenshot({ path: afterTypingScreenshot });
  console.log('After typing screenshot saved to:', afterTypingScreenshot);

  await browser.close();
  console.log('Verification finished successfully.');
}

run().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
