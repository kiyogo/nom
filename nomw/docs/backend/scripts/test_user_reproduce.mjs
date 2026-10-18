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

  // 1. Reload / load web
  console.log('Navigating to http://localhost:3088/files/document/wnom/1...');
  await page.goto('http://localhost:3088/files/document/wnom/1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // Take screenshot right after reload to see where caret is!
  const screenshotReload = path.resolve('..', 'reproduce_reload_initial.png');
  await page.screenshot({ path: screenshotReload });
  console.log('Initial reload screenshot saved to:', screenshotReload);

  // Check where the caret is located in editor state
  const initialState = await page.evaluate(() => {
    const hiddenInput = document.querySelector('.doc-hidden-input');
    return {
      activeElement: document.activeElement?.className || document.activeElement?.tagName,
      // Check if caret exists in state
    };
  });
  console.log('Initial state on reload:', initialState);

  // 2. Type the user's string immediately after reload
  const userString = 'dddddddddđ2222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222223333333333333333333333333332222222222222222222222222222222222222222222222222222222222222222222222222222223333333dddddddddddddddd222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222';

  console.log('Typing user string directly...');
  // Type directly or focus first
  await page.keyboard.type(userString, { delay: 5 });

  await new Promise(r => setTimeout(r, 600));

  const screenshotTyped = path.resolve('..', 'reproduce_after_typed.png');
  await page.screenshot({ path: screenshotTyped });
  console.log('After typed screenshot saved to:', screenshotTyped);

  await browser.close();
  console.log('Done test.');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
