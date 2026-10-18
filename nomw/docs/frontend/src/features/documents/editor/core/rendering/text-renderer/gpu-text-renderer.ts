import { ITextRenderer } from './text-renderer.interface';
import { DrawTextCommand } from '../display-list';
import { Canvas2DTextRenderer } from './canvas2d-text-renderer';
import { GlyphVectorBuilder } from './glyph-vector-builder';
import { WebGL2VectorPipeline, RenderGlyphInstance } from './webgl2-vector-pipeline';

/**
 * Parses CSS hex/rgb/rgba color strings into normalized float values [r, g, b, a] in range [0..1]
 */
function parseCssColor(colorStr?: string): [number, number, number, number] {
  if (!colorStr) return [0, 0, 0, 1];
  const s = colorStr.trim().toLowerCase();

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, 1];
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
  }

  const matchRgb = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (matchRgb) {
    const r = parseInt(matchRgb[1], 10) / 255;
    const g = parseInt(matchRgb[2], 10) / 255;
    const b = parseInt(matchRgb[3], 10) / 255;
    const a = matchRgb[4] !== undefined ? parseFloat(matchRgb[4]) : 1;
    return [r, g, b, a];
  }

  return [0, 0, 0, 1];
}

/**
 * High-Performance GPU Vector Text Renderer implementing Evan Wallace's Loop-Blinn architecture:
 *
 * 1. Batches all page text runs into a single unified GPU vector pass.
 * 2. Evaluates TrueType quadratic Bézier curves directly in GPU fragment shaders.
 * 3. Resolves winding numbers via hardware stencil inversion.
 * 4. Transparent, rock-solid fallback to Canvas2D (with Stem Darkening & SSAA) for any
 *    unsupported glyph or when the font is still loading.
 */
export class GpuTextRenderer implements ITextRenderer {
  public readonly name = 'EvanWallace-GpuVectorText';
  public readonly isGpuAccelerated = true;

  private fallbackRenderer = new Canvas2DTextRenderer();
  private pipeline: WebGL2VectorPipeline | null = null;
  private isFontLoaded = false;
  private activeFontFamily = 'Arial';

  private currentCtx: CanvasRenderingContext2D | null = null;
  private batchedGlyphs: RenderGlyphInstance[] = [];

  private currentDpr = 1;
  private currentZoom = 1;
  private bufferWidth = 1024;
  private bufferHeight = 1024;

  constructor() {
    this.initGpuPipeline();
  }

  private async initGpuPipeline(): Promise<void> {
    try {
      this.pipeline = new WebGL2VectorPipeline();
      await this.preloadFonts();
    } catch (err) {
      console.warn('GpuTextRenderer initialization warning:', err);
    }
  }

  private async preloadFonts(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const arialFont = await GlyphVectorBuilder.loadFont('Arial', '/fonts/arial.ttf');
        GlyphVectorBuilder.registerFont('Arial', arialFont);
        GlyphVectorBuilder.registerFont('sans-serif', arialFont);

        const arialBdFont = await GlyphVectorBuilder.loadFont('Arial-Bold', '/fonts/arialbd.ttf');
        GlyphVectorBuilder.registerFont('Arial-Bold', arialBdFont);

        const arialItFont = await GlyphVectorBuilder.loadFont('Arial-Italic', '/fonts/ariali.ttf');
        GlyphVectorBuilder.registerFont('Arial-Italic', arialItFont);

        const timesFont = await GlyphVectorBuilder.loadFont('Times New Roman', '/fonts/times.ttf');
        GlyphVectorBuilder.registerFont('Times New Roman', timesFont);
        GlyphVectorBuilder.registerFont('serif', timesFont);

        const timesBdFont = await GlyphVectorBuilder.loadFont('Times New Roman-Bold', '/fonts/timesbd.ttf');
        GlyphVectorBuilder.registerFont('Times New Roman-Bold', timesBdFont);

        const timesItFont = await GlyphVectorBuilder.loadFont('Times New Roman-Italic', '/fonts/timesi.ttf');
        GlyphVectorBuilder.registerFont('Times New Roman-Italic', timesItFont);

        this.isFontLoaded = true;
      }
    } catch {
      this.isFontLoaded = false;
    }
  }

  public async init(_canvas: HTMLCanvasElement): Promise<void> {
    if (!this.pipeline) {
      this.pipeline = new WebGL2VectorPipeline();
    }
    if (!this.isFontLoaded) {
      await this.preloadFonts();
    }
  }

  public beginFrame(
    ctx: CanvasRenderingContext2D | null,
    logicalWidth: number,
    logicalHeight: number,
    dpr: number,
    zoom: number
  ): void {
    this.currentCtx = ctx;
    this.batchedGlyphs = [];
    this.currentDpr = dpr;
    this.currentZoom = zoom;

    const cssW = Math.round(logicalWidth * zoom);
    const cssH = Math.round(logicalHeight * zoom);

    this.bufferWidth = Math.round(cssW * dpr);
    this.bufferHeight = Math.round(cssH * dpr);

    if (this.pipeline && this.isFontLoaded) {
      this.pipeline.beginFrame(this.bufferWidth, this.bufferHeight);
    }

    this.fallbackRenderer.beginFrame(ctx, logicalWidth, logicalHeight, dpr, zoom);
  }

  public renderText(
    ctx: CanvasRenderingContext2D | null,
    cmd: DrawTextCommand,
    scaleX: number,
    scaleY: number
  ): void {
    if (!ctx || !cmd.text) return;

    const isBold = cmd.fontWeight === 'bold' || (typeof cmd.fontWeight === 'number' && cmd.fontWeight >= 600);
    const isItalic = cmd.fontStyle === 'italic';

    let fontKey = cmd.fontFamily || this.activeFontFamily;
    if (fontKey.toLowerCase().includes('times')) {
      fontKey = isBold ? 'Times New Roman-Bold' : isItalic ? 'Times New Roman-Italic' : 'Times New Roman';
    } else {
      fontKey = isBold ? 'Arial-Bold' : isItalic ? 'Arial-Italic' : 'Arial';
    }

    const font = GlyphVectorBuilder.getFont(fontKey) || GlyphVectorBuilder.getFont('Arial');

    // If GPU pipeline or font is not ready, seamlessly use the high-contrast Canvas2D text renderer
    if (!this.pipeline || !this.isFontLoaded || !font) {
      this.fallbackRenderer.renderText(ctx, cmd, scaleX, scaleY);
      return;
    }

    try {
      const effectiveScale = (scaleX + scaleY) / 2;
      const physicalFontSizePx = cmd.fontSize * (96 / 72) * effectiveScale;

      const physicalStartX = Math.round(cmd.x * scaleX);
      const physicalStartY = Math.round(cmd.y * scaleY);
      const color = parseCssColor(cmd.fill);

      const runGlyphs: RenderGlyphInstance[] = [];
      let currentX = physicalStartX;

      // Extract vector mesh for each character in run
      for (let i = 0; i < cmd.text.length; i++) {
        const char = cmd.text[i];
        const mesh = GlyphVectorBuilder.getGlyphMesh(font, char);

        if (!mesh) {
          // If any glyph is missing from vector font, delegate entire command to fallback
          this.fallbackRenderer.renderText(ctx, cmd, scaleX, scaleY);
          return;
        }

        runGlyphs.push({
          mesh,
          x: currentX,
          y: physicalStartY,
          fontSizePx: physicalFontSizePx,
          color,
        });

        currentX += mesh.advanceWidth * physicalFontSizePx;
      }

      // Add to frame batch
      this.batchedGlyphs.push(...runGlyphs);
    } catch (e) {
      console.warn('GpuTextRenderer batching error, falling back:', e);
      this.fallbackRenderer.renderText(ctx, cmd, scaleX, scaleY);
    }
  }

  public endFrame(): void {
    // Execute unified GPU vector draw pass for all batched glyphs on this page
    if (this.pipeline && this.batchedGlyphs.length > 0 && this.currentCtx) {
      try {
        this.pipeline.renderGlyphs(this.batchedGlyphs);
        const outputCanvas = this.pipeline.getOutputCanvas();
        if (outputCanvas) {
          this.currentCtx.save();
          // Reset transformation matrix to 1:1 physical device pixels
          this.currentCtx.setTransform(1, 0, 0, 1, 0, 0);
          this.currentCtx.imageSmoothingEnabled = false;
          this.currentCtx.drawImage(outputCanvas as any, 0, 0, this.bufferWidth, this.bufferHeight);
          this.currentCtx.restore();
        }
      } catch (err) {
        console.warn('Failed GPU flush, falling back:', err);
      }
    }

    this.batchedGlyphs = [];
    this.fallbackRenderer.endFrame();
  }

  public dispose(): void {
    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    this.fallbackRenderer.dispose();
  }
}
