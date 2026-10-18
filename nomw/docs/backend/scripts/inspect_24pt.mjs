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

  const inspection = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const debug = (window).__editorDebug;
    const { doc, commandRegistry, selectionEngine } = debug;

    const firstBlock = doc.blocks[0];
    selectionEngine.setCursor(firstBlock.id, 0);
    commandRegistry.execute('insertParagraph');
    await sleep(50);

    commandRegistry.execute('setFontSize', 24);
    await sleep(50);

    const textToType = "Cộng hòa xã hội chủ nghĩa Việt Nam độc lập tự do hạnh phúc 12345";
    for (let i = 0; i < textToType.length; i++) {
      commandRegistry.execute('insertText', { text: textToType[i] });
    }
    await sleep(100);

    const st = (window).__editorDebug;
    const curBlockId = st.selectionEngine.getSelection().focus.blockId;
    const block = st.doc.getBlockById(curBlockId);

    // Find block layout
    const curPage = st.layout.pages[0];
    const blockLayout = curPage.blocks.find(b => b.blockId === curBlockId);

    return {
      blockRuns: block.runs,
      lines: blockLayout ? blockLayout.lines.map(l => ({
        lineIndex: l.lineIndex,
        rect: l.rect,
        startOffset: l.startOffset,
        endOffset: l.endOffset,
        runs: l.runs.map(r => ({ text: r.text, x: r.x, width: r.width, marks: r.marks })),
        clustersCount: l.clusters?.length || 0,
        firstClusterX: l.clusters?.[0]?.x,
        lastClusterX: l.clusters?.[l.clusters.length - 1]?.x,
        lastClusterW: l.clusters?.[l.clusters.length - 1]?.width
      })) : null,
      caret: st.caret
    };
  });

  console.log('Inspection result:');
  console.dir(inspection, { depth: null });

  await browser.close();
}

run().catch(console.error);
