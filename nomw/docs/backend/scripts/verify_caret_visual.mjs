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
  await new Promise(r => setTimeout(r, 1000));

  // Type in the document
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const debug = (window).__editorDebug;
    const { doc, commandRegistry, selectionEngine } = debug;

    const firstBlock = doc.blocks[0];
    selectionEngine.setCursor(firstBlock.id, 0);
    commandRegistry.execute('insertParagraph');
    await sleep(50);

    commandRegistry.execute('setFontFamily', 'Times New Roman');
    commandRegistry.execute('setFontSize', 16);
    await sleep(50);

    const text = "Kiểm tra dấu nháy chuột bám sát từng ký tự tiếng Việt với phong cách chữ Times New Roman 16pt";
    for (let i = 0; i < text.length; i++) {
      commandRegistry.execute('insertText', { text: text[i] });
    }
  });

  await new Promise(r => setTimeout(r, 500));

  const screenshotPath = path.resolve('..', 'verify_caret_snug.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Saved visual verification screenshot to:', screenshotPath);

  await browser.close();
}

run().catch(console.error);
