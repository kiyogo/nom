import { ShapedGlyph, ShapedTextRun } from './text-renderer.interface';
import { getGraphemeClusters } from '../../utils/unicode';
import { fontMetrics } from '../../fonts/font-metrics-service';
import { TextMarks } from '../../model/types';

/**
 * Text Shaping Engine.
 * Sits between Document Layout and the Text Renderer.
 * Responsible for resolving raw Unicode text into shaped glyph sequences with kerning,
 * ligatures, and exact font advance positions.
 *
 * Prepared for pluggable HarfBuzz WASM shaping in the future.
 */
export class TextShapingEngine {
  private static instance: TextShapingEngine;
  private shapeCache: Map<string, ShapedTextRun> = new Map();

  public static getInstance(): TextShapingEngine {
    if (!TextShapingEngine.instance) {
      TextShapingEngine.instance = new TextShapingEngine();
    }
    return TextShapingEngine.instance;
  }

  /**
   * Shapes a text run into individual glyph positioning structures
   */
  public shapeText(
    text: string,
    fontFamily: string,
    fontSize: number,
    marks?: TextMarks
  ): ShapedTextRun {
    const cacheKey = `${fontFamily}::${fontSize}::${marks?.bold ? 'b' : ''}${marks?.italic ? 'i' : ''}::${text}`;
    const cached = this.shapeCache.get(cacheKey);
    if (cached) return cached;

    const clusters = getGraphemeClusters(text);
    const glyphs: ShapedGlyph[] = [];
    let currentX = 0;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterWidth = fontMetrics.measureWidth(cluster, marks);
      const codepoint = cluster.codePointAt(0) || 0;

      glyphs.push({
        glyphId: codepoint, // Will be OpenType glyphId when HarfBuzz is plugged in
        codepoint,
        cluster,
        x: currentX,
        y: 0,
        advanceX: clusterWidth,
        advanceY: 0,
      });

      currentX += clusterWidth;
    }

    const run: ShapedTextRun = {
      text,
      fontFamily,
      fontSize,
      fontWeight: marks?.bold ? 'bold' : 'normal',
      fontStyle: marks?.italic ? 'italic' : 'normal',
      fill: marks?.foregroundColor || '#000000',
      glyphs,
      totalAdvance: currentX,
    };

    this.shapeCache.set(cacheKey, run);
    return run;
  }

  /**
   * Clear shaping cache on font loads or document clears
   */
  public clearCache(): void {
    this.shapeCache.clear();
  }
}

export const textShaper = TextShapingEngine.getInstance();
