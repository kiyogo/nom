import {
  DocumentModelData,
  BlockNode,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  TextRun,
  TextMarks,
  ParagraphStyle,
  DocumentSettings,
} from './types';
import { createInitialDocument, DEFAULT_TEXT_MARKS, DEFAULT_PARAGRAPH_STYLE } from './defaults';
import { generateBlockId, generateRunId } from '../utils/id-generator';

export class DocumentModel {
  public data: DocumentModelData;

  constructor(initialData?: DocumentModelData | string) {
    if (typeof initialData === 'string') {
      try {
        this.data = JSON.parse(initialData);
      } catch {
        this.data = createInitialDocument(generateBlockId('doc'));
      }
    } else if (initialData && initialData.blocks && initialData.blocks.length > 0) {
      this.data = initialData;
    } else {
      this.data = createInitialDocument(generateBlockId('doc'));
    }
  }

  get id(): string {
    return this.data.id;
  }

  get title(): string {
    return this.data.title;
  }

  set title(val: string) {
    this.data.title = val;
    this.data.metadata.updatedAt = new Date().toISOString();
  }

  get revision(): number {
    return this.data.revision;
  }

  set revision(val: number) {
    this.data.revision = val;
  }

  get settings(): DocumentSettings {
    return this.data.settings;
  }

  set settings(val: DocumentSettings) {
    this.data.settings = val;
    this.data.metadata.updatedAt = new Date().toISOString();
  }

  private blockIndexMap: Map<string, { block: BlockNode; index: number; table?: TableBlock; cell?: any }> | null = null;
  private blockVersions: Map<string, number> = new Map();
  public dirtyBlockIds: Set<string> = new Set();

  get blocks(): BlockNode[] {
    return this.data.blocks;
  }

  set blocks(val: BlockNode[]) {
    this.data.blocks = val;
    this.invalidateBlockIndexMap();
  }

  public invalidateBlockIndexMap(): void {
    this.blockIndexMap = null;
  }

  public getBlockVersion(blockId: string): number {
    return this.blockVersions.get(blockId) || 1;
  }

  public incrementRevision(): number {
    this.data.revision = (this.data.revision || 0) + 1;
    return this.data.revision;
  }

  public incrementBlockVersion(blockId: string): number {
    const nextVer = (this.blockVersions.get(blockId) || 1) + 1;
    this.blockVersions.set(blockId, nextVer);
    this.dirtyBlockIds.add(blockId);
    this.incrementRevision();
    return nextVer;
  }

  public markDirty(blockId: string): void {
    this.dirtyBlockIds.add(blockId);
  }

  public clearDirty(): void {
    this.dirtyBlockIds.clear();
  }

  private ensureBlockIndexMap(): Map<string, { block: BlockNode; index: number; table?: TableBlock; cell?: any }> {
    if (this.blockIndexMap !== null) {
      return this.blockIndexMap;
    }
    const map = new Map<string, { block: BlockNode; index: number; table?: TableBlock; cell?: any }>();
    const blks = this.data.blocks;
    for (let i = 0; i < blks.length; i++) {
      const b = blks[i];
      map.set(b.id, { block: b, index: i });
      if (b.type === 'table') {
        const tbl = b as TableBlock;
        for (const row of tbl.rows) {
          for (const cell of row.cells) {
            for (let ci = 0; ci < cell.blocks.length; ci++) {
              const cb = cell.blocks[ci];
              map.set(cb.id, { block: cb, index: ci, table: tbl, cell });
            }
          }
        }
      }
    }
    this.blockIndexMap = map;
    return map;
  }

  public clone(): DocumentModel {
    return new DocumentModel(JSON.parse(JSON.stringify(this.data)));
  }

  public getBlockIndex(blockId: string): number {
    const map = this.ensureBlockIndexMap();
    const entry = map.get(blockId);
    return entry !== undefined ? entry.index : -1;
  }

  public getBlockById(blockId: string): BlockNode | null {
    const map = this.ensureBlockIndexMap();
    const entry = map.get(blockId);
    return entry !== undefined ? entry.block : null;
  }

  public getBlockLocation(blockId: string): { parentArray: BlockNode[]; index: number; table?: TableBlock; cell?: any } | null {
    const map = this.ensureBlockIndexMap();
    const entry = map.get(blockId);
    if (!entry) return null;
    if (entry.table && entry.cell) {
      return { parentArray: entry.cell.blocks, index: entry.index, table: entry.table, cell: entry.cell };
    }
    return { parentArray: this.data.blocks, index: entry.index };
  }

  /**
   * Helper to get plain text of a block
   */
  public getBlockText(block: BlockNode): string {
    if ('runs' in block && Array.isArray(block.runs)) {
      return block.runs.map((r) => r.text).join('');
    }
    return '';
  }

  /**
   * Helper to get total character length of a block
   */
  public getBlockLength(block: BlockNode): number {
    return this.getBlockText(block).length;
  }

  /**
   * Normalizes adjacent text runs with identical marks and removes empty runs (unless whole block is empty)
   */
  public static normalizeRuns(runs: TextRun[]): TextRun[] {
    if (!runs || runs.length === 0) {
      return [{ id: generateRunId(), text: '', marks: {} }];
    }

    const merged: TextRun[] = [];
    for (const run of runs) {
      if (run.text.length === 0 && runs.length > 1) {
        continue;
      }
      if (merged.length === 0) {
        merged.push({ ...run });
        continue;
      }

      const prev = merged[merged.length - 1];
      if (DocumentModel.areMarksEqual(prev.marks, run.marks)) {
        prev.text += run.text;
      } else {
        merged.push({ ...run });
      }
    }

    if (merged.length === 0) {
      return [{ id: generateRunId(), text: '', marks: runs[0]?.marks || {} }];
    }

    if (merged.length === 1 && merged[0].text === '\n') {
      merged[0].text = '';
    }

    return merged;
  }

  public static areMarksEqual(a?: TextMarks, b?: TextMarks): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.fontFamily === b.fontFamily &&
      a.fontSize === b.fontSize &&
      Boolean(a.bold) === Boolean(b.bold) &&
      Boolean(a.italic) === Boolean(b.italic) &&
      Boolean(a.underline) === Boolean(b.underline) &&
      Boolean(a.strike) === Boolean(b.strike) &&
      (a.foregroundColor || DEFAULT_TEXT_MARKS.foregroundColor) ===
        (b.foregroundColor || DEFAULT_TEXT_MARKS.foregroundColor) &&
      (a.backgroundColor || '') === (b.backgroundColor || '') &&
      (a.link || '') === (b.link || '')
    );
  }

  public static cloneMarks(marks?: TextMarks): TextMarks {
    return marks ? { ...marks } : {};
  }

  public static cloneStyle(style?: ParagraphStyle): ParagraphStyle {
    return style ? { ...style } : { ...DEFAULT_PARAGRAPH_STYLE };
  }
}
