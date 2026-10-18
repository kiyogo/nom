import { DocumentModel } from '../model/document-model';
import { layoutEngine } from '../layout/layout-engine';

export interface SearchMatch {
  blockId: string;
  startOffset: number;
  endOffset: number;
  snippet: string;
  pageIndex: number;
}

export type SearchBatchCallback = (matches: SearchMatch[], isDone: boolean, totalFoundSoFar: number) => void;

/**
 * StreamingSearchEngine: Non-blocking background search for documents up to 1,000,000 pages.
 * Yields the first 100 matches instantly, then time-slices remaining search tasks
 * so the main thread / UI never drops below 60 FPS.
 */
export class StreamingSearchEngine {
  private activeToken: number = 0;
  private isSearching: boolean = false;

  public search(
    doc: DocumentModel,
    query: string,
    options: { matchCase?: boolean; wholeWord?: boolean } = {},
    onBatch: SearchBatchCallback
  ): void {
    this.cancel();
    if (!query || query.trim().length === 0) {
      onBatch([], true, 0);
      return;
    }

    this.activeToken++;
    const token = this.activeToken;
    this.isSearching = true;

    const blocks = doc.blocks;
    const totalBlocks = blocks.length;
    const searchQuery = options.matchCase ? query : query.toLowerCase();
    const qLen = query.length;

    let currentBlockIdx = 0;
    let totalMatches: SearchMatch[] = [];
    const FIRST_BATCH_LIMIT = 100;
    const TIME_SLICE_MS = 8; // Max 8ms per slice to maintain 60-120 FPS

    const processSlice = () => {
      if (token !== this.activeToken) return;

      const sliceStartTime = performance.now();
      const currentBatch: SearchMatch[] = [];

      while (currentBlockIdx < totalBlocks) {
        const block = blocks[currentBlockIdx];
        const text = doc.getBlockText(block);
        const searchText = options.matchCase ? text : text.toLowerCase();

        let pos = 0;
        while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
          let isWordMatch = true;
          if (options.wholeWord) {
            const beforeChar = pos > 0 ? text[pos - 1] : ' ';
            const afterChar = pos + qLen < text.length ? text[pos + qLen] : ' ';
            isWordMatch = /\W/.test(beforeChar) && /\W/.test(afterChar);
          }

          if (isWordMatch) {
            const snippetStart = Math.max(0, pos - 20);
            const snippetEnd = Math.min(text.length, pos + qLen + 20);
            const snippet = text.slice(snippetStart, snippetEnd);
            const pageIndex = layoutEngine.getBlockPageIndex(block.id);

            const match: SearchMatch = {
              blockId: block.id,
              startOffset: pos,
              endOffset: pos + qLen,
              snippet,
              pageIndex,
            };

            currentBatch.push(match);
            totalMatches.push(match);

            // Emit first batch immediately
            if (totalMatches.length === FIRST_BATCH_LIMIT) {
              onBatch(totalMatches.slice(0, FIRST_BATCH_LIMIT), false, totalMatches.length);
              currentBatch.length = 0;
            }
          }

          pos += qLen;
        }

        currentBlockIdx++;

        // Yield to browser if time slice exceeded
        if (performance.now() - sliceStartTime >= TIME_SLICE_MS) {
          break;
        }
      }

      if (currentBatch.length > 0 && totalMatches.length > FIRST_BATCH_LIMIT) {
        onBatch(currentBatch, false, totalMatches.length);
      }

      if (currentBlockIdx >= totalBlocks) {
        this.isSearching = false;
        onBatch([], true, totalMatches.length);
      } else {
        // Schedule next slice in idle time or micro-timeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as any).requestIdleCallback(processSlice, { timeout: 25 });
        } else {
          setTimeout(processSlice, 4);
        }
      }
    };

    processSlice();
  }

  public cancel(): void {
    this.activeToken++;
    this.isSearching = false;
  }

  public get searching(): boolean {
    return this.isSearching;
  }
}

export const streamingSearchEngine = new StreamingSearchEngine();
