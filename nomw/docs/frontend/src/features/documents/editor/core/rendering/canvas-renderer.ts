import { PaintCommand } from './display-list';
import { PageLayout } from '../layout/layout-types';
import { TextRendererFactory } from './text-renderer/text-renderer-factory';

export class CanvasRenderer {
  private static imageCache: Map<string, HTMLImageElement> = new Map();
  private static offscreenMap = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

  private static getOffscreenCanvas(target: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    let offscreen = CanvasRenderer.offscreenMap.get(target);
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      CanvasRenderer.offscreenMap.set(target, offscreen);
    }
    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width;
      offscreen.height = height;
    }
    return offscreen;
  }

  /**
   * Renders the base document content of a page to an HTML Canvas
   * with full HiDPI/Retina resolution and crisp pixel alignment.
   * Uses double-buffered offscreen rasterization and identity matrix transform
   * to guarantee zero screen flicker, maximum text sharpness, and subpixel LCD antialiasing.
   */
  public static renderPage(
    canvas: HTMLCanvasElement,
    pageLayout: PageLayout,
    dpr: number = window.devicePixelRatio || 1,
    zoom: number = 1
  ): void {
    const cssWidth = Math.round(pageLayout.width * zoom);
    const cssHeight = Math.round(pageLayout.height * zoom);

    // Backing Resolution Optimization:
    // Support crisp Retina rendering while capping backing resolution to prevent GPU memory bloat.
    const maxSafeDpr = 2.25;
    const baseTargetDpr = zoom <= 1.25 ? Math.max(dpr, 1.5) : dpr;
    const effectiveDpr = Math.min(maxSafeDpr, baseTargetDpr);

    const bufferWidth = Math.min(4096, Math.round(cssWidth * effectiveDpr));
    const bufferHeight = Math.min(4096, Math.round(cssHeight * effectiveDpr));

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    if (canvas.style.width !== `${cssWidth}px`) {
      canvas.style.width = `${cssWidth}px`;
    }
    if (canvas.style.height !== `${cssHeight}px`) {
      canvas.style.height = `${cssHeight}px`;
    }

    // Use alpha: false on the base document page canvas to unlock full DirectWrite/CoreText
    // subpixel LCD antialiasing (ClearType) for razor-sharp typography.
    const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = bufferWidth / pageLayout.width;
    const scaleY = bufferHeight / pageLayout.height;

    // Use an isolated per-canvas offscreen buffer for atomic double-buffering.
    // This prevents blanking/clearing the visible canvas before text is drawn,
    // completely eliminating frame flicker and screen jitter during typing and line wrap.
    const offscreen = CanvasRenderer.getOffscreenCanvas(canvas, bufferWidth, bufferHeight);

    if (offscreen) {
      const offCtx = offscreen.getContext('2d', { alpha: false }) || offscreen.getContext('2d');
      if (offCtx) {
        offCtx.setTransform(1, 0, 0, 1, 0, 0);
        offCtx.clearRect(0, 0, bufferWidth, bufferHeight);
        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, bufferWidth, bufferHeight);

        const textRenderer = TextRendererFactory.getRenderer();
        textRenderer.beginFrame(offCtx, pageLayout.width, pageLayout.height, effectiveDpr, zoom);

        for (const cmd of pageLayout.displayList) {
          CanvasRenderer.executeCommand(offCtx, cmd, scaleX, scaleY, textRenderer, () => {
            if (canvas.isConnected) {
              CanvasRenderer.renderPage(canvas, pageLayout, dpr, zoom);
            }
          });
        }

        textRenderer.endFrame();

        // Atomically blit rendered offscreen buffer directly to visible canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, bufferWidth, bufferHeight);
        ctx.drawImage(offscreen, 0, 0);
        return;
      }
    }

    // Fallback direct rendering if offscreen canvas is unavailable
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bufferWidth, bufferHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, bufferWidth, bufferHeight);

    const textRenderer = TextRendererFactory.getRenderer();
    textRenderer.beginFrame(ctx, pageLayout.width, pageLayout.height, effectiveDpr, zoom);

    for (const cmd of pageLayout.displayList) {
      CanvasRenderer.executeCommand(ctx, cmd, scaleX, scaleY, textRenderer, () => {
        if (canvas.isConnected) {
          CanvasRenderer.renderPage(canvas, pageLayout, dpr, zoom);
        }
      });
    }

    textRenderer.endFrame();
  }

  private static executeCommand(
    ctx: CanvasRenderingContext2D,
    cmd: PaintCommand,
    scaleX: number,
    scaleY: number,
    textRenderer: ReturnType<typeof TextRendererFactory.getRenderer>,
    requestRepaint?: () => void
  ): void {
    switch (cmd.type) {
      case 'rect': {
        ctx.save();
        const rx = Math.round(cmd.x * scaleX);
        const ry = Math.round(cmd.y * scaleY);
        const rw = Math.round((cmd.x + cmd.width) * scaleX) - rx;
        const rh = Math.round((cmd.y + cmd.height) * scaleY) - ry;

        if (cmd.fill) {
          ctx.fillStyle = cmd.fill;
          if (cmd.radius && cmd.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, cmd.radius * scaleX);
            ctx.fill();
          } else {
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
        if (cmd.stroke) {
          ctx.strokeStyle = cmd.stroke;
          const physicalW = Math.max(1, Math.round((cmd.strokeWidth || 1) * scaleX));
          ctx.lineWidth = physicalW;
          if (cmd.radius && cmd.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, cmd.radius * scaleX);
            ctx.stroke();
          } else {
            ctx.strokeRect(rx, ry, rw, rh);
          }
        }
        ctx.restore();
        break;
      }

      case 'line': {
        ctx.save();
        ctx.strokeStyle = cmd.stroke;
        const physicalW = Math.max(1, Math.round((cmd.strokeWidth || 1) * scaleX));
        ctx.lineWidth = physicalW;
        if (cmd.dash) {
          ctx.setLineDash(cmd.dash.map((d) => d * scaleX));
        }

        // For odd physical line widths (e.g. 1px), offset by 0.5 physical pixel to center on pixel grid
        const offset = (physicalW % 2 === 1) ? 0.5 : 0;
        const x1 = Math.round(cmd.x1 * scaleX) + offset;
        const y1 = Math.round(cmd.y1 * scaleY) + offset;
        const x2 = Math.round(cmd.x2 * scaleX) + offset;
        const y2 = Math.round(cmd.y2 * scaleY) + offset;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'text': {
        // Delegate to active TextRenderer (Canvas2D or GPU)
        textRenderer.renderText(ctx, cmd, scaleX, scaleY);
        break;
      }

      case 'image': {
        const cachedImg = CanvasRenderer.imageCache.get(cmd.src);
        const ix = Math.round(cmd.x * scaleX);
        const iy = Math.round(cmd.y * scaleY);
        const iw = Math.round(cmd.width * scaleX);
        const ih = Math.round(cmd.height * scaleY);

        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(cachedImg, ix, iy, iw, ih);
          ctx.restore();
        } else if (!cachedImg) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = cmd.src;
          img.onload = () => {
            CanvasRenderer.imageCache.set(cmd.src, img);
            requestRepaint?.();
          };
          img.onerror = () => {
            CanvasRenderer.imageCache.delete(cmd.src);
          };
          CanvasRenderer.imageCache.set(cmd.src, img);
        }
        break;
      }

      case 'push-clip': {
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          Math.round(cmd.x * scaleX),
          Math.round(cmd.y * scaleY),
          Math.round(cmd.width * scaleX),
          Math.round(cmd.height * scaleY)
        );
        ctx.clip();
        break;
      }

      case 'pop-clip': {
        ctx.restore();
        break;
      }

      default:
        break;
    }
  }
}
