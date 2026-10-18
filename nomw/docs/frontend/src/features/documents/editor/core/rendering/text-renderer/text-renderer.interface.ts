import { DrawTextCommand } from '../display-list';

/**
 * Interface representing a shaped glyph with vector Bézier outline data
 * (Ready for Evan Wallace's Loop-Blinn GPU vector text rendering).
 */
export interface ShapedGlyph {
  glyphId: number;
  codepoint: number;
  cluster: string;
  x: number;
  y: number;
  advanceX: number;
  advanceY: number;
  /**
   * Quadratic Bézier curve segments for GPU rendering
   * [(x0, y0), (ctrlX, ctrlY), (x1, y1)] where (s/2 + t)^2 < t
   */
  quadraticCurves?: Array<{
    p0: [number, number];
    p1: [number, number];
    p2: [number, number];
  }>;
  /**
   * Triangles for interior polygonal fill with winding number parity
   */
  fillTriangles?: Array<[number, number]>;
}

/**
 * Text run with shaping metadata (kerning, ligatures, Unicode grapheme clusters)
 */
export interface ShapedTextRun {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  fontStyle: string;
  fill: string;
  glyphs: ShapedGlyph[];
  totalAdvance: number;
}

/**
 * Abstract TextRenderer interface separating document layout from rendering backend.
 * Allows seamless switching between Canvas2D and GPU (WebGPU / WebGL2) vector text rendering.
 */
export interface ITextRenderer {
  readonly name: string;
  readonly isGpuAccelerated: boolean;

  /**
   * Initialize resources for the target canvas or rendering context
   */
  init(canvas: HTMLCanvasElement): Promise<void>;

  /**
   * Called before rendering a page frame
   */
  beginFrame(
    ctx: CanvasRenderingContext2D | null,
    logicalWidth: number,
    logicalHeight: number,
    dpr: number,
    zoom: number
  ): void;

  /**
   * Render a text command with pixel-accurate alignment and crisp subpixel typography
   */
  renderText(
    ctx: CanvasRenderingContext2D | null,
    cmd: DrawTextCommand,
    scaleX: number,
    scaleY: number
  ): void;

  /**
   * Called after completing all render commands for a page frame
   */
  endFrame(): void;

  /**
   * Release cached textures or GPU buffers
   */
  dispose(): void;
}
