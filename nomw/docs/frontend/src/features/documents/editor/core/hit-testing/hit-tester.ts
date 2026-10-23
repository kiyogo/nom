import { DocumentLayout, PageLayout, HitTestEntry, Rect, PositionedCluster } from '../layout/layout-types';
import { DocPosition, EditorSelection, normalizeSelection } from '../selection/position';
import { DocumentModel } from '../model/document-model';
import { layoutEngine } from '../layout/layout-engine';

export interface CaretGeometry {
  pageIndex: number;
  x: number;
  y: number;
  height: number;
  baseline: number;
}

export interface SelectionPageRect {
  pageIndex: number;
  rect: Rect;
}

export class HitTester {
  private static getXForOffset(entry: HitTestEntry, offset: number, fallback: number): number {
    if (entry.clusters.length === 0) return fallback;
    if (offset <= entry.startOffset) return entry.rect.x;
    if (offset >= entry.endOffset) {
      const last = entry.clusters[entry.clusters.length - 1];
      return last.x + last.width;
    }

    for (const cl of entry.clusters) {
      const clStart = cl.offsetInBlock;
      const clEnd = cl.offsetInBlock + cl.cluster.length;
      if (offset >= clStart && offset <= clEnd) {
        const fraction = cl.cluster.length > 0 ? (offset - clStart) / cl.cluster.length : 0;
        return cl.x + cl.width * Math.max(0, Math.min(1, fraction));
      }
    }

    return fallback;
  }

  /**
   * Hit test a physical point (in logical document coordinates) on a specific page.
   * Returns precise DocPosition.
   */
  public static hitTestPoint(
    pageIndex: number,
    x: number,
    y: number,
    layout: DocumentLayout,
    doc: DocumentModel
  ): DocPosition | null {
    const page = layout.pages[pageIndex];
    if (!page || page.blocks.length === 0) {
      return null;
    }

    // 1. Precise Table Cell Hit Testing
    for (const blk of page.blocks) {
      if (blk.tableLayout) {
        const tbl = blk.tableLayout;
        if (
          x >= tbl.rect.x - 20 &&
          x <= tbl.rect.x + tbl.rect.width + 20 &&
          y >= tbl.rect.y - 8 &&
          y <= tbl.rect.y + tbl.rect.height + 8
        ) {
          let targetRow = tbl.rows.find((r) => y >= r.rect.y && y <= r.rect.y + r.rect.height);
          if (!targetRow && tbl.rows.length > 0) {
            let minRowDist = Infinity;
            for (const r of tbl.rows) {
              const dist = Math.abs(y - (r.rect.y + r.rect.height / 2));
              if (dist < minRowDist) {
                minRowDist = dist;
                targetRow = r;
              }
            }
          }

          if (targetRow) {
            let targetCell = targetRow.cells.find((c) => x >= c.rect.x && x <= c.rect.x + c.rect.width);
            if (!targetCell && targetRow.cells.length > 0) {
              let minCellDist = Infinity;
              for (const c of targetRow.cells) {
                const dist = Math.abs(x - (c.rect.x + c.rect.width / 2));
                if (dist < minCellDist) {
                  minCellDist = dist;
                  targetCell = c;
                }
              }
            }

            if (targetCell) {
              const cellBlocks = targetCell.blocks;
              if (cellBlocks && cellBlocks.length > 0) {
                const cellLines = cellBlocks.flatMap((cb) => cb.lines);
                if (cellLines.length === 0) {
                  return { blockId: cellBlocks[0].blockId, offset: 0 };
                }

                let closestLine = cellLines[0];
                let minLineDist = Infinity;
                for (const line of cellLines) {
                  if (y >= line.rect.y && y <= line.rect.y + line.rect.height) {
                    closestLine = line;
                    break;
                  }
                  const dist = Math.abs(y - (line.rect.y + line.rect.height / 2));
                  if (dist < minLineDist) {
                    minLineDist = dist;
                    closestLine = line;
                  }
                }

                return HitTester.hitTestLineOffset(closestLine, x);
              } else {
                const tblModel = (doc.getBlockById((tbl as any).id || (tbl as any).tableId) || null) as any;
                const rIdx = tbl.rows.findIndex((r) => r.rowId === targetRow?.rowId);
                const cIdx = targetRow?.cells.findIndex((c) => c.cellId === targetCell?.cellId) ?? 0;
                const cellObj = tblModel?.rows[rIdx]?.cells[cIdx];
                if (cellObj && cellObj.blocks && cellObj.blocks.length > 0) {
                  return { blockId: cellObj.blocks[0].id, offset: 0 };
                }
              }
            }
          }
        }
      }
    }

    // 2. Regular paragraphs and top-level block hit testing
    const nonTableLines = page.hitTestIndex.filter((entry) => {
      // Check if entry belongs to a table
      for (const blk of page.blocks) {
        if (blk.tableLayout) {
          for (const row of blk.tableLayout.rows) {
            for (const cell of row.cells) {
              if (cell.blocks.some((cb) => cb.blockId === entry.blockId)) {
                return false;
              }
            }
          }
        }
      }
      return true;
    });

    const candidateEntries = nonTableLines.length > 0 ? nonTableLines : page.hitTestIndex;
    if (candidateEntries.length === 0) {
      return null;
    }

    // 2D Line Proximity & Text Bounds Affinity:
    // Accurately chooses the intended line without letting adjacent line boxes steal clicks,
    // properly accounting for first-line indent, blank margins, and vertical line spacing.
    let targetEntry = candidateEntries[0];
    let bestScore = Infinity;

    for (const entry of candidateEntries) {
      const lineTop = entry.rect.y;
      const lineBottom = entry.rect.y + entry.rect.height;
      const lineCenterY = (lineTop + lineBottom) / 2;
      const lineLeft = entry.clusters.length > 0 ? entry.clusters[0].x : entry.rect.x;
      const lineRight = entry.clusters.length > 0
        ? entry.clusters[entry.clusters.length - 1].x + entry.clusters[entry.clusters.length - 1].width
        : entry.rect.x + entry.rect.width;

      // Vertical distance from click y to the line's bounding box
      const vertDist = y >= lineTop && y <= lineBottom
        ? 0
        : (y < lineTop ? lineTop - y : y - lineBottom);

      // Is x within the line's text bounds (with 12px margin on sides)
      const isHorizTextHit = x >= lineLeft - 12 && x <= lineRight + 12;
      const horizGap = isHorizTextHit ? 0 : (x < lineLeft ? (lineLeft - x) * 0.5 : (x - lineRight) * 0.2);

      // Score:
      // - vertDist * 8: heavily penalize lines far above or below click
      // - Math.abs(y - lineCenterY): distance to visual center of line
      // - isHorizTextHit: heavily rewards lines where x is directly on actual characters
      const score = vertDist * 8 + Math.abs(y - lineCenterY) + (isHorizTextHit ? 0 : 35) + horizGap;

      if (score < bestScore) {
        bestScore = score;
        targetEntry = entry;
      }
    }

    return HitTester.hitTestLineOffset(targetEntry, x);
  }

  private static hitTestLineOffset(targetEntry: any, x: number): DocPosition {
    const clusters: PositionedCluster[] = targetEntry.clusters || (targetEntry.runs || []).flatMap((r: any) => r.clusters || []);
    if (clusters.length === 0) {
      return { blockId: targetEntry.blockId, offset: targetEntry.startOffset, affinity: 'forward' };
    }

    if (x <= clusters[0].x) {
      return { blockId: targetEntry.blockId, offset: clusters[0].offsetInBlock, affinity: 'forward' };
    }

    const lastCluster = clusters[clusters.length - 1];
    if (x >= lastCluster.x + lastCluster.width) {
      let lastVisibleIdx = clusters.length - 1;
      while (lastVisibleIdx >= 0 && /^\s+$/.test(clusters[lastVisibleIdx].cluster)) {
        lastVisibleIdx--;
      }
      if (lastVisibleIdx >= 0 && lastVisibleIdx < clusters.length - 1) {
        const lastVisCl = clusters[lastVisibleIdx];
        return {
          blockId: targetEntry.blockId,
          offset: lastVisCl.offsetInBlock + lastVisCl.cluster.length,
          affinity: 'backward',
        };
      }
      return { blockId: targetEntry.blockId, offset: targetEntry.endOffset, affinity: 'backward' };
    }

    let low = 0;
    let high = clusters.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cl = clusters[mid];
      const clLeft = cl.x;
      const clRight = cl.x + cl.width;

      if (x >= clLeft && x <= clRight) {
        const isCloserToRight = x - clLeft > clRight - x;
        const offset = isCloserToRight
          ? cl.offsetInBlock + cl.cluster.length
          : cl.offsetInBlock;
        return { blockId: targetEntry.blockId, offset, affinity: isCloserToRight ? 'forward' : 'forward' };
      }

      if (x < clLeft) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    // Binary search did not find an exact overlapping cluster
    // (e.g. between clusters, due to fractional subpixel rounding, or spacing).
    // Clamp to the closest neighboring cluster boundary instead of resetting to start of line!
    if (high < 0) {
      return { blockId: targetEntry.blockId, offset: clusters[0].offsetInBlock, affinity: 'forward' };
    }
    if (low >= clusters.length) {
      return { blockId: targetEntry.blockId, offset: targetEntry.endOffset, affinity: 'backward' };
    }

    const leftCl = clusters[high];
    const rightCl = clusters[low];
    const distToLeft = Math.abs(x - (leftCl.x + leftCl.width));
    const distToRight = Math.abs(rightCl.x - x);

    const offset = distToLeft <= distToRight
      ? leftCl.offsetInBlock + leftCl.cluster.length
      : rightCl.offsetInBlock;

    return { blockId: targetEntry.blockId, offset, affinity: 'forward' };
  }

  /**
   * Get exact CaretGeometry (x, y, height) for a given DocPosition
   */
  public static getCaretGeometry(
    pos: DocPosition | null,
    layout: DocumentLayout,
    doc: DocumentModel,
    pageRange?: { start: number; end: number }
  ): CaretGeometry | null {
    if (!pos) return null;

    // Determine font size of active block to size caret proportionally to text font
    const block = doc.getBlockById(pos.blockId);
    let fontSizePt = 14;
    if (block && 'runs' in block && Array.isArray(block.runs)) {
      let currentOff = 0;
      let targetRun = block.runs[0];
      for (const r of block.runs) {
        currentOff += r.text.length;
        if (currentOff >= pos.offset || currentOff === 0) {
          targetRun = r;
          break;
        }
      }
      if (targetRun && targetRun.marks && targetRun.marks.fontSize) {
        fontSizePt = targetRun.marks.fontSize;
      }
    }
    const fontSizePx = (fontSizePt * 96) / 72;
    const caretHeight = Math.max(14, Math.round(fontSizePx * 1.15));

    let pages: PageLayout[];
    if (pageRange) {
      pages = layout.pages.slice(Math.max(0, pageRange.start), Math.max(pageRange.start, pageRange.end));
    } else if (layout.pages.length > 20 && (doc.settings as any).virtualPageCount) {
      const targetPage = layoutEngine.getBlockPageIndex(pos.blockId);
      const startP = Math.max(0, targetPage - 1);
      const endP = Math.min(layout.pages.length, targetPage + 2);
      pages = layout.pages.slice(startP, endP);
    } else {
      pages = layout.pages;
    }

    let firstBlockEntry: HitTestEntry | null = null;
    let lastBlockEntry: HitTestEntry | null = null;

    for (const page of pages) {
      for (const entry of page.hitTestIndex) {
        if (entry.blockId === pos.blockId) {
          if (!firstBlockEntry) firstBlockEntry = entry;
          lastBlockEntry = entry;

          // Check if offset falls within this line
          if (pos.offset >= entry.startOffset && pos.offset <= entry.endOffset) {
            // Soft wrap boundary check:
            // When pos.offset is at the end of this line, but there is a subsequent line in the same block starting at pos.offset:
            // If pos.affinity is 'backward', the user specifically clicked at the end of this line, so keep caret here.
            // Otherwise (affinity is 'forward' or undefined, e.g. from typing or wrapping), let the subsequent line render the caret at its beginning!
            if (pos.offset === entry.endOffset && (pos as any).affinity !== 'backward') {
              const hasSubsequentLine = pages.some((p) =>
                p.hitTestIndex.some(
                  (other) =>
                    other.blockId === pos.blockId &&
                    other.lineIndex === entry.lineIndex + 1 &&
                    other.startOffset === pos.offset
                )
              );
              if (hasSubsequentLine) {
                continue;
              }
            }
            const caretY = Math.round(entry.baseline - fontSizePx * 0.88);

            // If empty line
            if (entry.clusters.length === 0) {
              return {
                pageIndex: page.pageIndex,
                x: entry.rect.x,
                y: caretY,
                height: caretHeight,
                baseline: entry.baseline,
              };
            }

            // If at end of line
            if (pos.offset === entry.endOffset) {
              const lastCl = entry.clusters[entry.clusters.length - 1];
              return {
                pageIndex: page.pageIndex,
                x: lastCl ? lastCl.x + lastCl.width : entry.rect.x,
                y: caretY,
                height: caretHeight,
                baseline: entry.baseline,
              };
            }

            // Find matching cluster
            for (let i = 0; i < entry.clusters.length; i++) {
              const cl = entry.clusters[i];
              if (pos.offset >= cl.offsetInBlock && pos.offset <= cl.offsetInBlock + cl.cluster.length) {
                const fraction = cl.cluster.length > 0 ? (pos.offset - cl.offsetInBlock) / cl.cluster.length : 0;
                const clX = fraction === 1 ? cl.x + cl.width : (fraction === 0 ? cl.x : cl.x + cl.width * fraction);
                return {
                  pageIndex: page.pageIndex,
                  x: clX,
                  y: caretY,
                  height: caretHeight,
                  baseline: entry.baseline,
                };
              }
            }

            return {
              pageIndex: page.pageIndex,
              x: entry.rect.x,
              y: caretY,
              height: caretHeight,
              baseline: entry.baseline,
            };
          }
        }
      }
    }

    // If offset is beyond the last measured line of the block, position at end of block
    if (lastBlockEntry && pos.offset >= lastBlockEntry.endOffset) {
      const caretY = Math.round(lastBlockEntry.baseline - fontSizePx * 0.88);
      const lastCl = lastBlockEntry.clusters[lastBlockEntry.clusters.length - 1];
      return {
        pageIndex: lastBlockEntry.pageIndex,
        x: lastCl ? lastCl.x + lastCl.width : lastBlockEntry.rect.x,
        y: caretY,
        height: caretHeight,
        baseline: lastBlockEntry.baseline,
      };
    }

    if (firstBlockEntry && pos.offset <= firstBlockEntry.startOffset) {
      const caretY = Math.round(firstBlockEntry.baseline - fontSizePx * 0.88);
      return {
        pageIndex: firstBlockEntry.pageIndex,
        x: firstBlockEntry.rect.x,
        y: caretY,
        height: caretHeight,
        baseline: firstBlockEntry.baseline,
      };
    }

    // Also search inside page blocks and table cells
    for (const page of pages) {
      for (const blk of page.blocks) {
        if (blk.tableLayout) {
          for (const row of blk.tableLayout.rows) {
            for (const cell of row.cells) {
              for (const cb of cell.blocks) {
                if (cb.blockId === pos.blockId) {
                  for (const line of cb.lines) {
                    if (pos.offset >= line.startOffset && pos.offset <= line.endOffset) {
                      const caretY = Math.round(line.baseline - fontSizePx * 0.88);
                      const lineClusters: PositionedCluster[] = (line as any).clusters || (line.runs || []).flatMap((r: any) => r.clusters || []);
                      if (lineClusters.length === 0 || pos.offset === 0) {
                        return {
                          pageIndex: page.pageIndex,
                          x: line.rect.x,
                          y: caretY,
                          height: caretHeight,
                          baseline: line.baseline,
                        };
                      }
                      if (pos.offset === line.endOffset) {
                        const lastCl = lineClusters[lineClusters.length - 1];
                        return {
                          pageIndex: page.pageIndex,
                          x: lastCl ? lastCl.x + lastCl.width : line.rect.x,
                          y: caretY,
                          height: caretHeight,
                          baseline: line.baseline,
                        };
                      }
                      for (const cl of lineClusters) {
                        if (pos.offset >= cl.offsetInBlock && pos.offset <= cl.offsetInBlock + cl.cluster.length) {
                          const fraction = cl.cluster.length > 0 ? (pos.offset - cl.offsetInBlock) / cl.cluster.length : 0;
                          const clX = fraction === 1 ? cl.x + cl.width : (fraction === 0 ? cl.x : cl.x + cl.width * fraction);
                          return {
                            pageIndex: page.pageIndex,
                            x: clX,
                            y: caretY,
                            height: caretHeight,
                            baseline: line.baseline,
                          };
                        }
                      }
                      return {
                        pageIndex: page.pageIndex,
                        x: line.rect.x,
                        y: caretY,
                        height: caretHeight,
                        baseline: line.baseline,
                      };
                    }
                  }
                  return {
                    pageIndex: page.pageIndex,
                    x: cell.rect.x + 8,
                    y: cell.rect.y + 6,
                    height: caretHeight,
                    baseline: cell.rect.y + 6 + 14,
                  };
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Calculates selection highlight rectangles across pages and lines.
   */
  public static getSelectionRectangles(
    selection: EditorSelection | null,
    layout: DocumentLayout,
    doc: DocumentModel,
    pageRange?: { start: number; end: number }
  ): SelectionPageRect[] {
    if (!selection) return [];
    const { start, end, isCollapsed } = normalizeSelection(selection, doc);
    if (isCollapsed) return [];

    const rects: SelectionPageRect[] = [];

    let pages: PageLayout[];
    if (pageRange) {
      pages = layout.pages.slice(Math.max(0, pageRange.start), Math.max(pageRange.start, pageRange.end));
    } else if (layout.pages.length > 20 && (doc.settings as any).virtualPageCount) {
      const startPage = layoutEngine.getBlockPageIndex(start.blockId);
      const endPage = layoutEngine.getBlockPageIndex(end.blockId);
      const startP = Math.max(0, Math.min(startPage, endPage) - 1);
      const endP = Math.min(layout.pages.length, Math.max(startPage, endPage) + 2);
      pages = layout.pages.slice(startP, endP);
    } else {
      pages = layout.pages;
    }

    for (const page of pages) {
      for (const entry of page.hitTestIndex) {
        // Check if this line is within selected blocks/offsets
        const blockIdx = doc.getBlockIndex(entry.blockId);
        const startBlockIdx = doc.getBlockIndex(start.blockId);
        const endBlockIdx = doc.getBlockIndex(end.blockId);

        const isInBlockRange = blockIdx >= startBlockIdx && blockIdx <= endBlockIdx;
        if (!isInBlockRange) continue;

        // Line is completely before selection start
        if (blockIdx === startBlockIdx && entry.endOffset <= start.offset) continue;
        // Line is completely after selection end
        if (blockIdx === endBlockIdx && entry.startOffset >= end.offset) continue;

        let selStartX = entry.rect.x;
        let selEndX = entry.rect.x + Math.max(10, entry.rect.width);

        if (entry.clusters.length > 0) {
          if (blockIdx === startBlockIdx && start.offset > entry.startOffset) {
            selStartX = HitTester.getXForOffset(entry, start.offset, selStartX);
          }

          if (blockIdx === endBlockIdx && end.offset < entry.endOffset) {
            selEndX = HitTester.getXForOffset(entry, end.offset, selEndX);
          }
        }

        const width = Math.max(4, selEndX - selStartX);
        rects.push({
          pageIndex: page.pageIndex,
          rect: {
            x: selStartX,
            y: entry.rect.y,
            width,
            height: entry.rect.height,
          },
        });
      }
    }

    return rects;
  }
}
