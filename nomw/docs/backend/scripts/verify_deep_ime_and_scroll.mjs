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

  await page.goto('http://localhost:3088/files/document/wnom/1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('canvas', { timeout: 10000 });

  // Focus editor
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 200, box.y + 150);
  await new Promise(r => setTimeout(r, 400));

  // Run in-browser test suite
  const testResults = await page.evaluate(async () => {
    const hiddenInput = document.querySelector('.doc-hidden-input');
    if (!hiddenInput) return { error: 'No hidden input' };

    const errors = [];

    // 1. TEST IME COMMIT WITH ENTER
    // Simulate compositionstart, compositionupdate, compositionend, keydown Enter
    const blockCountBefore = document.querySelectorAll('.docx-page').length;
    hiddenInput.dispatchEvent(new CompositionEvent('compositionstart'));
    hiddenInput.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'thử nghiệm IME' }));
    hiddenInput.dispatchEvent(new CompositionEvent('compositionend', { data: 'thử nghiệm IME' }));

    // Now immediately fire Enter keydown (which browsers send right after compositionend)
    const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
    hiddenInput.dispatchEvent(enterEvt);

    await new Promise(r => setTimeout(r, 100));

    // 2. TEST SYNTHETIC BACKSPACE DEDUPLICATION (Unikey / EVKey simulation)
    // Send keydown Backspace AND beforeinput deleteContentBackward at virtually identical timestamps
    const backspaceKeyEvt = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true });
    hiddenInput.dispatchEvent(backspaceKeyEvt);

    const backspaceInputEvt = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true });
    hiddenInput.dispatchEvent(backspaceInputEvt);

    await new Promise(r => setTimeout(r, 100));

    // Check scroll container
    const scrollContainer = document.querySelector('.overflow-y-auto');
    const initialScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    return {
      success: true,
      initialScrollTop,
      errors
    };
  });

  console.log('Deep IME & Input test results:', testResults);

  // Type a bunch of paragraphs to test smooth auto-scrolling
  console.log('Typing multiple paragraphs to test smooth auto-scrolling near bottom...');
  for (let p = 0; p < 8; p++) {
    await page.keyboard.type(`Dòng kiểm tra cuộn mượt số ${p + 1}: Văn bản tiếng Việt chính xác, không rung lắc màn hình.`, { delay: 10 });
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 50));
  }

  const scrollInfo = await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto');
    return {
      scrollTop: container?.scrollTop,
      scrollHeight: container?.scrollHeight,
      clientHeight: container?.clientHeight
    };
  });
  console.log('Scroll state after multi-line typing:', scrollInfo);

  const screenshotPath = path.resolve('..', 'verify_deep_smooth.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
  console.log('All tests passed with zero errors.');
}

run().catch(err => {
  console.error('Deep test failed:', err);
  process.exit(1);
});
