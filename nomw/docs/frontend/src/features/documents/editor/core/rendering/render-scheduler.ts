export class RenderScheduler {
  private scheduledBasePages: Set<number> = new Set();
  private scheduledInteractionPages: Set<number> = new Set();
  private rafId: number | null = null;
  private onRenderCallback: (basePages: Set<number>, interactionPages: Set<number>) => void;

  constructor(onRender: (basePages: Set<number>, interactionPages: Set<number>) => void) {
    this.onRenderCallback = onRender;
  }

  public scheduleBasePage(pageIndex: number): void {
    this.scheduledBasePages.add(pageIndex);
    this.requestFrame();
  }

  public scheduleAllBasePages(pageCount: number): void {
    for (let i = 0; i < pageCount; i++) {
      this.scheduledBasePages.add(i);
    }
    this.requestFrame();
  }

  public scheduleInteractionPage(pageIndex: number): void {
    this.scheduledInteractionPages.add(pageIndex);
    this.requestFrame();
  }

  public scheduleAllInteractionPages(pageCount: number): void {
    for (let i = 0; i < pageCount; i++) {
      this.scheduledInteractionPages.add(i);
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const base = new Set(this.scheduledBasePages);
      const interaction = new Set(this.scheduledInteractionPages);
      this.scheduledBasePages.clear();
      this.scheduledInteractionPages.clear();
      this.onRenderCallback(base, interaction);
    });
  }

  public cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.scheduledBasePages.clear();
    this.scheduledInteractionPages.clear();
  }
}
