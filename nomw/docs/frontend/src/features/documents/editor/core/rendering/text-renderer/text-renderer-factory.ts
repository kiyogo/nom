import { ITextRenderer } from './text-renderer.interface';
import { Canvas2DTextRenderer } from './canvas2d-text-renderer';
import { GpuTextRenderer } from './gpu-text-renderer';

export type TextRendererMode = 'canvas2d' | 'gpu';

export class TextRendererFactory {
  private static activeMode: TextRendererMode = 'canvas2d';
  private static canvas2dInstance = new Canvas2DTextRenderer();
  private static gpuInstance = new GpuTextRenderer();

  public static getRenderer(): ITextRenderer {
    if (this.activeMode === 'gpu') {
      return this.gpuInstance;
    }
    return this.canvas2dInstance;
  }

  public static setMode(mode: TextRendererMode): void {
    this.activeMode = mode;
  }

  public static getMode(): TextRendererMode {
    return this.activeMode;
  }
}
