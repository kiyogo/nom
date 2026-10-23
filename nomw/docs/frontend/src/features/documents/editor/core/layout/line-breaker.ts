import { TextRun, TextMarks, ParagraphStyle } from '../model/types';
import { fontMetrics } from '../fonts/font-metrics-service';
import { getGraphemeClusters, getWordSegments, WordSegment } from '../utils/unicode';
import { TextLineLayout, PositionedRun, PositionedCluster } from './layout-types';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FOREGROUND_COLOR } from '../model/defaults';
import { generateRunId } from '../utils/id-generator';

export interface BreakLineInput {
  blockId: string;
  runs: TextRun[];
  style: ParagraphStyle;
  contentWidth: number;
  startX: number;
  startY: number;
}

interface IntermediateWord {
  text: string;
  runIndex: number;
  marks: TextMarks;
  width: number;
  isSpace: boolean;
  startOffsetInBlock: number;
}

export interface ParagraphLayoutResult {
  lines: TextLineLayout[];
  totalHeight: number;
}

export function layoutParagraphLines(input: BreakLineInput): ParagraphLayoutResult {
  const { blockId, runs, style, contentWidth, startX, startY } = input;
  const alignment = style.alignment || 'left';
  const lineHeightMultiplier = style.lineHeight || 1.25;

  const leftIndent = style.indentStart || 0;
  const rightIndent = style.indentEnd || 0;
  const firstLineIndent = style.firstLineIndent || 0;

  // Handle completely empty paragraph
  if (runs.length === 0 || (runs.length === 1 && (runs[0].text.length === 0 || runs[0].text === '\n'))) {
    const marks = runs[0]?.marks || {};
    const metrics = fontMetrics.measureRun(' ', marks, lineHeightMultiplier);
    const availableWidth = Math.max(50, contentWidth - leftIndent - rightIndent - firstLineIndent);
    let alignOffsetX = 0;
    if (alignment === 'center') {
      alignOffsetX = availableWidth / 2;
    } else if (alignment === 'right') {
      alignOffsetX = availableWidth;
    }
    const lineX = startX + leftIndent + firstLineIndent + alignOffsetX;
    const fontHeight = metrics.ascent + metrics.descent;
    const lineHeight = Math.max(fontHeight, metrics.lineHeightPx);
    const halfLeading = Math.max(0, (lineHeight - fontHeight) / 2);
    const baseline = startY + halfLeading + metrics.ascent;

    const emptyLine: TextLineLayout = {
      lineIndex: 0,
      blockId,
      pageIndex: 0,
      rect: {
        x: lineX,
        y: startY,
        width: 0,
        height: lineHeight,
      },
      baseline,
      runs: [
        {
          runId: runs[0]?.id || 'r-empty',
          text: '',
          marks: { ...marks },
          x: lineX,
          y: startY + halfLeading,
          width: 0,
          height: lineHeight,
          baseline,
          startOffset: 0,
          endOffset: 0,
          clusters: [],
        },
      ],
      startOffset: 0,
      endOffset: 0,
    };

    return { lines: [emptyLine], totalHeight: lineHeight };
  }

  // Tokenize runs into words/spaces while tracking offsets in block
  const words: IntermediateWord[] = [];
  let blockOffset = 0;

  for (let rIdx = 0; rIdx < runs.length; rIdx++) {
    const run = runs[rIdx];
    const segments = getWordSegments(run.text);

    if (segments.length === 0 && run.text.length > 0) {
      const width = fontMetrics.measureWidth(run.text, run.marks);
      words.push({
        text: run.text,
        runIndex: rIdx,
        marks: run.marks,
        width,
        isSpace: /^\s+$/.test(run.text),
        startOffsetInBlock: blockOffset,
      });
      blockOffset += run.text.length;
    } else {
      for (const seg of segments) {
        const width = fontMetrics.measureWidth(seg.word, run.marks);
        words.push({
          text: seg.word,
          runIndex: rIdx,
          marks: run.marks,
          width,
          isSpace: /^\s+$/.test(seg.word),
          startOffsetInBlock: blockOffset + seg.startIndex,
        });
      }
      blockOffset += run.text.length;
    }
  }

  // Break words into lines
  const lineWordGroups: IntermediateWord[][] = [];
  let currentGroup: IntermediateWord[] = [];
  let currentGroupWidth = 0;
  let lineIdx = 0;

  const getAvailableWidthForLine = (lIdx: number) => {
    const currentFirstLine = lIdx === 0 ? firstLineIndent : 0;
    return Math.max(50, contentWidth - leftIndent - rightIndent - currentFirstLine);
  };

  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const w = words[wIdx];
    const avail = getAvailableWidthForLine(lineIdx);

    if (w.isSpace) {
      // Trailing spaces hang on the current line (Word / Google Docs / CSS behavior)
      if (currentGroupWidth + w.width <= avail + 120) {
        currentGroup.push(w);
        currentGroupWidth += w.width;
      } else {
        lineWordGroups.push(currentGroup);
        lineIdx += 1;
        currentGroup = [w];
        currentGroupWidth = w.width;
      }
    } else if (/^[.,;:!?)}\]]+$/.test(w.text) && currentGroup.length > 0) {
      // Punctuation marks must never wrap to start a new line on their own!
      // They cling to the preceding word on the current line.
      currentGroup.push(w);
      currentGroupWidth += w.width;
    } else if (currentGroupWidth + w.width <= avail) {
      // Fits on the current line
      currentGroup.push(w);
      currentGroupWidth += w.width;
    } else {
      // Fill the remaining line before moving overflowing graphemes. Moving
      // the whole token after a space made already typed text jump to the next
      // line as the token grew. Graphemes keep Vietnamese accents/emoji intact.
      {
        const clusters = getGraphemeClusters(w.text);
        let partialWord = '';
        let partialWidth = 0;
        let clusterOffset = w.startOffsetInBlock;

        for (const cl of clusters) {
          const nextWord = partialWord + cl;
          const nextWidth = fontMetrics.measureWidth(nextWord, w.marks);
          const curAvail = getAvailableWidthForLine(lineIdx);

          if (currentGroupWidth + nextWidth > curAvail && (currentGroup.length > 0 || partialWord.length > 0)) {
            if (partialWord.length > 0) {
              currentGroup.push({
                text: partialWord,
                runIndex: w.runIndex,
                marks: w.marks,
                width: partialWidth,
                isSpace: false,
                startOffsetInBlock: clusterOffset - partialWord.length,
              });
            }
            lineWordGroups.push(currentGroup);
            lineIdx += 1;
            currentGroup = [];
            currentGroupWidth = 0;
            partialWord = cl;
            partialWidth = fontMetrics.measureWidth(cl, w.marks);
          } else {
            partialWord = nextWord;
            partialWidth = nextWidth;
          }
          clusterOffset += cl.length;
        }

        if (partialWord.length > 0) {
          currentGroup.push({
            text: partialWord,
            runIndex: w.runIndex,
            marks: w.marks,
            width: partialWidth,
            isSpace: false,
            startOffsetInBlock: clusterOffset - partialWord.length,
          });
          currentGroupWidth += partialWidth;
        }
      }
    }
  }

  if (currentGroup.length > 0) {
    lineWordGroups.push(currentGroup);
  }

  // Convert word groups into TextLineLayout objects with metrics and positioned clusters
  const lines: TextLineLayout[] = [];
  let currentY = startY;

  for (let lIdx = 0; lIdx < lineWordGroups.length; lIdx++) {
    const group = lineWordGroups[lIdx];
    const isFirstLine = lIdx === 0;
    const isLastLine = lIdx === lineWordGroups.length - 1;
    const currentFirstLine = isFirstLine ? firstLineIndent : 0;
    const availableWidth = Math.max(50, contentWidth - leftIndent - rightIndent - currentFirstLine);

    // Calculate max ascent, descent, and line height for this line
    let maxAscent = 0;
    let maxDescent = 0;
    let totalWordsWidth = 0;
    let spaceCount = 0;

    for (const w of group) {
      const metrics = fontMetrics.measureRun(w.text, w.marks, lineHeightMultiplier);
      if (metrics.ascent > maxAscent) maxAscent = metrics.ascent;
      if (metrics.descent > maxDescent) maxDescent = metrics.descent;
      totalWordsWidth += w.width;
      if (w.isSpace) spaceCount += 1;
    }

    if (maxAscent === 0) maxAscent = 12;
    if (maxDescent === 0) maxDescent = 4;

    const fontHeight = maxAscent + maxDescent;
    const lineHeightPx = Math.max(fontHeight, fontHeight * (lineHeightMultiplier > 1 ? lineHeightMultiplier * 0.9 : 1.15));
    const halfLeading = Math.max(0, (lineHeightPx - fontHeight) / 2);
    const baseline = currentY + halfLeading + maxAscent;

    // Calculate alignment offset & justification space expansion
    let alignOffsetX = 0;
    let extraSpacePerWord = 0;

    // Count trailing spaces at the end of the line
    let trailingSpacesCount = 0;
    let trailingSpacesWidth = 0;
    for (let i = group.length - 1; i >= 0; i--) {
      if (group[i].isSpace) {
        trailingSpacesCount++;
        trailingSpacesWidth += group[i].width;
      } else {
        break;
      }
    }

    const innerSpaceCount = spaceCount - trailingSpacesCount;
    const contentWidthForJustify = totalWordsWidth - trailingSpacesWidth;
    const justifyRemainingSpace = availableWidth - contentWidthForJustify;
    const remainingSpace = availableWidth - totalWordsWidth;

    if (alignment === 'center') {
      alignOffsetX = Math.max(0, remainingSpace / 2);
    } else if (alignment === 'right') {
      alignOffsetX = Math.max(0, remainingSpace);
    } else if (alignment === 'justify' && !isLastLine && innerSpaceCount > 0 && justifyRemainingSpace > 0) {
      const maxExtraSpace = 32;
      extraSpacePerWord = Math.min(maxExtraSpace, justifyRemainingSpace / innerSpaceCount);
    }

    const lineStartX = startX + leftIndent + currentFirstLine + alignOffsetX;
    let runX = lineStartX;

    const lineRuns: PositionedRun[] = [];
    const lineStartOffset = group[0]?.startOffsetInBlock ?? 0;
    const lastWord = group[group.length - 1];
    const lineEndOffset = (lastWord?.startOffsetInBlock ?? 0) + (lastWord?.text.length ?? 0);

    // Group adjacent words belonging to the same run
    let currentRunWords: IntermediateWord[] = [];
    let currentRunIdx = group[0]?.runIndex ?? 0;

    const flushRun = (wordsInRun: IntermediateWord[]) => {
      if (wordsInRun.length === 0) return;
      const rObj = runs[wordsInRun[0].runIndex];
      const runMarks = wordsInRun[0].marks;

      if (extraSpacePerWord === 0) {
        // Normal text (left, center, right, or last line of justified paragraph)
        // Measure clusters across the full runText so OpenType kerning across words & spaces is 100% incorporated
        const runText = wordsInRun.map((w) => w.text).join('');
        const startOffset = wordsInRun[0].startOffsetInBlock;
        const endOffset = wordsInRun[wordsInRun.length - 1].startOffsetInBlock + wordsInRun[wordsInRun.length - 1].text.length;

        const clusters = fontMetrics.measureClusters(runText, runMarks);
        const positionedClusters: PositionedCluster[] = [];
        let clusterOffset = startOffset;

        for (const cl of clusters) {
          positionedClusters.push({
            cluster: cl.cluster,
            x: runX + cl.xOffset,
            y: currentY + halfLeading,
            width: cl.width,
            height: lineHeightPx,
            offsetInBlock: clusterOffset,
          });
          clusterOffset += cl.cluster.length;
        }

        const runWidth = fontMetrics.measureWidth(runText, runMarks);

        lineRuns.push({
          runId: rObj?.id || generateRunId(),
          text: runText,
          marks: { ...runMarks },
          x: runX,
          y: currentY + halfLeading,
          width: runWidth,
          height: lineHeightPx,
          baseline,
          startOffset,
          endOffset,
          clusters: positionedClusters,
        });

        runX += runWidth;
      } else {
        // Justified text with expanded spaces: push each word as its own positioned run
        // so Canvas renders each word at its exact expanded coordinate matching the caret.
        let wordX = runX;
        for (const w of wordsInRun) {
          const clusters = fontMetrics.measureClusters(w.text, w.marks);
          const positionedClusters: PositionedCluster[] = [];
          const isTrailingSpace = w.isSpace && group.slice(group.lastIndexOf(w)).every((item) => item.isSpace);
          const addedSpace = w.isSpace && !isTrailingSpace ? extraSpacePerWord : 0;
          const clusterAddedSpace = w.isSpace && !isTrailingSpace && clusters.length > 0 ? extraSpacePerWord / clusters.length : 0;
          let wordClusterOffset = w.startOffsetInBlock;

          for (const cl of clusters) {
            positionedClusters.push({
              cluster: cl.cluster,
              x: wordX + cl.xOffset,
              y: currentY + halfLeading,
              width: cl.width + clusterAddedSpace,
              height: lineHeightPx,
              offsetInBlock: wordClusterOffset,
            });
            wordClusterOffset += cl.cluster.length;
          }
          const wordWidth = w.width + addedSpace;

          lineRuns.push({
            runId: generateRunId(),
            text: w.text,
            marks: { ...w.marks },
            x: wordX,
            y: currentY + halfLeading,
            width: wordWidth,
            height: lineHeightPx,
            baseline,
            startOffset: w.startOffsetInBlock,
            endOffset: w.startOffsetInBlock + w.text.length,
            clusters: positionedClusters,
          });

          wordX += wordWidth;
        }
        runX = wordX;
      }
    };

    for (const w of group) {
      if (w.runIndex === currentRunIdx) {
        currentRunWords.push(w);
      } else {
        flushRun(currentRunWords);
        currentRunWords = [w];
        currentRunIdx = w.runIndex;
      }
    }
    flushRun(currentRunWords);

    const totalLineWidth = runX - lineStartX;

    lines.push({
      lineIndex: lIdx,
      blockId,
      pageIndex: 0,
      rect: {
        x: lineStartX,
        y: currentY,
        width: totalLineWidth,
        height: lineHeightPx,
      },
      baseline,
      runs: lineRuns,
      startOffset: lineStartOffset,
      endOffset: lineEndOffset,
    });

    currentY += lineHeightPx;
  }

  return { lines, totalHeight: currentY - startY };
}
