import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3088/', { waitUntil: 'networkidle0' });
  const result = await page.evaluate(async () => {
    const base = '/src/features/documents/editor/';
    const [{ DocumentModel }, { SelectionEngine }, { TransactionEngine }, { HistoryManager },
      { CommandRegistry }, { registerEditorCommands }, { ClipboardService }, { LayoutEngine },
      { TypedEventBus }, { KeyboardController }, { runAllEditorTests }, { HitTester }] = await Promise.all([
      import(base + 'core/model/document-model.ts'), import(base + 'core/selection/selection-engine.ts'),
      import(base + 'core/transactions/transaction-engine.ts'), import(base + 'core/history/history-manager.ts'),
      import(base + 'core/commands/command-registry.ts'), import(base + 'core/commands/editor-commands.ts'),
      import(base + 'core/clipboard/clipboard-service.ts'), import(base + 'core/layout/layout-engine.ts'),
      import(base + 'core/utils/event-bus.ts'), import(base + 'core/input/keyboard-controller.ts'),
      import(base + 'tests/index.ts'),
      import(base + 'core/hit-testing/hit-tester.ts'),
    ]);
    const checks = [];
    const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    const setup = () => {
      const doc = new DocumentModel();
      const selection = new SelectionEngine(new TypedEventBus());
      selection.setCursor(doc.blocks[0].id, 0);
      const tx = new TransactionEngine(doc, 'paste-test');
      const history = new HistoryManager();
      const commands = new CommandRegistry();
      const engine = new LayoutEngine();
      let mutations = 0;
      let layout;
      registerEditorCommands(commands, doc, selection, tx, history, () => {
        mutations++;
        layout = engine.layoutDocument(doc);
      });
      return { doc, selection, tx, history, commands, engine,
        clipboard: new ClipboardService(doc, selection, commands),
        get mutations() { return mutations; }, get layout() { return layout; } };
    };
    const paste = (state, text, html = '') => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      if (html) data.setData('text/html', html);
      return state.clipboard.paste(new ClipboardEvent('paste', { clipboardData: data, cancelable: true }));
    };
    const textOf = state => state.doc.blocks.map(block => state.doc.getBlockText(block)).join('\n');
    const measurements = [];
    for (const count of [1000, 10000]) {
      for (const paragraphs of [1, 100, 1000]) {
        if (paragraphs > count) continue;
        const state = setup();
        const perParagraph = count / paragraphs;
        const paragraph = Array.from({ length: perParagraph }, (_, i) => `từ${i}`).join(' ');
        const text = Array(paragraphs).fill(paragraph).join('\n');
        const started = performance.now();
        check(await paste(state, text), `Paste ${count} words / ${paragraphs} paragraphs accepted`);
        const elapsed = performance.now() - started;
        check(textOf(state) === text, 'Exact pasted text, without duplicates or loss');
        check(state.mutations === 1, 'Only one mutation/layout per paste');
        const layoutText = state.layout.pages.flatMap(page => page.blocks.flatMap(block =>
          block.lines.flatMap(line => line.runs.map(run => run.text)))).join('');
        check(layoutText === text.replace(/\n/g, ''), 'All text paginated and visible exactly once');
        check(state.doc.dirtyBlockIds.size === 0, 'Dirty blocks cleared after layout');
        const caret = HitTester.getCaretGeometry(state.selection.getSelection().focus, state.layout, state.doc);
        check(caret?.pageIndex === state.layout.pages.length - 1, 'Caret reaches final page after large paste');
        const entry = state.history.popUndo();
        check(entry?.transaction.source === 'paste', 'Paste recorded as one history action');
        state.tx.applyTransaction(entry.inverseTransaction);
        check(textOf(state) === '', 'One undo removes entire paste');
        state.tx.applyTransaction(entry.transaction);
        check(textOf(state) === text, 'Redo restores entire paste');
        const relayoutStart = performance.now();
        state.engine.layoutDocument(state.doc);
        const relayoutMs = performance.now() - relayoutStart;
        measurements.push({ words: count, paragraphs, pasteAndLayoutMs: Math.round(elapsed),
          relayoutMs: Math.round(relayoutMs), pages: state.layout.pages.length });
      }
    }
    const rich = setup();
    await paste(rich, 'Hello\nWorld', '<div><p><b>Hello</b></p><p><i>World</i></p></div>');
    check(textOf(rich) === 'Hello\nWorld', 'HTML preserves paragraphs with no extra trailing paragraph');
    check(rich.doc.blocks[0].runs[0].marks.bold, 'HTML preserves bold');
    check(rich.doc.blocks[1].runs[0].marks.italic, 'HTML preserves italic');
    const concurrent = setup();
    const responses = await Promise.all([paste(concurrent, 'Một lần'), paste(concurrent, 'Một lần')]);
    check(responses[0] && !responses[1] && textOf(concurrent) === 'Một lần', 'Overlapping paste requests inserted only once');
    const replace = setup();
    await paste(replace, 'prefix ONE\nTWO suffix');
    replace.selection.setSelection({ anchor: { blockId: replace.doc.blocks[0].id, offset: 7 },
      focus: { blockId: replace.doc.blocks[1].id, offset: 3 } });
    await paste(replace, 'A\nB');
    check(textOf(replace) === 'prefix A\nB suffix', 'Paste replaces multiline selection and preserves surrounding text');
    const undoReplace = replace.history.popUndo();
    replace.tx.applyTransaction(undoReplace.inverseTransaction);
    check(textOf(replace) === 'prefix ONE\nTWO suffix', 'Undo restores replaced multiline selection');
    const keyboard = new KeyboardController(replace.doc, replace.selection, replace.commands, () => replace.layout);
    const repeated = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, repeat: true, cancelable: true });
    keyboard.handleKeyDown(repeated);
    check(repeated.defaultPrevented, 'Holding Ctrl+V suppresses repeated pastes');
    const normalPasteKey = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true });
    keyboard.handleKeyDown(normalPasteKey);
    check(!normalPasteKey.defaultPrevented, 'Normal Ctrl+V reaches native paste event');
    const suite = runAllEditorTests();
    check(suite.allPassed, 'Existing editor regression suite passes in Chrome');
    // Cached tail reflow must match a completely fresh layout, including
    // indentation, alignment, line offsets, and positions after repeated input.
    const geometry = layout => layout.pages.map(page => page.blocks.map(block => block.lines.map(line =>
      [line.startOffset, line.endOffset, line.rect.x, line.rect.y, line.rect.width])));
    for (const alignment of ['left', 'center', 'right', 'justify']) {
      const state = setup();
      state.commands.execute('setParagraphStyle', { alignment, firstLineIndent: 28, indentStart: 12 });
      await paste(state, 'Văn bản tiếng Việt có dấu. '.repeat(250));
      for (const addition of [' tiếp', ' tục', ' a\u0301👩‍💻'.repeat(10)]) {
        state.commands.execute('insertText', { text: addition });
        const fresh = new LayoutEngine().layoutDocument(state.doc);
        check(JSON.stringify(geometry(state.layout)) === JSON.stringify(geometry(fresh)),
          `${alignment}: incremental typing geometry matches fresh layout`);
      }
    }
    return { measurements, checks: checks.length, editorAssertions: suite.testCount };
  });
  assert.ok(result.checks > 40);
  // Exercise the mounted React editor too, without loading/saving a user file.
  await page.evaluate(async () => {
    const [{ default: React }, { default: ReactDOM }, { DocxEditorModal }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'),
      import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/components/editor/DocxEditorModal.tsx'),
    ]);
    const host = document.createElement('div');
    document.body.append(host);
    window.pasteTestRoot = ReactDOM.createRoot(host);
    window.pasteTestRoot.render(React.createElement(DocxEditorModal,
      { open: true, initialContent: '<p></p>', onClose() {} }));
  });
  await page.waitForSelector('.doc-hidden-input');
  await page.waitForFunction(() => !!window.__editorDebug);
  const uiResult = await page.evaluate(async () => {
    const debug = window.__editorDebug;
    debug.selectionEngine.setCursor(debug.doc.blocks[0].id, 0);
    const text = Array.from({ length: 10000 }, (_, i) => `văn${i}`).join(' ');
    const input = document.querySelector('.doc-hidden-input');
    input.focus();
    const started = performance.now();
    const data = new DataTransfer();
    data.setData('text/plain', text);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = window.__editorDebug;
    const actual = state.doc.blocks.map(block => state.doc.getBlockText(block)).join('\n');
    if (actual !== text) throw Error('Mounted editor paste duplicated/lost content');
    if (state.caret?.pageIndex !== state.layout.pages.length - 1) throw Error('Mounted editor caret not on final page');
    const version = state.doc.revision;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, repeat: true, bubbles: true, cancelable: true }));
    if (state.doc.revision !== version) throw Error('Repeated Ctrl+V modified document');
    // Multiple synchronous input mutations should schedule one reflow, not
    // repeatedly paginate the document before the browser can paint.
    for (const letter of 'abc') state.commandRegistry.execute('insertText', { text: letter });
    if (window.__editorDebug !== state) throw Error('Input triggered synchronous repeated relayout');
    const typingStart = performance.now();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const typed = window.__editorDebug;
    if (typed.doc.blocks.map(block => typed.doc.getBlockText(block)).join('\n') !== text + 'abc') {
      throw Error('Typing after large paste lost characters');
    }
    const typingAndPaintMs = Math.round(performance.now() - typingStart);
    typed.commandRegistry.execute('undo');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const undone = window.__editorDebug;
    if (undone.doc.blocks.map(block => undone.doc.getBlockText(block)).join('\n') !== text) throw Error('Undo typing after paste failed');
    undone.commandRegistry.execute('undo');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (window.__editorDebug.doc.blocks.some(block => window.__editorDebug.doc.getBlockText(block))) throw Error('Undo paste in mounted editor failed');
    window.__editorDebug.commandRegistry.execute('redo');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (window.__editorDebug.doc.blocks.map(block => window.__editorDebug.doc.getBlockText(block)).join('\n') !== text) throw Error('Redo paste in mounted editor failed');
    return { pasteToPaintMs: Math.round(typingStart - started), typingAndPaintMs, pages: state.layout.pages.length,
      renderedCanvases: document.querySelectorAll('canvas').length, exactText: true };
  });
  const viewportChecks = [];
  let currentZoom = 100;
  for (const zoom of [60, 100, 150]) {
    await page.evaluate(({ from, to }) => {
      const button = document.querySelector(to > from ? '[title="Phóng to (+10%)"]' : '[title="Thu nhỏ (-10%)"]');
      for (let step = 0; step < Math.abs(to - from) / 10; step++) button.click();
    }, { from: currentZoom, to: zoom });
    currentZoom = zoom;
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    });
  for (const height of [600, 1100]) {
    await page.setViewport({ width: 1440, height });
    for (const position of ['top', 'middle', 'gap', 'bottom']) {
      const snapshot = await page.evaluate(async ({ position, zoom }) => {
        const container = document.querySelector('.docx-document-container');
        const stack = document.querySelector('.docx-page-stack');
        const layout = window.__editorDebug.layout;
        const index = layout.pageHeightIndex;
        const scale = zoom / 100;
        const stackOffset = container.scrollTop + stack.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTop = position === 'top' ? 0 : position === 'bottom' ? container.scrollHeight :
          stackOffset + (position === 'gap' ? index.getPageOffset(8) + index.getPageHeight(8) + 5 : index.getPageOffset(10) + 180) * scale;
        // Let scroll, range update, mount, and effect cleanup settle.
        for (let i = 0; i < 5; i++) await new Promise(resolve => requestAnimationFrame(resolve));
        const bounds = container.getBoundingClientRect();
        const mounted = [...container.querySelectorAll('.docx-page')];
        const stackTop = stack.getBoundingClientRect().top;
        const expected = layout.pages.filter(page => {
          const top = stackTop + index.getPageOffset(page.pageIndex) * scale;
          return top < bounds.bottom && top + page.height * scale > bounds.top;
        }).map(page => page.pageIndex);
        const released = (window.previousTestCanvases || []).filter(canvas => !canvas.isConnected);
        const buffersReleased = released.every(canvas => canvas.width === 0 && canvas.height === 0);
        window.previousTestCanvases = [...container.querySelectorAll('canvas')];
        return {
          expected, buffersReleased,
          mounted: mounted.map(el => Number(el.dataset.pageIndex)),
          outside: mounted.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.bottom <= bounds.top || rect.top >= bounds.bottom;
          }).map(el => Number(el.dataset.pageIndex)),
          resourcePages: layout.pages.filter(page => page.hasRenderResources).map(page => page.pageIndex),
          canvasCount: container.querySelectorAll('canvas').length,
          contentEditableCount: container.querySelectorAll('[contenteditable="true"]').length,
        };
      }, { position, zoom });
      assert.ok(snapshot.mounted.length > 0 && snapshot.mounted.length <= 3, 'Only visible pages are mounted');
      assert.deepEqual(snapshot.outside, [], 'No offscreen pages are mounted');
      assert.deepEqual(snapshot.mounted, snapshot.expected, 'Every visible page is mounted');
      assert.ok(snapshot.buffersReleased, 'Offscreen canvas pixel buffers released');
      assert.deepEqual(snapshot.resourcePages, snapshot.mounted, 'Only visible pages retain draw commands');
      assert.equal(snapshot.canvasCount, snapshot.mounted.length * 2, 'Two canvases per visible page');
      assert.equal(snapshot.contentEditableCount, 0, 'No DOM document content');
      viewportChecks.push({ zoom, height, position, ...snapshot });
    }
  }
  }
  await page.evaluate(() => window.pasteTestRoot.unmount());
  result.mountedEditor = uiResult;
  result.viewportChecks = {
    cases: viewportChecks.length, zoomLevels: [60, 100, 150],
    maxMountedPages: Math.max(...viewportChecks.map(check => check.mounted.length)),
    onlyVisiblePages: true, offscreenBuffersReleased: true, canvasLayersPerPage: 2,
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
