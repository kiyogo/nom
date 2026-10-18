import { PageLayout } from './layout-types';
import { ParagraphLayoutResult } from './line-breaker';

/**
 * High-performance LRU Cache for Paragraph Line-Breaking Results.
 * Enables O(1) paragraph reuse during typing and incremental reflow.
 */
export class ParagraphLayoutCache {
  private cache: Map<string, ParagraphLayoutResult> = new Map();
  private maxCapacity: number;

  constructor(maxCapacity: number = 5000) {
    this.maxCapacity = maxCapacity;
  }

  public static makeKey(blockId: string, version: number, contentWidth: number, styleHash: string = ''): string {
    return `${blockId}_v${version}_w${Math.round(contentWidth)}_${styleHash}`;
  }

  public get(key: string): ParagraphLayoutResult | undefined {
    const item = this.cache.get(key);
    if (item) {
      // Refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  public set(key: string, result: ParagraphLayoutResult): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxCapacity) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, result);
  }

  public invalidateBlock(blockId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${blockId}_`)) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }
}

/**
 * LRU Cache for Paginated Page Layouts.
 * Limits the number of full PageLayout objects (displayList, hitTestIndex, clusters) in RAM.
 * Prevents memory leaks and out-of-memory crashes on 1,000,000-page documents.
 */
export class LRUPageLayoutCache {
  private cache: Map<number, PageLayout> = new Map();
  private maxPages: number;

  constructor(maxPages: number = 60) {
    this.maxPages = Math.max(10, maxPages);
  }

  public get(pageIndex: number): PageLayout | undefined {
    const page = this.cache.get(pageIndex);
    if (page) {
      this.cache.delete(pageIndex);
      this.cache.set(pageIndex, page);
    }
    return page;
  }

  public has(pageIndex: number): boolean {
    return this.cache.has(pageIndex);
  }

  public set(pageIndex: number, page: PageLayout): void {
    if (this.cache.has(pageIndex)) {
      this.cache.delete(pageIndex);
    } else if (this.cache.size >= this.maxPages) {
      // Evict oldest page
      const oldestKey = this.cache.keys().next().value;
      if (typeof oldestKey === 'number') {
        this.evictPage(oldestKey);
      }
    }
    this.cache.set(pageIndex, page);
  }

  /**
   * Intelligently evicts pages outside the active viewport window to stay strictly within RAM budget.
   */
  public evictFarPages(visibleStart: number, visibleEnd: number, buffer: number = 10): void {
    const keepStart = Math.max(0, visibleStart - buffer);
    const keepEnd = visibleEnd + buffer;

    for (const pageIdx of Array.from(this.cache.keys())) {
      if (pageIdx < keepStart || pageIdx > keepEnd) {
        this.evictPage(pageIdx);
      }
    }
  }

  private evictPage(pageIndex: number): void {
    this.cache.delete(pageIndex);
  }

  public invalidatePage(pageIndex: number): void {
    this.evictPage(pageIndex);
  }

  public invalidateRange(start: number, end: number): void {
    for (let i = start; i <= end; i++) {
      this.evictPage(i);
    }
  }

  public clear(): void {
    for (const key of Array.from(this.cache.keys())) {
      this.evictPage(key);
    }
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }

  public getEstimatedMemoryBytes(): number {
    // Rough estimation: each cached PageLayout with ~30 lines & clusters is ~150-250KB
    return this.cache.size * 200 * 1024;
  }
}
