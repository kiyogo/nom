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
  await new Promise(r => setTimeout(r, 1000));

  const results = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const debug = (window).__editorDebug;
    if (!debug) return { error: '__editorDebug not found' };

    const { doc, commandRegistry, selectionEngine } = debug;

    async function runTestScenario(name, setupFn, textToType) {
      // Create new fresh paragraph
      const firstBlock = doc.blocks[0];
      selectionEngine.setCursor(firstBlock.id, 0);
      commandRegistry.execute('insertParagraph');
      await sleep(50);

      // Run setup (e.g. change font, change size, change alignment)
      await setupFn();
      await sleep(50);

      const report = [];
      for (let i = 0; i < textToType.length; i++) {
        const char = textToType[i];
        commandRegistry.execute('insertText', { text: char });
        await sleep(20);

        const st = (window).__editorDebug;
        const caret = st.caret;
        const caretX = caret ? caret.x : null;

        const curPage = st.layout.pages[0];
        const curBlockId = st.selectionEngine.getSelection().focus.blockId;
        const offset = st.selectionEngine.getSelection().focus.offset;
        const entry = curPage.hitTestIndex.find(e => e.blockId === curBlockId && offset >= e.startOffset && offset <= e.endOffset);

        let textRight = null;
        if (entry) {
          const lineCmd = curPage.displayList.find(cmd => cmd.type === 'text' && Math.abs(cmd.y - entry.baseline) < 2);
          if (lineCmd) {
            const ctx = document.createElement('canvas').getContext('2d');
            const sizePx = (lineCmd.fontSize * 96) / 72;
            ctx.font = `${lineCmd.fontStyle || 'normal'} ${lineCmd.fontWeight || 'normal'} ${sizePx}px "${lineCmd.fontFamily}", "Segoe UI", Arial, sans-serif`;
            const textW = ctx.measureText(lineCmd.text).width;
            textRight = lineCmd.x + textW;
          }
        }

        if (caretX !== null && textRight !== null) {
          const drift = caretX - textRight;
          report.push({
            char,
            len: i + 1,
            caretX: Math.round(caretX * 100) / 100,
            textRight: Math.round(textRight * 100) / 100,
            drift: Math.round(drift * 100) / 100
          });
        }
      }

      const maxDrift = report.reduce((max, r) => Math.max(max, Math.abs(r.drift)), 0);
      const lastDrift = report[report.length - 1]?.drift ?? 0;
      return {
        name,
        totalChars: textToType.length,
        lastDrift,
        maxDrift,
        badSamples: report.filter(r => Math.abs(r.drift) > 1.5)
      };
    }

    const testText = "Cộng hòa xã hội chủ nghĩa Việt Nam độc lập tự do hạnh phúc 12345";
    const testCases = [];

    // Test 1: Change font to Times New Roman
    testCases.push(await runTestScenario(
      "Font: Times New Roman",
      () => { commandRegistry.execute('setFontFamily', 'Times New Roman'); },
      testText
    ));

    // Test 2: Change font size to 24
    testCases.push(await runTestScenario(
      "Font Size: 24pt",
      () => { commandRegistry.execute('setFontSize', 24); },
      testText
    ));

    // Test 3: Alignment Justify
    testCases.push(await runTestScenario(
      "Alignment: Justify",
      () => { commandRegistry.execute('setAlignment', 'justify'); },
      testText + " - Thử nghiệm thêm đoạn văn bản dài hơn để xem ngắt dòng hai bên"
    ));

    // Test 4: Alignment Center
    testCases.push(await runTestScenario(
      "Alignment: Center",
      () => { commandRegistry.execute('setAlignment', 'center'); },
      testText
    ));

    // Test 5: Font Aptos / Calibri
    testCases.push(await runTestScenario(
      "Font: Calibri",
      () => { commandRegistry.execute('setFontFamily', 'Calibri'); },
      testText
    ));

    return testCases;
  });

  console.log('Scenario test results:');
  console.table(results);

  for (const tc of results) {
    if (tc.badSamples && tc.badSamples.length > 0) {
      console.log(`Bad samples for ${tc.name}:`);
      console.table(tc.badSamples.slice(0, 10));
    }
  }

  await browser.close();
}

run().catch(console.error);
