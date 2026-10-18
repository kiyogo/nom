/**
 * CentralRenderScheduler: Unified, priority-based render scheduler.
 * Coalesces input, scroll, selection, zoom, and resize events into a single frame.
 * Cancels obsolete requests and prevents multiple competing requestAnimationFrame loops.
 */

export enum RenderPriority {
  P0_INPUT_CARET = 0, // Caret & active input line
  P1_ACTIVE_PAGE = 1,  // Current page being edited
  P2_VISIBLE_PAGES = 2,// Viewport pages
  P3_BUFFER_PAGES = 3, // Overscan buffer pages
  P4_BACKGROUND = 4,   // Background pagination / idle layout
}

export interface RenderTask {
  pageIndex: number;
  priority: RenderPriority;
  timestamp: number;
}

export type RenderCallback = (
  pagesToRender: Set<number>,
  isCaretOnly: boolean,
  priority: RenderPriority
) => void;

export class CentralRenderScheduler {
  private scheduledPages: Map<number, RenderPriority> = new Map();
  private isCaretOnlyPending: boolean = false;
  private rafId: number | null = null;
  private onRenderCallback: RenderCallback;
  private frameToken: number = 0;

  constructor(onRender: RenderCallback) {
    this.onRenderCallback = onRender;
  }

  public scheduleCaret(): void {
    if (this.scheduledPages.size === 0) {
      this.isCaretOnlyPending = true;
    }
    this.requestFrame();
  }

  public schedulePage(pageIndex: number, priority: RenderPriority = RenderPriority.P2_VISIBLE_PAGES): void {
    this.isCaretOnlyPending = false;
    const existing = this.scheduledPages.get(pageIndex);
    if (existing === undefined || priority < existing) {
      this.scheduledPages.set(pageIndex, priority);
    }
    this.requestFrame();
  }

  public schedulePages(pageIndices: number[], priority: RenderPriority = RenderPriority.P2_VISIBLE_PAGES): void {
    this.isCaretOnlyPending = false;
    for (const p of pageIndices) {
      const existing = this.scheduledPages.get(p);
      if (existing === undefined || priority < existing) {
        this.scheduledPages.set(p, priority);
      }
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.rafId !== null) return;

    this.frameToken++;
    const currentToken = this.frameToken;

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      if (currentToken !== this.frameToken) return;

      const pages = new Set<number>(this.scheduledPages.keys());
      const isCaretOnly = this.isCaretOnlyPending && pages.size === 0;

      let highestPriority = RenderPriority.P4_BACKGROUND;
      for (const prio of this.scheduledPages.values()) {
        if (prio < highestPriority) highestPriority = prio;
      }
      if (isCaretOnly) highestPriority = RenderPriority.P0_INPUT_CARET;

      this.scheduledPages.clear();
      this.isCaretOnlyPending = false;

      this.onRenderCallback(pages, isCaretOnly, highestPriority);
    });
  }

  public cancel(): void {
    this.frameToken++;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.scheduledPages.clear();
    this.isCaretOnlyPending = false;
  }

  public get isPending(): boolean {
    return this.rafId !== null;
  }
}
