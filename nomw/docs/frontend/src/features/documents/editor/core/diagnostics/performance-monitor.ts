/**
 * PerformanceMonitor: Real-time telemetry for tracking editor FPS, input latency,
 * render frame durations, layout times, cache utilization, and mounted PageViews.
 */

export interface PerformanceStats {
  fps: number;
  inputLatencyMs: number;
  renderTimeMs: number;
  layoutTimeMs: number;
  mountedPages: number;
  totalPages: number;
  cacheSize: number;
  memoryEstimateMB: number;
  droppedFrames: number;
}

export type PerformanceListener = (stats: PerformanceStats) => void;

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;

  private isEnabled: boolean = false;
  private listeners: Set<PerformanceListener> = new Set();

  private frameCount: number = 0;
  private lastFpsUpdateTime: number = performance.now();
  private currentFps: number = 60;
  private droppedFrames: number = 0;

  private lastInputStartTime: number = 0;
  private latestInputLatency: number = 0;
  private latestRenderTime: number = 0;
  private latestLayoutTime: number = 0;
  private currentMountedPages: number = 0;
  private currentTotalPages: number = 1;
  private currentCacheSize: number = 0;

  private rafId: number | null = null;

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) return;
    this.isEnabled = enabled;
    if (enabled) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  public get enabled(): boolean {
    return this.isEnabled;
  }

  public recordInputStart(): void {
    if (!this.isEnabled) return;
    this.lastInputStartTime = performance.now();
  }

  public recordInputEnd(): void {
    if (!this.isEnabled || this.lastInputStartTime === 0) return;
    this.latestInputLatency = Math.round((performance.now() - this.lastInputStartTime) * 10) / 10;
    this.lastInputStartTime = 0;
  }

  public recordLayoutDuration(ms: number): void {
    if (!this.isEnabled) return;
    this.latestLayoutTime = Math.round(ms * 10) / 10;
  }

  public recordRenderDuration(ms: number): void {
    if (!this.isEnabled) return;
    this.latestRenderTime = Math.round(ms * 10) / 10;
  }

  public updatePageMetrics(mounted: number, total: number, cacheCount: number): void {
    this.currentMountedPages = mounted;
    this.currentTotalPages = total;
    this.currentCacheSize = cacheCount;
  }

  public subscribe(listener: PerformanceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startLoop(): void {
    const loop = (now: number) => {
      this.frameCount++;
      const elapsed = now - this.lastFpsUpdateTime;

      if (elapsed >= 500) {
        this.currentFps = Math.min(144, Math.round((this.frameCount * 1000) / elapsed));
        if (this.currentFps < 50) {
          this.droppedFrames += Math.round((60 - this.currentFps) * (elapsed / 1000));
        }
        this.frameCount = 0;
        this.lastFpsUpdateTime = now;
        this.notify();
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private notify(): void {
    if (this.listeners.size === 0) return;

    let memEstimate = 0;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      memEstimate = Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024));
    } else {
      memEstimate = Math.round(this.currentCacheSize * 0.2); // ~200KB per page
    }

    const stats: PerformanceStats = {
      fps: this.currentFps,
      inputLatencyMs: this.latestInputLatency,
      renderTimeMs: this.latestRenderTime,
      layoutTimeMs: this.latestLayoutTime,
      mountedPages: this.currentMountedPages,
      totalPages: this.currentTotalPages,
      cacheSize: this.currentCacheSize,
      memoryEstimateMB: memEstimate,
      droppedFrames: this.droppedFrames,
    };

    for (const listener of this.listeners) {
      listener(stats);
    }
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
