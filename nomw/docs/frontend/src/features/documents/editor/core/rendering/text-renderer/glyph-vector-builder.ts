import type { Font, Glyph } from 'opentype.js';
import { parse as parseFont } from 'opentype.js';

export interface GlyphGeometryMesh {
  glyphId: number;
  character: string;
  advanceWidth: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * Flat array of vertices for all triangles (both solid and curve):
   * [x, y, s, t] (4 floats per vertex)
   * Solid: s=0, t=1 (s^2 - t = -1 <= 0, never discarded)
   * Quadratic: P0(0, 0), P1(0.5, 0), P2(1, 1) (s^2 - t <= 0 inside curve)
   */
  vertices: Float32Array;
  totalTriangles: number;
  gpuVbo?: WebGLBuffer;
}

export class GlyphVectorBuilder {
  private static fontCache: Map<string, Font> = new Map();
  private static glyphMeshCache: Map<string, GlyphGeometryMesh> = new Map();

  /**
   * Load and parse a TrueType / OpenType font from a URL or ArrayBuffer
   */
  public static async loadFont(fontFamily: string, fontUrl: string): Promise<Font> {
    const existing = this.fontCache.get(fontFamily);
    if (existing) return existing;

    const response = await fetch(fontUrl);
    const arrayBuffer = await response.arrayBuffer();
    const font = parseFont(arrayBuffer);
    this.fontCache.set(fontFamily, font);
    return font;
  }

  public static getFont(fontFamily: string): Font | undefined {
    return this.fontCache.get(fontFamily) || this.fontCache.get('Arial');
  }

  public static registerFont(fontFamily: string, font: Font): void {
    this.fontCache.set(fontFamily, font);
  }

  /**
   * Builds and caches the exact resolution-independent vector mesh
   * for a glyph using Evan Wallace's Loop-Blinn polygon + curve decomposition.
   */
  public static getGlyphMesh(font: Font, char: string): GlyphGeometryMesh | null {
    const fontName = font.getEnglishName('fontFamily') || 'default';
    const cacheKey = `${fontName}::${char}`;
    const cached = this.glyphMeshCache.get(cacheKey);
    if (cached) return cached;

    const glyph = font.charToGlyph(char);
    if (!glyph) return null;

    const mesh = this.buildMeshFromGlyph(glyph, char, font.unitsPerEm || 2048);
    this.glyphMeshCache.set(cacheKey, mesh);
    return mesh;
  }

  /**
   * Extracts TrueType outline contours and generates:
   * 1. Interior solid polygonal fan triangles (s=0, t=1)
   * 2. Loop-Blinn quadratic Bézier curve correction triangles (P0: 0,0; P1: 0.5,0; P2: 1,1)
   *
   * Reference: Evan Wallace's "Easy Scalable Text Rendering on the GPU" (font.sk / theta)
   */
  private static buildMeshFromGlyph(glyph: Glyph, char: string, unitsPerEm: number): GlyphGeometryMesh {
    const scale = 1 / unitsPerEm;
    const path = glyph.getPath(0, 0, unitsPerEm);
    const commands = path.commands;

    const verts: number[] = [];

    let firstX = 0;
    let firstY = 0;
    let currentX = 0;
    let currentY = 0;
    let contourCount = 0;

    const appendSolidTriangle = (
      ax: number, ay: number,
      bx: number, by: number,
      cx: number, cy: number
    ) => {
      verts.push(
        ax, ay, 0.0, 1.0,
        bx, by, 0.0, 1.0,
        cx, cy, 0.0, 1.0
      );
    };

    const appendCurveTriangle = (
      ax: number, ay: number,
      bx: number, by: number,
      cx: number, cy: number
    ) => {
      verts.push(
        ax, ay, 0.0, 0.0,
        bx, by, 0.5, 0.0,
        cx, cy, 1.0, 1.0
      );
    };

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];

      switch (cmd.type) {
        case 'M': {
          firstX = currentX = cmd.x * scale;
          firstY = currentY = cmd.y * scale;
          contourCount = 0;
          break;
        }

        case 'L': {
          const nx = cmd.x * scale;
          const ny = cmd.y * scale;
          if (Math.abs(nx - currentX) < 1e-6 && Math.abs(ny - currentY) < 1e-6) {
            break;
          }

          if (++contourCount >= 2) {
            appendSolidTriangle(firstX, firstY, currentX, currentY, nx, ny);
          }

          currentX = nx;
          currentY = ny;
          break;
        }

        case 'Q': {
          const cx = cmd.x1 * scale;
          const cy = cmd.y1 * scale;
          const nx = cmd.x * scale;
          const ny = cmd.y * scale;

          if (++contourCount >= 2) {
            appendSolidTriangle(firstX, firstY, currentX, currentY, nx, ny);
          }

          appendCurveTriangle(currentX, currentY, cx, cy, nx, ny);

          currentX = nx;
          currentY = ny;
          break;
        }

        case 'C': {
          // Convert cubic segment to 2 quadratic segments via de Casteljau split
          const p0x = currentX;
          const p0y = currentY;
          const p1x = cmd.x1 * scale;
          const p1y = cmd.y1 * scale;
          const p2x = cmd.x2 * scale;
          const p2y = cmd.y2 * scale;
          const p3x = cmd.x * scale;
          const p3y = cmd.y * scale;

          const midX = (p0x + 3 * p1x + 3 * p2x + p3x) / 8;
          const midY = (p0y + 3 * p1y + 3 * p2y + p3y) / 8;
          const q1x = (3 * p1x - p0x) / 2;
          const q1y = (3 * p1y - p0y) / 2;
          const q2x = (3 * p2x - p3x) / 2;
          const q2y = (3 * p2y - p3y) / 2;

          // Segment 1: P0 -> Mid
          if (++contourCount >= 2) {
            appendSolidTriangle(firstX, firstY, currentX, currentY, midX, midY);
          }
          appendCurveTriangle(currentX, currentY, q1x, q1y, midX, midY);
          currentX = midX;
          currentY = midY;

          // Segment 2: Mid -> P3
          if (++contourCount >= 2) {
            appendSolidTriangle(firstX, firstY, currentX, currentY, p3x, p3y);
          }
          appendCurveTriangle(currentX, currentY, q2x, q2y, p3x, p3y);
          currentX = p3x;
          currentY = p3y;
          break;
        }

        case 'Z': {
          if (Math.abs(currentX - firstX) > 1e-6 || Math.abs(currentY - firstY) > 1e-6) {
            if (++contourCount >= 2) {
              appendSolidTriangle(firstX, firstY, currentX, currentY, firstX, firstY);
            }
            currentX = firstX;
            currentY = firstY;
          }
          contourCount = 0;
          break;
        }

        default:
          break;
      }
    }

    let minX = 0;
    let maxX = 0;
    let minY = -0.8;
    let maxY = 0.2;

    for (let i = 0; i < commands.length; i++) {
      const c = commands[i] as any;
      if (c.x !== undefined) {
        const sx = c.x * scale;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
      }
      if (c.y !== undefined) {
        const sy = c.y * scale;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }

    const bounds = { minX, minY, maxX, maxY };
    const advanceWidth = (glyph.advanceWidth || unitsPerEm * 0.5) * scale;
    const totalTriangles = verts.length / 12; // 4 floats per vertex * 3 vertices

    return {
      glyphId: glyph.index,
      character: char,
      advanceWidth,
      bounds,
      vertices: new Float32Array(verts),
      totalTriangles,
    };
  }
}
