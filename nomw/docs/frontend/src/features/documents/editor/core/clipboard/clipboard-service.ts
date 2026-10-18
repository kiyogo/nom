import { DocumentModel } from '../model/document-model';
import { SelectionEngine } from '../selection/selection-engine';
import { CommandRegistry } from '../commands/command-registry';
import { getSelectedText, iterateSelectedBlocks } from '../selection/range';
import { isSelectionCollapsed, normalizeSelection } from '../selection/position';
import { sanitizeHtml } from './html-sanitizer';
import { BlockNode, ParagraphBlock, TextRun } from '../model/types';
import { generateBlockId, generateRunId } from '../utils/id-generator';

export class ClipboardService {
  private doc: DocumentModel;
  private selectionEngine: SelectionEngine;
  private commands: CommandRegistry;

  constructor(
    doc: DocumentModel,
    selectionEngine: SelectionEngine,
    commands: CommandRegistry
  ) {
    this.doc = doc;
    this.selectionEngine = selectionEngine;
    this.commands = commands;
  }

  public setDocument(doc: DocumentModel): void {
    this.doc = doc;
  }

  /**
   * Serializes current selection to text/plain and semantic HTML and writes to system clipboard
   */
  public async copy(): Promise<boolean> {
    const sel = this.selectionEngine.getSelection();
    if (!sel || isSelectionCollapsed(sel)) return false;

    const plainText = getSelectedText(sel, this.doc);
    const htmlText = this.generateSelectionHtml(sel);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ]);
        return true;
      }
    } catch (e) {
      // Fallback
      try {
        await navigator.clipboard.writeText(plainText);
        return true;
      } catch {}
    }
    return false;
  }

  /**
   * Cut selection: copy to clipboard then delete range
   */
  public async cut(): Promise<boolean> {
    const copied = await this.copy();
    if (copied) {
      this.commands.execute('deleteBackward');
      return true;
    }
    return false;
  }

  /**
   * Paste clipboard event data or native clipboard
   */
  public async paste(clipboardEvent?: ClipboardEvent): Promise<boolean> {
    let plainText = '';
    let htmlText = '';

    if (clipboardEvent && clipboardEvent.clipboardData) {
      plainText = clipboardEvent.clipboardData.getData('text/plain');
      htmlText = clipboardEvent.clipboardData.getData('text/html');

      // Check if clipboard contains images
      const items = Array.from(clipboardEvent.clipboardData.items);
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              if (src) {
                this.commands.execute('insertImage', { src });
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
      }
    } else {
      try {
        plainText = await navigator.clipboard.readText();
      } catch {}
    }

    if (htmlText) {
      const sanitized = sanitizeHtml(htmlText);
      const blocks = this.parseHtmlToBlocks(sanitized);
      if (blocks.length > 0) {
        // Insert parsed blocks
        for (const b of blocks) {
          if ('runs' in b && b.runs.length > 0) {
            for (const r of b.runs) {
              this.commands.execute('insertText', { text: r.text, marks: r.marks });
            }
            if (blocks.length > 1) {
              this.commands.execute('insertParagraph');
            }
          }
        }
        return true;
      }
    }

    if (plainText) {
      const lines = plainText.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          this.commands.execute('insertText', { text: lines[i] });
        }
        if (i < lines.length - 1) {
          this.commands.execute('insertParagraph');
        }
      }
      return true;
    }

    return false;
  }

  private generateSelectionHtml(sel: any): string {
    const blocks = iterateSelectedBlocks(sel, this.doc);
    const { start, end } = normalizeSelection(sel, this.doc);

    return blocks
      .map((block, idx) => {
        if (!('runs' in block)) return '';
        let runsToRender = block.runs;
        if (idx === 0 && start.offset > 0) {
          // slice start
        }
        const runHtml = runsToRender
          .map((r) => {
            let text = r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (r.marks.bold) text = `<b>${text}</b>`;
            if (r.marks.italic) text = `<i>${text}</i>`;
            if (r.marks.underline) text = `<u>${text}</u>`;
            if (r.marks.strike) text = `<s>${text}</s>`;
            if (r.marks.foregroundColor) text = `<span style="color:${r.marks.foregroundColor}">${text}</span>`;
            return text;
          })
          .join('');
        return `<p>${runHtml}</p>`;
      })
      .join('\n');
  }

  private parseHtmlToBlocks(html: string): BlockNode[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const nodes = Array.from(doc.body.children);
    if (nodes.length === 0) return [];

    const blocks: BlockNode[] = [];
    for (const node of nodes) {
      const tag = node.tagName.toLowerCase();
      const text = node.textContent || '';
      if (['p', 'div', 'h1', 'h2', 'h3', 'li'].includes(tag)) {
        blocks.push({
          id: generateBlockId('para'),
          type: tag.startsWith('h') ? 'heading' : 'paragraph',
          style: { alignment: 'left', lineHeight: 1.25 },
          runs: [{ id: generateRunId(), text, marks: {} }],
        } as any);
      }
    }
    return blocks;
  }
}
