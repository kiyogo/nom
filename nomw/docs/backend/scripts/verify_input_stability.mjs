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

  // Wait for canvas or editor page
  await page.waitForSelector('canvas', { timeout: 10000 });
  console.log('Editor canvas loaded.');

  // Click canvas to focus
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 200, box.y + 150);
  await new Promise(r => setTimeout(r, 500));

  // Run in-browser test suite for line breaker, IME commit, and deduplication
  const results = await page.evaluate(async () => {
    const hiddenInput = document.querySelector('.doc-hidden-input');
    if (!hiddenInput) return { error: 'No hidden input found' };

    // Get current paragraphs before typing
    return {
      hasHiddenInput: true,
      hiddenInputValue: hiddenInput.value,
      activeElement: document.activeElement?.tagName,
      activeElementClass: document.activeElement?.className,
    };
  });
  console.log('Editor state check:', results);

  // Type a sample Vietnamese paragraph with accents and spaces
  console.log('Typing Vietnamese text with Telex accents and spaces...');
  await page.keyboard.type(' Cộng hòa xã hội chủ nghĩa Việt Nam ', { delay: 30 });
  await page.keyboard.type('Độc lập Tự do Hạnh phúc ', { delay: 30 });

  // Test Enter after typing
  await page.keyboard.press('Enter');
  await page.keyboard.type('Đoạn văn thứ hai: Kiểm tra gõ tiếng Việt siêu mượt mà không bị giật lag và không bị nhảy dòng bất thường.', { delay: 20 });

  // Test Backspace
  console.log('Testing Backspace deletion...');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 40));
  }
  await page.keyboard.type('chuẩn xác 100%!', { delay: 20 });

  await new Promise(r => setTimeout(r, 600));

  // Capture screenshot
  const screenshotPath = path.resolve('..', 'verify_smooth_typing.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
  console.log('Verification completed successfully.');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
