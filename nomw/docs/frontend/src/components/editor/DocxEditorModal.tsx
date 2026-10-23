"use client";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Save, Undo2, Search, Mic, MessageSquare, Edit3, Share,
  ChevronDown, Clipboard, Scissors, Copy, Paintbrush,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Minus, X, TextCursorInput, Diamond, Type, LayoutGrid,
  Eraser, ZoomIn, ZoomOut, FileUp, Printer, Trash, Trash2,
  Image, Link, Calendar, Pen, Highlighter,
  Palette, Maximize, Columns, Hash,
  Check, Lock, FileText, BookOpen, Globe, RefreshCw, Users, Star,
  FolderOpen, CircleHelp, Lightbulb, Bug, Ruler, ArrowLeftRight,
  PanelRightOpen, ScrollText, Shirt, Keyboard, Tag, Sun, Moon, SmilePlus,
  Code2, FileOutput, ChartNoAxesColumnIncreasing, Sigma, Stamp, ArrowDownUp,
  FilePlus2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ListTree, TextQuote, Quote, BookMarked,
  Mail, Contact, Merge, Variable, Eye, SpellCheck2, Languages,
  MessageSquarePlus, ShieldCheck, Grid2X2, PanelLeftOpen, Download, FileCode, Table as TableIcon,
} from "lucide-react";
import { saveFileBlob, getFileBlob } from "../../utils/fileStorage";
import { extractReadableTextFromDoc, parseDocxBlobToHtml } from "../../utils/documentViewer";
import { generateValidDocxBlob } from "../../utils/fileExporter";
import { filesApi } from "../../api/endpoints";

// Canvas Document Engine Core Imports
import { DocumentModel } from "../../features/documents/editor/core/model/document-model";
import { DocumentModelData, TextMarks, ParagraphStyle, TableBlock } from "../../features/documents/editor/core/model/types";
import { htmlToDocumentModel, documentModelToHtml, plainTextToDocumentModel } from "../../features/documents/editor/core/model/serialization";
import { SelectionEngine } from "../../features/documents/editor/core/selection/selection-engine";
import { isSelectionCollapsed, getSelectedText } from "../../features/documents/editor/core/selection/position";
import { generateRunId } from "../../features/documents/editor/core/utils/id-generator";
import { TransactionEngine } from "../../features/documents/editor/core/transactions/transaction-engine";
import { HistoryManager } from "../../features/documents/editor/core/history/history-manager";
import { CommandRegistry } from "../../features/documents/editor/core/commands/command-registry";
import { registerEditorCommands } from "../../features/documents/editor/core/commands/editor-commands";
import { layoutEngine } from "../../features/documents/editor/core/layout/layout-engine";
import { DocumentLayout, PageLayout } from "../../features/documents/editor/core/layout/layout-types";
import { HitTester, CaretGeometry, SelectionPageRect } from "../../features/documents/editor/core/hit-testing/hit-tester";
import { TextInputController } from "../../features/documents/editor/core/input/text-input-controller";
import { CompositionManager } from "../../features/documents/editor/core/input/composition-manager";
import { KeyboardController } from "../../features/documents/editor/core/input/keyboard-controller";
import { PointerController } from "../../features/documents/editor/core/input/pointer-controller";
import { ClipboardService } from "../../features/documents/editor/core/clipboard/clipboard-service";
import { TypedEventBus } from "../../features/documents/editor/core/utils/event-bus";
import { CanvasPage } from "../../features/documents/editor/components/CanvasPage";
import { PdfExporter } from "../../features/documents/editor/core/export/pdf-exporter";
import { PrintService } from "../../features/documents/editor/core/export/print-service";
import { FontManager } from "../../features/documents/editor/core/fonts/font-manager";
import { fontMetrics } from "../../features/documents/editor/core/fonts/font-metrics-service";
import { useDevicePixelRatio } from "../../features/documents/editor/core/utils/use-device-pixel-ratio";
import { CentralRenderScheduler, RenderPriority } from "../../features/documents/editor/core/rendering/central-render-scheduler";
import { performanceMonitor, PerformanceStats } from "../../features/documents/editor/core/diagnostics/performance-monitor";
import { PageHeightIndex } from "../../features/documents/editor/core/layout/page-height-index";
import { streamingSearchEngine } from "../../features/documents/editor/core/search/streaming-search-engine";

export interface DocxEditorModalProps {
  open: boolean;
  onClose: () => void;
  fileName?: string;
  fileKey?: string;
  initialContent?: string;
  initialParagraphs?: string[];
  isSigned?: boolean;
  signInfo?: { signerName: string; certNumber: string; signedAt: string };
  onSaveSuccess?: (updatedName: string, updatedBlob?: Blob) => void;
}

function Btn({ children, cls = "", active = false, onClick, title }: {
  children: React.ReactNode; cls?: string; active?: boolean; onClick?: () => void; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`docx-ribbon-btn flex items-center justify-center rounded-[3px] ${active ? "bg-[#DCEBFA] text-[#0F6CBD]" : "hover:bg-[#EEF4FB]"} ${cls}`}>
      {children}
    </button>
  );
}

function Group({ children, label: _label, border = true }: {
  children: React.ReactNode; label?: React.ReactNode; border?: boolean;
}) {
  return (
    <div className={`docx-ribbon-group flex h-full shrink-0 items-center overflow-hidden ${border ? "border-r border-[#E2E8F0] px-2 mr-1" : "px-2"}`}>
      <div className="flex flex-col h-full min-h-0 justify-center overflow-hidden">{children}</div>
    </div>
  );
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const TARGET_A4_CONTENT_HEIGHT = 800;
const EMPTY_COLLABORATORS: any[] = [];
const EMPTY_FIND_HIGHLIGHTS: any[] = [];

const saveSelection = (containerEl: HTMLElement): number | null => {
  try {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.anchorNode) return null;
    if (!containerEl.contains(sel.anchorNode)) return null;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(containerEl);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  } catch (e) {
    return null;
  }
};

const restoreSelection = (containerEl: HTMLElement, caretOffset: number) => {
  try {
    const sel = window.getSelection();
    if (!sel) return;

    let currentOffset = 0;
    let targetNode: Node | null = null;
    let targetOffset = 0;

    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const textLen = node.textContent?.length || 0;
      if (currentOffset + textLen >= caretOffset) {
        targetNode = node;
        targetOffset = Math.max(0, caretOffset - currentOffset);
        break;
      }
      currentOffset += textLen;
    }

    if (!targetNode) {
      targetNode = containerEl.lastChild || containerEl;
      targetOffset = targetNode.textContent?.length || 0;
    }

    const range = document.createRange();
    if (targetNode.nodeType === Node.TEXT_NODE) {
      range.setStart(targetNode, Math.min(targetOffset, (targetNode as Text).length));
    } else {
      range.selectNodeContents(targetNode);
      range.collapse(false);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {
    // Fail-safe
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const estimateBlockHeight = (block: string): number => {
  if (/page-break-after\s*:\s*always/i.test(block)) return 99999;
  const temp = document.createElement('div');
  temp.innerHTML = block;

  if (temp.querySelector('table')) {
    const rows = temp.querySelectorAll('tr').length || 3;
    return rows * 34 + 20;
  }
  if (temp.querySelector('h1')) return 52;
  if (temp.querySelector('h2')) return 42;
  if (temp.querySelector('img')) return 220;
  if (temp.querySelector('hr')) return 24;

  const text = (temp.textContent || '').trim();
  if (!text) return 24;

  const lines = Math.max(1, Math.ceil(text.length / 50));
  return lines * 30 + 14;
};

const paginateDocumentHtml = (
  html: string,
  targetHeight = TARGET_A4_CONTENT_HEIGHT,
  contentWidth = 602
): string[] => {
  if (!html || !html.trim() || html.trim() === '<p><br></p>' || html.trim() === '<p><br/></p>') {
    return ['<p><br/></p>'];
  }

  // If html has explicit page breaks
  if (html.includes('page-break-after') || html.includes('docx-page-break')) {
    const rawPages = html.split(/<p[^>]*style="[^"]*page-break-after:\s*always[^"]*"[^>]*>.*?<\/p>|<div[^>]*class="[^"]*docx-page-break[^"]*"[^>]*>.*?<\/div>/gi);
    const validPages = rawPages.map(p => p.trim()).filter(Boolean);
    if (validPages.length > 0) return validPages;
  }

  const source = document.createElement('div');
  source.innerHTML = html;

  // Flatten direct children without modifying their innerHTML
  const blocks: string[] = [];
  Array.from(source.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) blocks.push(`<p style="margin: 0 0 10px 0; line-height: 1.8;">${escapeHtml(text)}</p>`);
    } else if (child instanceof HTMLElement) {
      blocks.push(child.outerHTML);
    }
  });

  if (!blocks.length) return ['<p><br/></p>'];

  const measureContainer = document.createElement('div');
  measureContainer.className = 'docx-page-editor';
  measureContainer.style.cssText = `
    position: fixed;
    visibility: hidden;
    pointer-events: none;
    left: -9999px;
    top: 0;
    width: ${contentWidth}px;
    font-family: "Times New Roman", Times, serif;
    font-size: 15px;
    line-height: 1.8;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
    word-break: break-word;
  `;
  document.body.appendChild(measureContainer);

  const pages: string[] = [];
  let currentPageBlocks: string[] = [];

  try {
    blocks.forEach((block) => {
      measureContainer.innerHTML = currentPageBlocks.join('') + block;
      const h = measureContainer.offsetHeight;

      if (h <= targetHeight || currentPageBlocks.length === 0) {
        currentPageBlocks.push(block);
      } else {
        pages.push(currentPageBlocks.join(''));
        currentPageBlocks = [block];
      }
    });

    if (currentPageBlocks.length > 0) {
      pages.push(currentPageBlocks.join(''));
    }
  } catch (e) {
    pages.push(html);
  } finally {
    measureContainer.remove();
  }

  return pages.length ? pages : [html];
};

// ===== RIBBON TABS (100% THEO OFFICEVKY) =====

function RibbonHome({ bold, ital, uline, strike, align, fontName, fontSize, exec, setAlign, handleFontChange, handleSizeChange, handleTextColor, handleHighlight, handleStyle, handlePaste, handleCut, handleCopy, setShowFind, findInputRef, setShowReplace, growFont, shrinkFont, handleTextCase, onAction }: any) {
  return (<>
    <Group label="Bảng tạm">
      <div className="flex flex-1 gap-1.5 items-center min-h-0">
        <Btn onClick={handlePaste} cls="flex-col w-[46px] h-full gap-0.5 justify-center" title="Dán">
          <Clipboard className="w-[30px] h-[30px] text-[#c99a3a]" strokeWidth={1.3} />
          <span className="text-[11.5px] text-[#333] leading-none">Dán</span>
        </Btn>
        <div className="flex flex-col gap-[3px]">
          <Btn onClick={handleCut} cls="w-[24px] h-[23px]" title="Cắt"><Scissors className="w-[13px] h-[13px] text-[#555]" strokeWidth={1.5} /></Btn>
          <Btn onClick={handleCopy} cls="w-[24px] h-[23px]" title="Sao chép"><Copy className="w-[13px] h-[13px] text-[#555]" strokeWidth={1.5} /></Btn>
          <Btn onClick={() => exec("removeFormat")} cls="w-[24px] h-[23px]" title="Xóa định dạng"><Paintbrush className="w-[13px] h-[13px] text-[#555]" strokeWidth={1.5} /></Btn>
        </div>
      </div>
    </Group>
    <Group label="Phông">
      <div className="flex items-center gap-[3px] mb-[6px]">
        <div className="docx-select-shell relative h-[26px] flex items-center border border-[#94A3B8] bg-white">
          <select value={fontName} onChange={handleFontChange} className="docx-native-select appearance-none bg-transparent pl-[7px] pr-[20px] text-[12.5px] text-[#1f1f1f] w-[124px] h-full focus:outline-none cursor-pointer">
            <option value="Aptos">Aptos</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Segoe UI">Segoe UI</option>
            <option value="Tahoma">Tahoma</option>
          </select>
          <ChevronDown className="w-[10px] h-[10px] text-[#666] absolute right-[4px] pointer-events-none" strokeWidth={2} />
        </div>
        <div className="docx-select-shell relative h-[26px] flex items-center border border-[#94A3B8] bg-white">
          <select value={fontSize} onChange={handleSizeChange} className="docx-native-select appearance-none bg-transparent pl-[5px] pr-[16px] text-[12.5px] text-[#1f1f1f] w-[48px] h-full focus:outline-none cursor-pointer">
            {FONT_SIZES.map((s: number) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <ChevronDown className="w-[10px] h-[10px] text-[#666] absolute right-[2px] pointer-events-none" strokeWidth={2} />
        </div>
        <Btn onClick={growFont} cls="w-[26px] h-[24px] relative" title="Tăng cỡ chữ">
          <span className="font-bold font-serif text-[14px]">A</span>
          <svg width="7" height="7" viewBox="0 0 8 8" className="absolute top-[2px] right-[1px]" fill="#0F6CBD"><polygon points="4,0 8,8 0,8" /></svg>
        </Btn>
        <Btn onClick={shrinkFont} cls="w-[26px] h-[24px] relative" title="Giảm cỡ chữ">
          <span className="font-bold font-serif text-[11px]">A</span>
          <svg width="7" height="7" viewBox="0 0 8 8" className="absolute top-[3px] right-[1px]" fill="#0F6CBD"><polygon points="4,8 8,0 0,0" /></svg>
        </Btn>
        <Btn onClick={() => onAction("font-default")} cls="w-[30px] h-[24px] text-[13px] font-serif font-medium" title="Phông chữ mặc định">Aa</Btn>
        <Btn onClick={() => exec("removeFormat")} cls="w-[26px] h-[24px]" title="Xóa định dạng"><Eraser className="w-[14px] h-[14px] text-[#555]" strokeWidth={1.5} /></Btn>
      </div>
      <div className="flex items-center gap-[2px]">
        <Btn active={bold} onClick={() => exec("bold")} cls="w-[26px] h-[26px] font-bold font-serif text-[14px]" title="Đậm">B</Btn>
        <Btn active={ital} onClick={() => exec("italic")} cls="w-[26px] h-[26px] italic font-serif text-[14px]" title="Nghiêng">I</Btn>
        <Btn active={uline} onClick={() => exec("underline")} cls="w-[26px] h-[26px]" title="Gạch chân"><span className="underline font-serif text-[14px]">U</span></Btn>
        <Btn active={strike} onClick={() => exec("strikeThrough")} cls="w-[26px] h-[26px] font-serif text-[12px] line-through" title="Gạch ngang">ab</Btn>
        <Btn onClick={() => exec("subscript")} cls="w-[26px] h-[26px] font-serif text-[11px]" title="Chỉ số dưới">x<sub>2</sub></Btn>
        <Btn onClick={() => exec("superscript")} cls="w-[26px] h-[26px] font-serif text-[11px]" title="Chỉ số trên">x<sup>2</sup></Btn>
        <div className="w-[1px] h-[18px] bg-[#e0e0e0] mx-[2px]" />
        <Btn onClick={handleTextColor} cls="w-[30px] h-[26px]" title="Màu chữ">
          <div className="flex flex-col items-center gap-[2px]">
            <span className="text-[#0F6CBD] font-serif font-bold text-[13px] leading-none">A</span>
            <div className="w-[14px] h-[2.5px] border-b-2 border-[#0F6CBD]" />
          </div>
        </Btn>
        <Btn onClick={handleHighlight} cls="w-[30px] h-[26px]" title="Tô sáng">
          <div className="flex flex-col items-center gap-[2px]">
            <span className="font-serif font-bold text-[12px] leading-none">ab</span>
            <div className="w-[14px] h-[3px] bg-[#FFE135] rounded-[1px]" />
          </div>
        </Btn>
        <Btn onClick={handleTextColor} cls="w-[30px] h-[26px]" title="Màu chữ">
          <div className="flex flex-col items-center gap-[2px]">
            <span className="font-serif font-bold text-[14px] leading-none">A</span>
            <div className="w-[14px] h-[3px] bg-[#E81123] rounded-[1px]" />
          </div>
        </Btn>
        <div className="w-[1px] h-[18px] bg-[#e0e0e0] mx-[2px]" />
        <Btn onClick={() => handleTextCase("upper")} cls="w-[30px] h-[26px]" title="CHỮ HOA"><span className="text-[11px] font-bold">AA</span></Btn>
        <Btn onClick={() => handleTextCase("lower")} cls="w-[30px] h-[26px]" title="chữ thường"><span className="text-[11px]">aa</span></Btn>
        <Btn onClick={() => handleTextCase("title")} cls="w-[34px] h-[26px]" title="Chữ Hoa Đầu"><span className="text-[9px] font-bold">Aa</span></Btn>
      </div>
    </Group>
    <Group label="Đoạn văn">
      <div className="flex items-center gap-[2px] mb-[6px]">
        <Btn onClick={() => exec("insertUnorderedList")} cls="w-[28px] h-[24px]" title="Danh sách"><List className="w-[15px] h-[15px] text-[#0F6CBD]" strokeWidth={1.5} /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} cls="w-[28px] h-[24px]" title="Danh sách số"><ListOrdered className="w-[15px] h-[15px]" strokeWidth={1.5} /></Btn>
        <Btn onClick={() => exec("formatBlock", "<blockquote>")} cls="w-[28px] h-[24px]" title="Trích dẫn">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <line x1="1" y1="3" x2="5" y2="3"/><line x1="6" y1="3" x2="15" y2="3"/>
            <line x1="3" y1="7" x2="5" y2="7"/><line x1="6" y1="7" x2="15" y2="7"/>
            <line x1="1" y1="11" x2="5" y2="11"/><line x1="6" y1="11" x2="15" y2="11"/>
          </svg>
        </Btn>
        <div className="w-[1px] h-[15px] bg-[#e0e0e0] mx-[1px]" />
        <Btn onClick={() => exec("outdent")} cls="w-[28px] h-[24px]" title="Giảm lề">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><polyline points="6,5 2,8 6,11"/></svg>
        </Btn>
        <Btn onClick={() => exec("indent")} cls="w-[28px] h-[24px]" title="Tăng lề">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="4" x2="7" y2="4"/><line x1="1" y1="8" x2="7" y2="8"/><line x1="1" y1="12" x2="7" y2="12"/><line x1="9" y1="4" x2="15" y2="4"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><polyline points="8,5 12,8 8,11"/></svg>
        </Btn>
        <div className="w-[1px] h-[15px] bg-[#e0e0e0] mx-[1px]" />
        <Btn onClick={() => onAction("show-format")} cls="w-[28px] h-[24px]" title="Căn đều"><div className="flex flex-col items-center leading-[9px] text-[8px] font-bold"><span>A</span><span>Z</span></div></Btn>
        <Btn onClick={() => onAction("show-format")} cls="w-[28px] h-[24px] font-serif font-bold text-[15px]" title="Hiện ký tự">¶</Btn>
      </div>
      <div className="flex items-center gap-[2px]">
        <Btn active={align === "left"} onClick={() => { exec("justifyLeft"); setAlign("left"); }} cls="w-[28px] h-[26px]" title="Căn trái"><AlignLeft className="w-[14px] h-[14px]" strokeWidth={1.5} /></Btn>
        <Btn active={align === "center"} onClick={() => { exec("justifyCenter"); setAlign("center"); }} cls="w-[28px] h-[26px]" title="Căn giữa"><AlignCenter className="w-[14px] h-[14px]" strokeWidth={1.5} /></Btn>
        <Btn active={align === "right"} onClick={() => { exec("justifyRight"); setAlign("right"); }} cls="w-[28px] h-[26px]" title="Căn phải"><AlignRight className="w-[14px] h-[14px]" strokeWidth={1.5} /></Btn>
        <Btn active={align === "justify"} onClick={() => { exec("justifyFull"); setAlign("justify"); }} cls="w-[28px] h-[26px]" title="Căn đều"><AlignJustify className="w-[14px] h-[14px]" strokeWidth={1.5} /></Btn>
        <div className="w-[1px] h-[18px] bg-[#e0e0e0] mx-[2px]" />
        <Btn onClick={() => exec("formatBlock", "<h1>")} cls="w-[28px] h-[26px]" title="Tiêu đề 1">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="5" y1="4" x2="14" y2="4"/><line x1="5" y1="8" x2="14" y2="8"/><line x1="5" y1="12" x2="14" y2="12"/><polyline points="3,6 1,4 3,2"/><polyline points="3,10 1,12 3,14"/></svg>
        </Btn>
        <Btn onClick={() => exec("insertHTML", "<br/>")} cls="w-[28px] h-[26px]" title="Ngắt dòng"><span className="text-[10px] font-bold">↩</span></Btn>
        <Btn onClick={() => exec("insertHTML", "<hr/>")} cls="w-[28px] h-[26px]" title="Đường kẻ ngang"><Minus className="w-[14px] h-[14px]" strokeWidth={1.5} /></Btn>
      </div>
    </Group>
    <Group label="Kiểu">
      <div className="docx-select-shell relative h-[28px] flex items-center border border-[#94A3B8] bg-white">
        <select
          defaultValue="p"
          onChange={(event) => handleStyle(event.target.value)}
          className="docx-native-select appearance-none bg-transparent pl-[8px] pr-[24px] text-[12.5px] text-[#1F2937] w-[142px] h-full focus:outline-none cursor-pointer"
        >
          <option value="p">Bình thường</option>
          <option value="h1">Tiêu đề 1</option>
          <option value="h2">Tiêu đề 2</option>
          <option value="blockquote">Trích dẫn</option>
        </select>
        <ChevronDown className="w-[12px] h-[12px] text-[#475569] absolute right-[6px] pointer-events-none" strokeWidth={2} />
      </div>
    </Group>
    <Group label="Đang chỉnh sửa">
      <div className="flex flex-col justify-center flex-1 gap-[2px] min-w-[90px]">
        <Btn onClick={() => { setShowFind((v: boolean) => !v); setTimeout(() => findInputRef.current?.focus(), 100); }} cls="h-[20px] px-2 gap-1.5 justify-start whitespace-nowrap w-full" title="Tìm (Ctrl+F)">
          <Search className="w-[12px] h-[12px] text-[#555] shrink-0" strokeWidth={1.5} /><span className="text-[11.5px] text-[#333]">Tìm</span>
        </Btn>
        <Btn onClick={() => { setShowFind(true); setShowReplace(true); }} cls="h-[20px] px-2 gap-1.5 justify-start whitespace-nowrap w-full" title="Thay thế (Ctrl+H)">
          <Type className="w-[12px] h-[12px] text-[#0F6CBD] shrink-0" strokeWidth={1.5} /><span className="text-[11.5px] text-[#333]">Thay thế</span>
        </Btn>
        <Btn onClick={() => exec("selectAll")} cls="h-[20px] px-2 gap-1.5 justify-start whitespace-nowrap w-full" title="Chọn tất cả (Ctrl+A)">
          <TextCursorInput className="w-[12px] h-[12px] text-[#555] shrink-0" strokeWidth={1.5} /><span className="text-[11.5px] text-[#333]">Chọn</span>
        </Btn>
      </div>
    </Group>
    <Group label="Thoại">
      <div className="flex flex-1 items-center justify-center">
        <Btn onClick={() => onAction("dictation")} cls="flex-col gap-1 w-[62px] flex-1" title="Đọc chính tả">
          <Mic className="w-7 h-7 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[11.5px] text-[#333] whitespace-nowrap">Đọc chính tả</span>
        </Btn>
      </div>
    </Group>
    <Group label="Bổ trợ">
      <div className="flex flex-1 items-center justify-center">
        <Btn onClick={() => onAction("home-addins")} cls="flex-col gap-1 w-[52px] flex-1" title="Bổ trợ">
          <LayoutGrid className="w-7 h-7 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[11.5px] text-[#333]">Bổ trợ</span>
        </Btn>
      </div>
    </Group>
    <Group label="Biên tập viên" border={false}>
      <div className="flex flex-1 items-center justify-center">
        <Btn onClick={() => onAction("home-editor")} cls="flex-col gap-1 w-[68px] flex-1" title="Biên tập viên">
          <div className="relative">
            <Edit3 className="w-7 h-7 text-[#0F6CBD]" strokeWidth={1.5} />
            <div className="w-[22px] h-[2px] bg-[#0F6CBD] absolute -bottom-1 -left-1 -rotate-[8deg] rounded-full" />
          </div>
          <span className="text-[11.5px] text-[#333] whitespace-nowrap">Biên tập viên</span>
        </Btn>
      </div>
    </Group>
  </>);
}

function RibbonFile({ handleSave, handleOpen, clearDocument, exportTxt, handleDownloadDocx, setShowSource, setShowShortcuts }: any) {
  return (<>
    <Group label="Tệp" border={false}>
      <div className="flex items-center gap-2 h-full py-2">
        <Btn onClick={handleSave} cls="flex-col w-[62px] h-full justify-center gap-1" title="Lưu (Ctrl+S)">
          <Save className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Lưu</span>
        </Btn>
        <Btn onClick={handleDownloadDocx} cls="flex-col w-[62px] h-full justify-center gap-1" title="Tải về file Nôm (.wnom)">
          <Download className="w-6 h-6 text-[#10B981]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Tải .wnom</span>
        </Btn>
        <Btn onClick={handleOpen} cls="flex-col w-[62px] h-full justify-center gap-1" title="Mở tệp">
          <FileUp className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Mở</span>
        </Btn>
        <Btn onClick={() => window.print()} cls="flex-col w-[62px] h-full justify-center gap-1" title="In (Ctrl+P)">
          <Printer className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">In</span>
        </Btn>
        <div className="w-[1px] h-[80%] bg-[#e5e5e5]" />
        <Btn onClick={exportTxt} cls="flex-col w-[62px] h-full justify-center gap-1" title="Xuất văn bản thường">
          <ScrollText className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Xuất TXT</span>
        </Btn>
        <Btn onClick={() => setShowSource(true)} cls="flex-col w-[62px] h-full justify-center gap-1" title="Xem mã nguồn HTML">
          <Code2 className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Mã nguồn</span>
        </Btn>
        <Btn onClick={() => setShowShortcuts(true)} cls="flex-col w-[62px] h-full justify-center gap-1" title="Phím tắt">
          <Keyboard className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Phím tắt</span>
        </Btn>
        <div className="w-[1px] h-[80%] bg-[#e5e5e5]" />
        <Btn onClick={clearDocument} cls="flex-col w-[62px] h-full justify-center gap-1" title="Tạo tài liệu mới">
          <FileText className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Mới</span>
        </Btn>
      </div>
    </Group>
  </>);
}

function RibbonInsert({ exec, setShowTablePicker, handleInsertImage, handleInsertLink, onAction }: any) {
  return (<>
    <Group label="Trang">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("insert-page")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Thêm trang mới / Ngắt trang (Ctrl+Enter)">
          <FilePlus2 className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Ngắt trang</span>
        </Btn>
      </div>
    </Group>
    <Group label="Bảng">
      <div className="flex items-center h-full"><Btn onClick={() => setShowTablePicker(true)} cls="flex-col w-[52px] h-full justify-center gap-1" title="Bảng">
        <LayoutGrid className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Bảng</span>
      </Btn></div>
    </Group>
    <Group label="Minh họa">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={handleInsertImage} cls="flex-col w-[52px] h-full justify-center gap-1" title="Hình ảnh">
          <Image className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Ảnh</span>
        </Btn>
        <Btn onClick={() => onAction("insert-chart")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Biểu đồ">
          <ChartNoAxesColumnIncreasing className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Biểu đồ</span>
        </Btn>
      </div>
    </Group>
    <Group label="Liên kết">
      <div className="flex items-center h-full"><Btn onClick={handleInsertLink} cls="flex-col w-[52px] h-full justify-center gap-1" title="Liên kết">
        <Link className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Liên kết</span>
      </Btn></div>
    </Group>
    <Group label="Văn bản">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("insert-date")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Ngày tháng">
          <Calendar className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Ngày</span>
        </Btn>
        <Btn onClick={() => onAction("insert-hr")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Đường kẻ ngang">
          <Minus className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Kẻ ngang</span>
        </Btn>
      </div>
    </Group>
    <Group label="Ký hiệu" border={false}>
      <div className="flex items-center h-full"><Btn onClick={() => onAction("insert-symbol")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Ký hiệu">
        <Sigma className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Ký hiệu</span>
      </Btn></div>
    </Group>
  </>);
}

function RibbonDraw({ onAction, drawMode }: any) {
  return (<>
    <Group label="Công cụ vẽ">
      <div className="flex items-center h-full gap-1">
        <Btn active={drawMode === "pen"} onClick={() => onAction("draw-pen")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Bút">
          <Pen className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Bút</span>
        </Btn>
        <Btn active={drawMode === "highlight"} onClick={() => onAction("draw-highlight")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Bút đánh dấu">
          <Highlighter className="w-6 h-6 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Đánh dấu</span>
        </Btn>
        <Btn onClick={() => onAction("draw-eraser")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Tẩy">
          <Eraser className="w-6 h-6 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Tẩy</span>
        </Btn>
      </div>
    </Group>
    <Group label="Chuyển đổi" border={false}>
      <div className="flex items-center h-full">
        <Btn onClick={() => onAction("draw-to-text")} cls="flex-col w-[70px] h-full justify-center gap-1 px-2" title="Ink to Text">
          <Type className="w-6 h-6 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333] text-center">Ink thành Text</span>
        </Btn>
        <div className="flex flex-col justify-center text-[11px] text-[#999] px-4 italic">
          <span>Vẽ bằng chuột hoặc</span>
          <span>bút cảm ứng trên canvas</span>
        </div>
      </div>
    </Group>
  </>);
}

function RibbonDesign({ onAction }: any) {
  return (<>
    <Group label="Chủ đề">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("design-theme")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chủ đề">
          <Palette className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Chủ đề</span>
        </Btn>
        <Btn onClick={() => onAction("design-colors")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Màu">
          <Diamond className="w-5 h-5 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Màu</span>
        </Btn>
        <Btn onClick={() => onAction("design-font")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Phông chữ">
          <Type className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Phông</span>
        </Btn>
      </div>
    </Group>
    <Group label="Nền trang">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("design-page-color")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Màu nền">
          <Palette className="w-6 h-6 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Màu nền</span>
        </Btn>
        <Btn onClick={() => onAction("design-watermark")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Thủy ấn">
          <Stamp className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Thủy ấn</span>
        </Btn>
        <Btn onClick={() => onAction("design-border")} cls="flex-col w-[60px] h-full justify-center gap-1" title="Viền trang">
          <LayoutGrid className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Viền trang</span>
        </Btn>
      </div>
    </Group>
    <Group label="Đoạn văn" border={false}>
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("design-spacing")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Khoảng cách">
          <ArrowDownUp className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Khoảng cách</span>
        </Btn>
        <div className="flex flex-col text-[11px] text-[#999] px-2 italic max-w-[160px]">
          <span>Áp dụng thiết kế và</span>
          <span>định dạng cho tài liệu</span>
        </div>
      </div>
    </Group>
  </>);
}

function RibbonLayout({ exec, onAction }: any) {
  return (<>
    <Group label="Thiết lập trang">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("layout-margin")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Lề">
          <Ruler className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Lề</span>
        </Btn>
        <Btn onClick={() => onAction("layout-orientation")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Hướng">
          <FileText className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Hướng</span>
        </Btn>
        <Btn onClick={() => onAction("layout-size")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Cỡ">
          <Maximize className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Cỡ</span>
        </Btn>
      </div>
    </Group>
    <Group label="Cột">
      <div className="flex items-center h-full"><Btn onClick={() => onAction("layout-columns")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Cột">
        <Columns className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Cột</span>
      </Btn></div>
    </Group>
    <Group label="Ngắt">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => exec("insertHTML", "<div style='page-break-after:always'></div>")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Ngắt trang">
          <FilePlus2 className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Ngắt trang</span>
        </Btn>
        <Btn onClick={() => onAction("layout-line-numbers")} cls="flex-col w-[60px] h-full justify-center gap-1" title="Số dòng">
          <Hash className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Số dòng</span>
        </Btn>
      </div>
    </Group>
    <Group label="Thụt lề" border={false}>
      <div className="flex items-center h-full gap-1">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-[#555]">Trái</span>
          <div className="flex gap-1">
            <Btn onClick={() => exec("outdent")} cls="w-[24px] h-[24px]" title="Giảm lề trái"><ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} /></Btn>
            <Btn onClick={() => exec("indent")} cls="w-[24px] h-[24px]" title="Tăng lề trái"><ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} /></Btn>
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5 ml-2">
          <span className="text-[10px] text-[#555]">Cách</span>
          <div className="flex gap-1">
            <Btn onClick={() => onAction("layout-spacing")} cls="w-[24px] h-[24px]" title="Khoảng cách đoạn"><ArrowDownUp className="w-3.5 h-3.5" strokeWidth={1.5} /></Btn>
          </div>
        </div>
      </div>
    </Group>
  </>);
}

function RibbonRef({ onAction }: any) {
  return (<>
    <Group label="Mục lục">
      <div className="flex items-center h-full"><Btn onClick={() => onAction("ref-toc")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Mục lục">
        <ListTree className="w-6 h-6 text-[#0F6CBD]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Mục lục</span>
      </Btn></div>
    </Group>
    <Group label="Chú thích cuối">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("ref-footnote")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chú thích cuối trang">
          <TextQuote className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Chú thích</span>
        </Btn>
        <Btn onClick={() => onAction("ref-endnote")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chú thích cuối tài liệu">
          <Quote className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Chú thích cuối</span>
        </Btn>
      </div>
    </Group>
    <Group label="Trích dẫn">
      <div className="flex items-center h-full"><Btn onClick={() => onAction("ref-citation")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Trích dẫn">
        <MessageSquarePlus className="w-5 h-5 text-[#c99a3a]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Trích dẫn</span>
      </Btn></div>
    </Group>
    <Group label="Chú thích">
      <div className="flex items-center h-full"><Btn onClick={() => onAction("ref-comment")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chú thích">
        <BookMarked className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Chú thích</span>
      </Btn></div>
    </Group>
    <Group label="Chỉ mục" border={false}>
      <div className="flex items-center h-full"><Btn onClick={() => onAction("ref-index")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chỉ mục">
        <TextCursorInput className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Chỉ mục</span>
      </Btn></div>
    </Group>
  </>);
}

function RibbonMail({ onAction }: any) {
  return (<>
    <Group label="Tạo">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("mail-envelope")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Phong bì">
        <Mail className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Phong bì</span>
        </Btn>
        <Btn onClick={() => onAction("mail-label")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Nhãn">
          <Tag className="w-5 h-5 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Nhãn</span>
        </Btn>
      </div>
    </Group>
    <Group label="Trộn thư">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("mail-merge")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Bắt đầu trộn thư">
        <Merge className="w-5 h-5 text-[#c99a3a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Trộn thư</span>
        </Btn>
        <Btn onClick={() => onAction("mail-recipient")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chọn người nhận">
          <Contact className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Người nhận</span>
        </Btn>
      </div>
    </Group>
    <Group label="Trường dữ liệu" border={false}>
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("mail-field")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Chèn trường dữ liệu">
          <Variable className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Trường dữ liệu</span>
        </Btn>
        <Btn onClick={() => onAction("mail-preview")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Xem kết quả">
          <Eye className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Xem kết quả</span>
        </Btn>
        <Btn onClick={() => onAction("mail-finish")} cls="flex-col w-[70px] h-full justify-center gap-1" title="Hoàn tất hợp nhất">
          <SpellCheck2 className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Hoàn tất</span>
        </Btn>
        <div className="flex flex-col text-[11px] text-[#999] px-2 italic max-w-[160px]">
          <span>Tính năng trộn thư</span>
          <span>yêu cầu dữ liệu từ tệp</span>
        </div>
      </div>
    </Group>
  </>);
}

function RibbonReview({ exec, editorRef, onAction }: any) {
  const [spellCount, setSpellCount] = useState(0);
  return (<>
    <Group label="Kiểm tra">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("review-spell")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Chính tả">
          <Check className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Chính tả</span>
        </Btn>
        <Btn onClick={() => onAction("review-thesaurus")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Từ đồng nghĩa">
          <BookOpen className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Từ đồng nghĩa</span>
        </Btn>
        <Btn onClick={() => { if (editorRef.current) setSpellCount(editorRef.current.innerText.trim().split(/\s+/).filter(Boolean).length); onAction("review-compare"); }} cls="flex-col w-[52px] h-full justify-center gap-1" title="Đếm từ">
          <span className="text-[14px] font-bold text-[#555]">123</span>
          <span className="text-[10px] text-[#333]">Đếm từ: {spellCount}</span>
        </Btn>
      </div>
    </Group>
    <Group label="Ngôn ngữ">
      <div className="flex items-center h-full"><Btn onClick={() => onAction("review-language")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Ngôn ngữ">
        <Languages className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
        <span className="text-[10px] text-[#333]">Ngôn ngữ</span>
      </Btn></div>
    </Group>
    <Group label="Bình luận">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("review-comment")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Bình luận mới">
          <MessageSquarePlus className="w-5 h-5 text-[#c99a3a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Bình luận</span>
        </Btn>
        <Btn onClick={() => onAction("review-delete-comments")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Xóa bình luận">
          <Trash className="w-5 h-5 text-[#e81123]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#e81123]">Xóa</span>
        </Btn>
      </div>
    </Group>
    <Group label="Theo dõi" border={false}>
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("review-track")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Theo dõi thay đổi">
          <Eye className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Theo dõi</span>
        </Btn>
        <Btn onClick={() => onAction("review-compare")} cls="flex-col w-[52px] h-full justify-center gap-1" title="So sánh">
          <ArrowLeftRight className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">So sánh</span>
        </Btn>
        <Btn onClick={() => onAction("review-protect")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Bảo vệ">
          <ShieldCheck className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Bảo vệ</span>
        </Btn>
      </div>
    </Group>
  </>);
}

function RibbonView({ zoom, setZoom, onAction }: any) {
  return (<>
    <Group label="Chế độ xem">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("view-print")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Bố cục in">
          <FileText className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Bố cục in</span>
        </Btn>
        <Btn onClick={() => onAction("view-reading")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Đọc">
          <BookOpen className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Đọc</span>
        </Btn>
        <Btn onClick={() => onAction("view-web")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Web">
          <Globe className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Web</span>
        </Btn>
        <Btn onClick={() => onAction("view-outline")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Dàn bài">
          <List className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Dàn bài</span>
        </Btn>
      </div>
    </Group>
    <Group label="Hiển thị">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("view-ruler")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Thước">
          <Ruler className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Thước</span>
        </Btn>
        <Btn onClick={() => onAction("view-grid")} cls="flex-col w-[52px] h-full justify-center gap-1" title="Lưới">
          <Grid2X2 className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Lưới</span>
        </Btn>
        <Btn onClick={() => onAction("view-navigation")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Ngăn dẫn hướng">
          <PanelLeftOpen className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Ngăn dẫn</span>
        </Btn>
      </div>
    </Group>
    <Group label="Thu phóng" border={false}>
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => setZoom((v: number) => Math.max(10, v - 10))} cls="w-[26px] h-[26px]" title="Thu nhỏ (-10%)">
          <ZoomOut className="w-4 h-4" strokeWidth={1.5} />
        </Btn>
        <span className="text-[12px] font-medium w-[44px] text-center">{zoom}%</span>
        <Btn onClick={() => setZoom((v: number) => Math.min(500, v + 10))} cls="w-[26px] h-[26px]" title="Phóng to (+10%)">
          <ZoomIn className="w-4 h-4" strokeWidth={1.5} />
        </Btn>
        <Btn onClick={() => setZoom(100)} cls="w-[36px] h-[26px] text-[10px]" title="100%">
          100%
        </Btn>
        <Btn onClick={() => setZoom(200)} cls="w-[36px] h-[26px] text-[10px]" title="200%">
          200%
        </Btn>
        <Btn onClick={() => setZoom(500)} cls="w-[36px] h-[26px] text-[10px] font-bold text-[#0F6CBD]" title="500% (Tối đa)">
          500%
        </Btn>
        <Btn onClick={() => setZoom(50)} cls="w-[36px] h-[26px] text-[10px]" title="50%">
          50%
        </Btn>
        <div className="flex flex-col text-[11px] text-[#999] ml-2 italic max-w-[120px]">
          <span>Thu phóng</span>
          <span>tối đa 500%</span>
        </div>
      </div>
    </Group>
  </>);
}

function RibbonHelp({ onAction }: any) {
  return (<>
    <Group label="Trợ giúp">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("help-shortcuts")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Trợ giúp">
          <CircleHelp className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Trợ giúp</span>
        </Btn>
        <Btn onClick={() => onAction("help-support")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Hỗ trợ">
          <MessageSquare className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Hỗ trợ</span>
        </Btn>
        <Btn onClick={() => onAction("help-tips")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Mẹo">
          <Lightbulb className="w-5 h-5 text-[#c94f2a]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Mẹo</span>
        </Btn>
      </div>
    </Group>
    <Group label="Cộng đồng">
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("help-community")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Diễn đàn">
          <Users className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Diễn đàn</span>
        </Btn>
        <Btn onClick={() => onAction("help-report")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Báo lỗi">
          <Bug className="w-5 h-5 text-[#e81123]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Báo lỗi</span>
        </Btn>
      </div>
    </Group>
    <Group label="Thông tin" border={false}>
      <div className="flex items-center h-full gap-1">
        <Btn onClick={() => onAction("help-about")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Giới thiệu">
          <CircleHelp className="w-5 h-5 text-[#555]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Giới thiệu</span>
        </Btn>
        <Btn onClick={() => onAction("help-update")} cls="flex-col w-[56px] h-full justify-center gap-1" title="Cập nhật">
          <RefreshCw className="w-5 h-5 text-[#0F6CBD]" strokeWidth={1.5} />
          <span className="text-[10px] text-[#333]">Cập nhật</span>
        </Btn>
        <div className="flex flex-col text-[11px] text-[#999] ml-2 max-w-[180px]">
          <span className="font-semibold text-[#333]">Văn Nôm</span>
          <span>Phiên bản 1.2.0 vNôm</span>
          <span>© 2026 kiyodev</span>
        </div>
      </div>
    </Group>
  </>);
}

// ===== MAIN DOCX EDITOR MODAL (100% VERBATIM OFFICEVKY) =====

export const DocxEditorModal: React.FC<DocxEditorModalProps> = ({
  open,
  onClose,
  fileName = "Van_ban_moi.wnom",
  fileKey,
  initialContent,
  initialParagraphs,
  onSaveSuccess,
}) => {
  const [activeTab, setActiveTab] = useState("home");
  const [bold, setBold] = useState(false);
  const [ital, setItal] = useState(false);
  const [uline, setUline] = useState(false);
  const [strike, setStrike] = useState(false);
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("transparent");
  const [align, setAlign] = useState("left");
  const [zoom, setZoom] = useState(100);
  const [words, setWords] = useState(0);
  const [fontName, setFontName] = useState("Times New Roman");
  const [fontSize, setFontSize] = useState(14);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<any>(null);
  const alignRef = useRef('left');
  const pageIdRef = useRef(1);

  // Canvas Document Engine Core Instances
  const eventBus = useMemo(() => new TypedEventBus(), []);
  const docModelRef = useRef<DocumentModel>(new DocumentModel());
  const selectionEngine = useMemo(() => new SelectionEngine(eventBus), [eventBus]);
  const clientId = useMemo(() => `client-${Math.random().toString(36).substring(2, 9)}`, []);
  const transactionEngine = useMemo(() => new TransactionEngine(docModelRef.current, clientId), [clientId]);
  const historyManager = useMemo(() => new HistoryManager(), []);
  const commandRegistry = useMemo(() => new CommandRegistry(), []);
  const compositionManager = useMemo(() => new CompositionManager(), []);
  const hiddenInputRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<CaretGeometry | null>(null);
  const optimisticOverlayRef = useRef<HTMLDivElement | null>(null);
  const optimisticTextRef = useRef("");

  const keyboardController = useMemo(
    () => new KeyboardController(docModelRef.current, selectionEngine, commandRegistry, () => layoutRef.current, compositionManager),
    [commandRegistry, selectionEngine, compositionManager]
  );
  const textInputController = useMemo(
    () => new TextInputController(commandRegistry, compositionManager, selectionEngine, docModelRef.current, keyboardController),
    [commandRegistry, compositionManager, selectionEngine, keyboardController]
  );
  // The pointer controller needs the newest calculated layout when turning a
  // click on a canvas into a document position.  A ref avoids closing over the
  // initial (empty) layout while keeping the controller instance stable.
  const [initialLayout] = useState(() => layoutEngine.layoutDocument(docModelRef.current));
  const layoutRef = useRef<DocumentLayout>(initialLayout);
  const pointerController = useMemo(
    () => new PointerController(docModelRef.current, selectionEngine, () => layoutRef.current, commandRegistry),
    [selectionEngine, commandRegistry]
  );
  const clipboardService = useMemo(
    () => new ClipboardService(docModelRef.current, selectionEngine, commandRegistry),
    [selectionEngine, commandRegistry]
  );
  const dpr = useDevicePixelRatio();

  const [layout, setLayout] = useState<DocumentLayout>(() => layoutRef.current);
  const [selectionRects, setSelectionRects] = useState<SelectionPageRect[]>([]);
  const [caret, setCaret] = useState<CaretGeometry | null>(null);
  const [isCaretBlinkingVisible, setIsCaretBlinkingVisible] = useState(true);

  const [chars, setChars] = useState(0);
  const [paras, setParas] = useState(0);
  const [lines, setLines] = useState(0);
  const [selInfo, setSelInfo] = useState("");
  const [fontSizeVal, setFontSizeVal] = useState(14);
  const [lineHeight, setLineHeight] = useState(1.0);
  const [darkMode, setDarkMode] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [docName, setDocName] = useState(fileName.replace(/\.(wnom|docx?)$/i, ""));
  const [editingName, setEditingName] = useState(false);
  const [notice, setNotice] = useState("");
  const [pagePadding, setPagePadding] = useState(96);
  const [landscape, setLandscape] = useState(false);
  const [paperSize, setPaperSize] = useState<"A4" | "A5">("A4");

  const portraitPage = paperSize === "A5" ? { width: 559, height: 794 } : { width: 794, height: 1123 };
  const pageWidth = landscape ? portraitPage.height : portraitPage.width;
  const pageHeight = landscape ? portraitPage.width : portraitPage.height;

  const [pageColumns, setPageColumns] = useState(1);
  const [pageBackground, setPageBackground] = useState("#FFFFFF");
  const [pageBorder, setPageBorder] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(false);
  const [drawMode, setDrawMode] = useState<"pen" | "highlight" | null>(null);
  const [trackChanges, setTrackChanges] = useState(false);
  const [protectedDocument, setProtectedDocument] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [showRuler, setShowRuler] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [mailMergePreview, setMailMergePreview] = useState(false);
  const noticeTimerRef = useRef<number | null>(null);
  const mailMergeSourceRef = useRef("");
  const hasInitializedRef = useRef(false);
  const lastFindIndexRef = useRef<number>(0);
  const lastFindQueryRef = useRef<string>("");

  const [selectedImgEl, setSelectedImgEl] = useState<HTMLImageElement | null>(null);
  const [imgRect, setImgRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const draggedImgRef = useRef<HTMLImageElement | null>(null);

  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [renderedPageStart, setRenderedPageStart] = useState(0);
  const [renderedPageEnd, setRenderedPageEnd] = useState(1);
  const renderedPageRangeRef = useRef({ start: 0, end: 1 });
  const PAGE_RENDER_OVERSCAN = 2;

  const [showPerfHud, setShowPerfHud] = useState(false);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);

  useEffect(() => {
    if (!showPerfHud) {
      performanceMonitor.setEnabled(false);
      return;
    }
    performanceMonitor.setEnabled(true);
    return performanceMonitor.subscribe((stats) => {
      setPerfStats(stats);
    });
  }, [showPerfHud]);

  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });

  const updateTabIndicator = useCallback(() => {
    const btn = tabButtonRefs.current[activeTab];
    if (btn) {
      const left = btn.offsetLeft + 8;
      const width = Math.max(0, btn.offsetWidth - 16);
      setTabIndicator({ left, width, visible: true });
    }
  }, [activeTab]);

  const updateSelectedImgRect = useCallback(() => {
    // Canvas implementation of image handling logic
    setImgRect(null);
  }, []);

  const getPageEditors = useCallback(() => (
    Array.from(editorRef.current?.querySelectorAll<HTMLElement>('.docx-page') || [])
  ), []);

  const updateRenderedPageWindow = useCallback(() => {
    const container = docRef.current;
    const stack = editorRef.current;
    const currentLayout = layoutRef.current || layout;
    const pageIndexTree = currentLayout.pageHeightIndex || layoutEngine.pageHeightIndex;
    const pageCount = currentLayout.pageCount || pageIndexTree.getPageCount();
    if (!container || !stack || !pageCount) return;

    const scale = zoom / 100;
    const scrollMetrics = pageIndexTree.getVirtualScrollMetrics(scale);
    const scrollRatio = scrollMetrics.scrollRatio;

    const containerRect = container.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    const stackTop = container.scrollTop + stackRect.top - containerRect.top;
    const physicalViewportTop = Math.max(0, container.scrollTop - stackTop);
    const physicalViewportBottom = physicalViewportTop + container.clientHeight;

    const virtualViewportTop = pageIndexTree.physicalToVirtualScrollY(physicalViewportTop, scrollRatio);
    const virtualViewportBottom = pageIndexTree.physicalToVirtualScrollY(physicalViewportBottom, scrollRatio);

    const firstVisiblePage = pageIndexTree.getPageIndexAtOffset(virtualViewportTop / scale);
    const lastVisiblePage = pageIndexTree.getPageIndexAtOffset(virtualViewportBottom / scale);

    const nextStart = Math.max(0, firstVisiblePage - PAGE_RENDER_OVERSCAN);
    const nextEnd = Math.min(pageCount, lastVisiblePage + PAGE_RENDER_OVERSCAN + 1);

    // Evict far pages from cache to maintain bounded RAM
    layoutEngine.pageCache.evictFarPages(nextStart, nextEnd, 8);
    performanceMonitor.updatePageMetrics(nextEnd - nextStart, pageCount, layoutEngine.pageCache.size);

    currentPageRef.current = firstVisiblePage + 1;
    setCurrentPage(firstVisiblePage + 1);
    renderedPageRangeRef.current = { start: nextStart, end: nextEnd };
    setRenderedPageStart((previous) => previous === nextStart ? previous : nextStart);
    setRenderedPageEnd((previous) => previous === nextEnd ? previous : nextEnd);
  }, [layout, zoom]);

  const jumpToPage = useCallback((targetPageNum: number) => {
    const currentLayout = layoutRef.current || layout;
    const pageIndexTree = currentLayout.pageHeightIndex || layoutEngine.pageHeightIndex;
    const pageIdx = Math.max(0, Math.min(pageIndexTree.getPageCount() - 1, targetPageNum - 1));
    const scale = zoom / 100;
    const scrollMetrics = pageIndexTree.getVirtualScrollMetrics(scale);
    const virtualY = pageIndexTree.getPageOffset(pageIdx) * scale;
    const physicalY = pageIndexTree.virtualToPhysicalScrollY(virtualY, scrollMetrics.scrollRatio);
    if (docRef.current) {
      docRef.current.scrollTop = physicalY;
    }
  }, [layout, zoom]);

  useEffect(() => {
    const currentLayout = layoutRef.current || layout;
    const pageIndexTree = currentLayout.pageHeightIndex || layoutEngine.pageHeightIndex;
    const pageCount = currentLayout.pageCount || pageIndexTree.getPageCount();
    setRenderedPageStart((previous) => Math.min(previous, Math.max(0, pageCount - 1)));
    setRenderedPageEnd((previous) => Math.max(1, Math.min(previous, pageCount)));
    renderedPageRangeRef.current = {
      start: Math.min(renderedPageRangeRef.current.start, Math.max(0, pageCount - 1)),
      end: Math.max(1, Math.min(renderedPageRangeRef.current.end, pageCount)),
    };
    setCurrentPage((previous) => {
      const finalP = Math.max(1, Math.min(previous, Math.max(1, pageCount)));
      currentPageRef.current = finalP;
      return finalP;
    });
    const frame = window.requestAnimationFrame(updateRenderedPageWindow);
    return () => window.cancelAnimationFrame(frame);
  }, [layout, updateRenderedPageWindow]);

  useEffect(() => {
    caretRef.current = caret;
  }, [caret]);

  useEffect(() => {
    const sel = selectionEngine.getSelection();
    if (!sel) return;
    setSelectionRects(HitTester.getSelectionRectangles(sel, layoutRef.current, docModelRef.current));
  }, [renderedPageStart, renderedPageEnd, selectionEngine]);

  const selectionRectsByPage = useMemo(() => {
    const grouped = new Map<number, SelectionPageRect[]>();
    for (const rect of selectionRects) {
      const pageRects = grouped.get(rect.pageIndex);
      if (pageRects) pageRects.push(rect);
      else grouped.set(rect.pageIndex, [rect]);
    }
    return grouped;
  }, [selectionRects]);

  useEffect(() => {
    updateSelectedImgRect();
  }, [selectedImgEl, zoom, updateSelectedImgRect]);

  // Keep caret repaint cheap on long documents. Blinking through React state
  // rerenders the whole modal on every tick, which is very noticeable on large
  // DOCX files while typing or dragging a selection.
  useEffect(() => {
    setIsCaretBlinkingVisible(true);
  }, [caret]);

  // Attach offscreen hidden input
  useEffect(() => {
    if (hiddenInputRef.current) {
      textInputController.attach(hiddenInputRef.current);
    }
  }, [textInputController]);

  const isRelayoutingRef = useRef(false);
  const wordCountTimerRef = useRef<number | null>(null);
  const selectionFrameRef = useRef<number | null>(null);
  const relayoutFrameRef = useRef<number | null>(null);
  const localDraftTimerRef = useRef<number | null>(null);
  const lastToolbarSignatureRef = useRef("");

  const clearOptimisticOverlay = useCallback(() => {
    optimisticTextRef.current = "";
    const overlay = optimisticOverlayRef.current;
    if (!overlay) return;
    overlay.textContent = "";
    overlay.style.display = "none";
  }, []);

  const showOptimisticText = useCallback((_text: string) => {
    // Disabled: Direct native Canvas rendering is instantaneous (0.01ms) and completely avoids
    // any DOM overlay positioning drift or rogue text rendering in the top-left corner.
    clearOptimisticOverlay();
  }, [clearOptimisticOverlay]);

  const scheduleLocalDraftSave = useCallback(() => {
    if (!fileKey) return;
    if (localDraftTimerRef.current !== null) {
      window.clearTimeout(localDraftTimerRef.current);
    }
    localDraftTimerRef.current = window.setTimeout(() => {
      localDraftTimerRef.current = null;
      try {
        const blocksCount = docModelRef.current.blocks.length;
        if (blocksCount > 500) {
          const dirtyBlocks = Array.from(docModelRef.current.dirtyBlockIds)
            .map(id => docModelRef.current.getBlockById(id))
            .filter(Boolean);
          localStorage.setItem(`doc_draft_${fileKey}`, JSON.stringify({
            savedAt: new Date().toISOString(),
            name: docName,
            isIncremental: true,
            totalBlocks: blocksCount,
            dirtyBlocks,
          }));
          docModelRef.current.clearDirty();
        } else {
          localStorage.setItem(`doc_draft_${fileKey}`, JSON.stringify({
            savedAt: new Date().toISOString(),
            name: docName,
            data: docModelRef.current.data,
          }));
        }
      } catch {
        // Draft autosave is best-effort only; editing must never block on it.
      }
    }, 400);
  }, [docName, fileKey]);

  useEffect(() => {
    textInputController.setOptimisticTextHandler(null);
    return () => textInputController.setOptimisticTextHandler(null);
  }, [textInputController]);

  const activeTableInfo = useMemo(() => {
    const sel = selectionEngine.getSelection();
    if (!sel) return null;
    const loc = docModelRef.current.getBlockLocation(sel.focus.blockId);
    if (!loc || !loc.table) return null;
    return {
      table: loc.table,
      cell: loc.cell,
    };
  }, [selectionEngine, selectionRects, caret]);

  const performRelayout = useCallback(() => {
    const startMs = performance.now();
    performanceMonitor.recordInputStart();
    clearOptimisticOverlay();
    isRelayoutingRef.current = true;
    textInputController.setDocument(docModelRef.current);
    keyboardController.setDocument(docModelRef.current);
    pointerController.setDocument(docModelRef.current);
    clipboardService.setDocument(docModelRef.current);

    // Scroll Anchoring: Capture current visible state before layout
    const container = docRef.current;
    let anchorVisiblePage = 0;
    let anchorOffsetInPage = 0;
    const oldIndex = layoutRef.current.pageHeightIndex || layoutEngine.pageHeightIndex;
    const currentScale = zoom / 100;
    if (container) {
      const scrollMetrics = oldIndex.getVirtualScrollMetrics(currentScale);
      const virtualScrollY = oldIndex.physicalToVirtualScrollY(container.scrollTop, scrollMetrics.scrollRatio);
      anchorVisiblePage = oldIndex.getPageIndexAtOffset(virtualScrollY / currentScale);
      anchorOffsetInPage = virtualScrollY - (oldIndex.getPageOffset(anchorVisiblePage) * currentScale);
    }

    const newLayout = layoutEngine.layoutDocument(docModelRef.current);
    layoutRef.current = newLayout;
    setLayout(newLayout);
    const selBeforeLog = selectionEngine.getSelection();
    if (typeof window !== 'undefined' && (window as any).__debugEditorLogs) {
      console.log(`[LAYOUT]\n  layoutVersion = ${newLayout.pages[0]?.version || 1}\n  dirtyBlocks = [${Array.from(docModelRef.current.dirtyBlockIds).join(', ')}]\n  caretOffset = ${selBeforeLog?.focus?.offset ?? 'N/A'}`);
    }
    const totalP = newLayout.pageCount || (newLayout.pageHeightIndex ? newLayout.pageHeightIndex.getPageCount() : newLayout.pages.length);
    setTotalPages(totalP);

    // Scroll Anchoring: Preserve reading position if page heights above changed
    if (container && anchorVisiblePage > 0) {
      const newIndex = newLayout.pageHeightIndex || layoutEngine.pageHeightIndex;
      const newScrollMetrics = newIndex.getVirtualScrollMetrics(currentScale);
      const newVirtualY = (newIndex.getPageOffset(anchorVisiblePage) * currentScale) + anchorOffsetInPage;
      const targetPhysicalY = newIndex.virtualToPhysicalScrollY(newVirtualY, newScrollMetrics.scrollRatio);
      if (Math.abs(container.scrollTop - targetPhysicalY) > 5) {
        container.scrollTop = targetPhysicalY;
      }
    }

    const sel = selectionEngine.getSelection();
    if (sel) {
      const rects = HitTester.getSelectionRectangles(sel, newLayout, docModelRef.current);
      setSelectionRects(rects);
      const caretGeom = HitTester.getCaretGeometry(sel.focus, newLayout, docModelRef.current);
      if (caretGeom) {
        setCaret(caretGeom);
      }

      // Auto-scroll to keep caret comfortably in view with virtual coordinate scaling
      if (caretGeom && container) {
        const stack = editorRef.current;
        const pageTree = newLayout.pageHeightIndex || layoutEngine.pageHeightIndex;
        const scrollMetrics = pageTree.getVirtualScrollMetrics(currentScale);
        const scrollRatio = scrollMetrics.scrollRatio;

        const containerRect = container.getBoundingClientRect();
        const stackRect = stack ? stack.getBoundingClientRect() : containerRect;
        const stackRelativeTop = stackRect.top - containerRect.top + container.scrollTop;

        const virtualCaretTop = (pageTree.getPageOffset(caretGeom.pageIndex) * currentScale) + (caretGeom.y * currentScale);
        const physicalCaretTop = stackRelativeTop + (virtualCaretTop / scrollRatio);
        const caretHeight = (caretGeom.height || 20) * currentScale;
        const physicalCaretBottom = physicalCaretTop + caretHeight;

        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        const margin = 40;
        const scrollAhead = Math.max(80, caretHeight * 3);

        if (physicalCaretBottom > viewBottom - margin) {
          container.scrollTop = physicalCaretBottom - container.clientHeight + margin + scrollAhead;
        } else if (physicalCaretTop < viewTop + margin) {
          container.scrollTop = Math.max(0, physicalCaretTop - margin - scrollAhead);
        }
      }
    } else {
      setSelectionRects([]);
      setCaret(null);
    }

    if (typeof window !== 'undefined') {
      (window as any).__editorDebug = {
        layout: newLayout,
        doc: docModelRef.current,
        caret: sel ? HitTester.getCaretGeometry(sel.focus, newLayout, docModelRef.current) : null,
        selectionEngine,
        commandRegistry,
        triggerRelayout,
        performRelayout,
        HitTester,
      };
    }

    // Sync toolbar formatting state (guarded to avoid unneeded React component tree re-renders)
    const marks = selectionEngine.getActiveMarks(docModelRef.current);
    const newBold = Boolean(marks.bold);
    setBold((prev) => (prev !== newBold ? newBold : prev));
    const newItal = Boolean(marks.italic);
    setItal((prev) => (prev !== newItal ? newItal : prev));
    const newUline = Boolean(marks.underline);
    setUline((prev) => (prev !== newUline ? newUline : prev));
    const newStrike = Boolean(marks.strike);
    setStrike((prev) => (prev !== newStrike ? newStrike : prev));
    if (marks.fontFamily) {
      const newFont = marks.fontFamily;
      setFontName((prev) => (prev !== newFont ? newFont : prev));
    }
    if (marks.fontSize) {
      const newSize = marks.fontSize;
      setFontSizeVal((prev) => (prev !== newSize ? newSize : prev));
    }
    if (marks.foregroundColor) {
      const newColor = marks.foregroundColor;
      setTextColor((prev) => (prev !== newColor ? newColor : prev));
    }
    if (marks.backgroundColor) {
      const newBg = marks.backgroundColor;
      setHighlightColor((prev) => (prev !== newBg ? newBg : prev));
    }

    const style = selectionEngine.getActiveParagraphStyle(docModelRef.current);
    if (style.alignment) {
      const newAlign = style.alignment;
      setAlign((prev) => (prev !== newAlign ? newAlign : prev));
      alignRef.current = style.alignment;
    }

    // Debounced status bar statistics (run after typing pauses)
    if (wordCountTimerRef.current) window.clearTimeout(wordCountTimerRef.current);
    wordCountTimerRef.current = window.setTimeout(() => {
      let totalWords = 0;
      let totalChars = 0;
      let totalParas = 0;
      const blks = docModelRef.current.blocks;
      const count = Math.min(blks.length, 1000); // Sample first 1000 blocks for speed on massive docs
      for (let i = 0; i < count; i++) {
        const block = blks[i];
        if ('runs' in block && Array.isArray(block.runs)) {
          totalParas++;
          const text = docModelRef.current.getBlockText(block);
          totalChars += text.length;
          const w = text.trim().split(/\s+/).filter(Boolean);
          totalWords += w.length;
        }
      }
      setWords(totalWords);
      setChars(totalChars);
      setParas(totalParas);
      setLines(newLayout.pages.length * 30);
    }, 250);

    performanceMonitor.recordLayoutDuration(performance.now() - startMs);
    performanceMonitor.recordInputEnd();
    isRelayoutingRef.current = false;
    scheduleLocalDraftSave();
  }, [selectionEngine, textInputController, keyboardController, pointerController, clipboardService, clearOptimisticOverlay, scheduleLocalDraftSave, zoom]);

  const renderScheduler = useMemo(
    () => new CentralRenderScheduler((pages, isCaretOnly) => {
      if (isCaretOnly) {
        const sel = selectionEngine.getSelection();
        if (sel) {
          const caretGeom = HitTester.getCaretGeometry(sel.focus, layoutRef.current, docModelRef.current);
          setCaret(caretGeom);
        }
      } else {
        performRelayout();
      }
    }),
    [selectionEngine, performRelayout]
  );

  const triggerRelayout = useCallback(() => {
    renderScheduler.schedulePage(0);
  }, [renderScheduler]);

  useEffect(() => () => renderScheduler.cancel(), [renderScheduler]);

  // Re-layout and re-render automatically when document fonts finish loading
  useEffect(() => {
    return FontManager.getInstance().onFontChange(() => {
      triggerRelayout();
    });
  }, [triggerRelayout]);

  // Register commands
  useEffect(() => {
    registerEditorCommands(
      commandRegistry,
      docModelRef.current,
      selectionEngine,
      transactionEngine,
      historyManager,
      triggerRelayout
    );
  }, [commandRegistry, selectionEngine, transactionEngine, historyManager, triggerRelayout]);

  // Subscribe to selection change event
  useEffect(() => {
    return eventBus.on('selectionChanged', () => {
      if (isRelayoutingRef.current || relayoutFrameRef.current !== null) return;
      const selection = selectionEngine.getSelection();
      if (selection) {
        const rects = HitTester.getSelectionRectangles(selection, layoutRef.current, docModelRef.current);
        setSelectionRects(rects);
        const caretGeom = HitTester.getCaretGeometry(selection.focus, layoutRef.current, docModelRef.current);
        setCaret(caretGeom);
      } else {
        setSelectionRects([]);
        setCaret(null);
      }

        const marks = selectionEngine.getActiveMarks(docModelRef.current);
        const style = selectionEngine.getActiveParagraphStyle(docModelRef.current);
        const toolbarSignature = [
          Boolean(marks.bold),
          Boolean(marks.italic),
          Boolean(marks.underline),
          Boolean(marks.strike),
          marks.fontFamily || '',
          marks.fontSize || '',
          marks.foregroundColor || '',
          marks.backgroundColor || '',
          style.alignment || '',
        ].join('|');

        if (toolbarSignature !== lastToolbarSignatureRef.current) {
          lastToolbarSignatureRef.current = toolbarSignature;
          setBold(Boolean(marks.bold));
          setItal(Boolean(marks.italic));
          setUline(Boolean(marks.underline));
          setStrike(Boolean(marks.strike));
          if (marks.fontFamily) setFontName(marks.fontFamily);
          if (marks.fontSize) setFontSizeVal(marks.fontSize);
          if (marks.foregroundColor) setTextColor(marks.foregroundColor);
          if (marks.backgroundColor) setHighlightColor(marks.backgroundColor);
          if (style.alignment) {
            setAlign(style.alignment);
            alignRef.current = style.alignment;
          }
        }
      });
  }, [eventBus, selectionEngine]);

  useEffect(() => () => {
    if (selectionFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionFrameRef.current);
      selectionFrameRef.current = null;
    }
    if (relayoutFrameRef.current !== null) {
      window.cancelAnimationFrame(relayoutFrameRef.current);
      relayoutFrameRef.current = null;
    }
    if (localDraftTimerRef.current !== null) {
      window.clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
  }, []);

  // Sync settings with document model
  const lastSettingsRef = useRef({ pageSize: '', orientation: '', margins: -1, pageColor: '' });
  useEffect(() => {
    const curSize = paperSize === 'A5' ? 'A5' : 'A4';
    const curOrient = landscape ? 'landscape' : 'portrait';
    const last = lastSettingsRef.current;
    if (
      last.pageSize === curSize &&
      last.orientation === curOrient &&
      last.margins === pagePadding &&
      last.pageColor === pageBackground
    ) {
      return;
    }
    lastSettingsRef.current = {
      pageSize: curSize,
      orientation: curOrient,
      margins: pagePadding,
      pageColor: pageBackground,
    };

    docModelRef.current.settings = {
      ...docModelRef.current.settings,
      pageSize: curSize,
      orientation: curOrient,
      margins: {
        top: pagePadding,
        bottom: pagePadding,
        left: pagePadding,
        right: pagePadding,
      },
      pageColor: pageBackground,
    };
    triggerRelayout();
  }, [paperSize, landscape, pagePadding, pageBackground, triggerRelayout]);

  useEffect(() => {
    updateTabIndicator();
    const timer = setTimeout(updateTabIndicator, 50);
    window.addEventListener("resize", updateTabIndicator);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateTabIndicator);
    };
  }, [updateTabIndicator]);

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const getDocumentHtml = useCallback(() => {
    return documentModelToHtml(docModelRef.current);
  }, []);

  const syncAll = useCallback(() => {
    triggerRelayout();
  }, [triggerRelayout]);

  const focusCurrentPage = useCallback(() => {
    textInputController.focus();
  }, [textInputController]);

  const setDocumentFromHtml = useCallback((html: string) => {
    const modelData = htmlToDocumentModel(html, docName);
    // Keep the same DocumentModel instance because the transaction engine and
    // command registry hold references to it. Replacing the instance makes a
    // loaded document render correctly but sends typed edits to the old blank
    // model, leaving the visible document unchanged.
    docModelRef.current.data = modelData;
    textInputController.setDocument(docModelRef.current);
    keyboardController.setDocument(docModelRef.current);
    pointerController.setDocument(docModelRef.current);
    clipboardService.setDocument(docModelRef.current);
    historyManager.clear();
    // Blur hidden input to prevent browser restoring focus on reload
    if (hiddenInputRef.current) {
      hiddenInputRef.current.blur();
    }
    if (typeof document !== 'undefined' && document.activeElement === hiddenInputRef.current) {
      (document.activeElement as HTMLElement)?.blur();
    }
    fontMetrics.clearCache();
    // On document load / reload, start in clean pristine state without forcing a caret at the top title
    selectionEngine.setSelection(null);
    setCaret(null);
    setSelectionRects([]);
    const freshLayout = layoutEngine.layoutDocument(docModelRef.current);
    layoutRef.current = freshLayout;
    setLayout(freshLayout);
    const totalP = freshLayout.pageCount || (freshLayout.pageHeightIndex ? freshLayout.pageHeightIndex.getPageCount() : freshLayout.pages.length);
    setTotalPages(totalP);
  }, [docName, textInputController, keyboardController, pointerController, clipboardService, historyManager, selectionEngine]);

  const setDocumentHtml = setDocumentFromHtml;

  const exec = useCallback((cmd: string, val: any = "") => {
    textInputController.focus();
    if (cmd === "bold") commandRegistry.execute('toggleBold');
    else if (cmd === "italic") commandRegistry.execute('toggleItalic');
    else if (cmd === "underline") commandRegistry.execute('toggleUnderline');
    else if (cmd === "strikeThrough") commandRegistry.execute('toggleStrike');
    else if (cmd === "fontName") commandRegistry.execute('setFontFamily', val);
    else if (cmd === "fontSize") commandRegistry.execute('setFontSize', Number(val));
    else if (cmd === "foreColor") commandRegistry.execute('setTextColor', val);
    else if (cmd === "hiliteColor" || cmd === "backColor") commandRegistry.execute('setHighlightColor', val);
    else if (cmd === "justifyLeft") commandRegistry.execute('setAlignment', 'left');
    else if (cmd === "justifyCenter") commandRegistry.execute('setAlignment', 'center');
    else if (cmd === "justifyRight") commandRegistry.execute('setAlignment', 'right');
    else if (cmd === "justifyFull") commandRegistry.execute('setAlignment', 'justify');
    else if (cmd === "insertOrderedList") commandRegistry.execute('toggleList', 'numbered');
    else if (cmd === "insertUnorderedList") commandRegistry.execute('toggleList', 'bullet');
    else if (cmd === "indent") commandRegistry.execute('increaseIndent');
    else if (cmd === "outdent") commandRegistry.execute('decreaseIndent');
    else if (cmd === "undo") commandRegistry.execute('undo');
    else if (cmd === "redo") commandRegistry.execute('redo');
    else if (cmd === "selectAll") commandRegistry.execute('selectAll');
    else if (cmd === "insertHorizontalRule") commandRegistry.execute('insertHorizontalRule');
    else if (cmd === "removeFormat") commandRegistry.execute('clearFormatting');
    else if (cmd === "insertText") commandRegistry.execute('insertText', { text: val });
    else if (cmd === "formatBlock") {
      if (val === "<h1>") commandRegistry.execute('setParagraphPreset', 'h1');
      else if (val === "<h2>") commandRegistry.execute('setParagraphPreset', 'h2');
      else if (val === "<blockquote>") commandRegistry.execute('setParagraphPreset', 'quote');
      else commandRegistry.execute('setParagraphPreset', 'normal');
    }
    else if (cmd === "insertTableRowAbove") commandRegistry.execute('insertTableRowAbove');
    else if (cmd === "insertTableRowBelow") commandRegistry.execute('insertTableRowBelow');
    else if (cmd === "insertTableColumnLeft") commandRegistry.execute('insertTableColumnLeft');
    else if (cmd === "insertTableColumnRight") commandRegistry.execute('insertTableColumnRight');
    else if (cmd === "deleteTableRow") commandRegistry.execute('deleteTableRow');
    else if (cmd === "deleteTableColumn") commandRegistry.execute('deleteTableColumn');
    else if (cmd === "deleteTable") commandRegistry.execute('deleteTable');
    else if (cmd === "insertHTML") {
      const subDoc = htmlToDocumentModel(val);
      if (subDoc.blocks.length > 0) {
        for (const b of subDoc.blocks) {
          if ('runs' in b) {
            for (const r of b.runs) {
              commandRegistry.execute('insertText', { text: r.text, marks: r.marks });
            }
            if (subDoc.blocks.length > 1) {
              commandRegistry.execute('insertParagraph');
            }
          }
        }
      }
    }
    triggerRelayout();
  }, [commandRegistry, textInputController, triggerRelayout]);

  // Load content
  useEffect(() => {
    if (!open) {
      hasInitializedRef.current = false;
      return;
    }
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initDocContent = async () => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.blur();
      }
      if (typeof document !== 'undefined' && document.activeElement === hiddenInputRef.current) {
        (document.activeElement as HTMLElement)?.blur();
      }
      fontMetrics.clearCache();
      selectionEngine.setSelection(null);
      setCaret(null);
      setSelectionRects([]);

      if (initialContent) {
        setDocumentHtml(initialContent);
        window.requestAnimationFrame(() => {
          syncAll();
          if (typeof window !== 'undefined') (window as any).__editorReady = true;
        });
        return;
      }

      let meta: any = null;
      if (fileKey) {
        const cachedMeta = localStorage.getItem('doc_meta_' + fileKey);
        if (cachedMeta) {
          try { meta = JSON.parse(cachedMeta); } catch (e) {}
        }
      }

      const activeFileName = fileName || meta?.name || 'Van_ban.wnom';
      setDocName(activeFileName.replace(/\.(wnom|docx?)$/i, ''));

      // Check IndexedDB blob
      let blob: Blob | null = null;
      if (fileKey) {
        blob = await getFileBlob(fileKey);
        if (!blob && meta?.key) {
          blob = await getFileBlob(meta.key);
        }
        if (!blob) {
          try {
            const res = await filesApi.download(fileKey);
            if (res.data && res.data.size > 0) {
              blob = res.data;
              await saveFileBlob(fileKey, blob);
            }
          } catch (e) {}
        }
      }

      if (blob) {
        // 1. Thử giải nén OpenXML Word (.docx) thật
        try {
          const parsedDocxHtml = await parseDocxBlobToHtml(blob);
          if (parsedDocxHtml && parsedDocxHtml.trim()) {
            setDocumentHtml(parsedDocxHtml);
            window.requestAnimationFrame(() => {
              syncAll();
              if (typeof window !== 'undefined') (window as any).__editorReady = true;
            });
            return;
          }
        } catch (e) {}

        // 2. Thử đọc mã HTML nếu lưu dưới dạng văn bản HTML
        try {
          const text = await blob.text();
          if (!text.startsWith('PK') && (/<!doctype\s+html|<html\b|<body\b/i.test(text))) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const bodyHtml = doc.body.innerHTML.trim();
            if (bodyHtml) {
              setDocumentHtml(bodyHtml);
              window.requestAnimationFrame(() => {
                syncAll();
                if (typeof window !== 'undefined') (window as any).__editorReady = true;
              });
              return;
            }
          }
        } catch (e) {}

        // Extract paragraphs from real docx/doc binary
        const extracted = await extractReadableTextFromDoc(blob, activeFileName);
        if (extracted && extracted.length > 0) {
          const titleFormatted = activeFileName.replace(/_/g, ' ').replace(/\.(wnom|docx?)$/i, '').toUpperCase();
          const paragraphsHtml = extracted
            .map((p) => `<p style="margin: 0 0 14px 0; text-indent: 28px; line-height: 1.8; text-align: justify;">${escapeHtml(p)}</p>`)
            .join('');

          setDocumentHtml(`
            <p style="font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0 0 2px 0; text-align: center;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p style="font-size: 13pt; font-weight: bold; margin: 0 0 6px 0; text-align: center;">Độc lập - Tự do - Hạnh phúc</p>
            <p style="text-align: center; font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 20px 0 16px 0;">
              ${titleFormatted}
            </p>
            ${paragraphsHtml}
            <table style="width: 100%; border: none; margin-top: 40px; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 0;">
                    <p style="font-weight: bold; font-size: 13pt; text-transform: uppercase; margin: 0 0 4px 0;">BÊN TIẾP NHẬN</p>
                    <p style="font-style: italic; font-size: 12pt; margin: 0 0 60px 0;">(Ký, ghi rõ họ tên)</p>
                  </td>
                  <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 0;">
                    <p style="font-style: italic; font-size: 12pt; margin: 0 0 4px 0;">Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</p>
                    <p style="font-weight: bold; font-size: 13pt; text-transform: uppercase; margin: 0 0 60px 0;">ĐẠI DIỆN BAN GIÁM ĐỐC</p>
                    <p style="font-weight: bold; font-size: 13pt; margin: 0;">Nguyễn Văn Minh</p>
                  </td>
                </tr>
              </tbody>
            </table>
          `);
          window.requestAnimationFrame(() => {
            syncAll();
            if (typeof window !== 'undefined') (window as any).__editorReady = true;
          });
          return;
        }
      }

      if (initialParagraphs && initialParagraphs.length > 0) {
        const titleFormatted = activeFileName.replace(/_/g, ' ').replace(/\.(wnom|docx?)$/i, '').toUpperCase();
        const paragraphsHtml = initialParagraphs
          .map((p) => `<p style="margin: 0 0 14px 0; text-indent: 28px; line-height: 1.8; text-align: justify;">${escapeHtml(p)}</p>`)
          .join('');

        setDocumentHtml(`
          <p style="font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0 0 2px 0; text-align: center;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style="font-size: 13pt; font-weight: bold; margin: 0 0 6px 0; text-align: center;">Độc lập - Tự do - Hạnh phúc</p>
          <p style="text-align: center; font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 20px 0 16px 0;">
            ${titleFormatted}
          </p>
          ${paragraphsHtml}
          <table style="width: 100%; border: none; margin-top: 40px; border-collapse: collapse;">
            <tbody>
              <tr>
                <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 0;">
                  <p style="font-weight: bold; font-size: 13pt; text-transform: uppercase; margin: 0 0 4px 0;">BÊN TIẾP NHẬN</p>
                  <p style="font-style: italic; font-size: 12pt; margin: 0 0 60px 0;">(Ký, ghi rõ họ tên)</p>
                </td>
                <td style="width: 50%; text-align: center; vertical-align: top; border: none; padding: 0;">
                  <p style="font-style: italic; font-size: 12pt; margin: 0 0 4px 0;">Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</p>
                  <p style="font-weight: bold; font-size: 13pt; text-transform: uppercase; margin: 0 0 60px 0;">ĐẠI DIỆN BAN GIÁM ĐỐC</p>
                  <p style="font-weight: bold; font-size: 13pt; margin: 0;">Nguyễn Văn Minh</p>
                </td>
              </tr>
            </tbody>
          </table>
        `);
      } else {
        setDocumentHtml('<p style="margin: 0 0 12px 0; line-height: 1.8;"><br></p>');
      }

      window.requestAnimationFrame(() => {
        syncAll();
        if (typeof window !== 'undefined') (window as any).__editorReady = true;
      });
    };

    initDocContent();
  }, [open, fileKey, fileName, initialContent]);

  useEffect(() => {
    const handler = () => updateSelectedImgRect();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [updateSelectedImgRect]);

  // Click away from find bar
  useEffect(() => {
    if (!showFind) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".find-bar") && !target.closest(".find-btn")) {
        setShowFind(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFind]);

  // Context menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCtxCopy = useCallback(async () => {
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      try { await navigator.clipboard.writeText(sel.toString()); } catch { /* ignore */ }
    }
    exec("copy");
    setCtxMenu(null);
  }, [exec]);

  const handleCtxCut = useCallback(async () => {
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      try { await navigator.clipboard.writeText(sel.toString()); } catch { /* ignore */ }
    }
    exec("cut");
    setCtxMenu(null);
  }, [exec]);

  const handleCtxPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      exec("insertText", text);
    } catch {
      exec("paste");
    }
    setCtxMenu(null);
  }, [exec]);

  const handleCtxCmd = useCallback((cmd: string, val = "") => {
    exec(cmd, val);
    setCtxMenu(null);
  }, [exec]);

  const handleContextMenu = useCallback((e: React.MouseEvent, pageIndex?: number) => {
    e.preventDefault();
    if (typeof pageIndex === 'number') {
      textInputController.focus();
      pointerController.handlePointerDown(e as any, pageIndex, zoom / 100);
      pointerController.handlePointerUp(e as any);
    }
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [pointerController, textInputController, zoom]);

  const insertImageWithOptimalSize = useCallback((url: string) => {
    const tempImg = new window.Image();
    tempImg.onload = () => {
      const origW = tempImg.naturalWidth || tempImg.width || 400;
      const origH = tempImg.naturalHeight || tempImg.height || 300;
      const maxAllowedW = 420; // Kích thước hiển thị chuẩn, hài hòa trong trang văn bản
      let targetW = origW;
      let targetH = origH;

      if (origW > maxAllowedW) {
        targetW = maxAllowedW;
        targetH = Math.round((origH * maxAllowedW) / origW);
      }

      const imgHtml = `<img src="${url}" style="width:${targetW}px;max-width:100%;height:auto;margin:12px auto;display:block;border-radius:2px;" alt="image"/>`;
      exec("insertHTML", imgHtml);
      window.requestAnimationFrame(() => {
        syncAll();
        const imgs = editorRef.current?.querySelectorAll<HTMLImageElement>("img");
        if (imgs && imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1];
          setSelectedImgEl(lastImg);
        }
      });
    };
    tempImg.onerror = () => {
      exec("insertHTML", `<img src="${url}" style="width:380px;max-width:100%;height:auto;margin:12px auto;display:block;border-radius:2px;" alt="image"/>`);
      window.requestAnimationFrame(syncAll);
    };
    tempImg.src = url;
  }, [exec, syncAll]);

  const handleInsertImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        if (url) insertImageWithOptimalSize(url);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [insertImageWithOptimalSize]);

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    commandRegistry.execute('insertTable', { rows, columns: cols });
    setShowTablePicker(false);
    triggerRelayout();
  }, [commandRegistry, triggerRelayout]);

  const handleInsertLink = useCallback(() => {
    const url = prompt("Nhập địa chỉ liên kết:", "https://");
    if (url) {
      commandRegistry.execute('setLink', url);
      triggerRelayout();
    }
  }, [commandRegistry, triggerRelayout]);

  const handleTextCase = useCallback((type: "upper" | "lower" | "title") => {
    const sel = selectionEngine.getSelection();
    if (!sel || isSelectionCollapsed(sel)) return;
    const text = getSelectedText(sel, docModelRef.current);
    if (!text) return;
    let result = text;
    if (type === "upper") result = text.toUpperCase();
    else if (type === "lower") result = text.toLowerCase();
    else if (type === "title") result = text.replace(/\b\w/g, c => c.toUpperCase());
    commandRegistry.execute('insertText', { text: result });
    triggerRelayout();
  }, [selectionEngine, commandRegistry, triggerRelayout]);

  const growFont = useCallback(() => {
    commandRegistry.execute('growFont');
    setFontSizeVal(v => Math.min(72, v + 2));
    textInputController.focus();
    triggerRelayout();
  }, [commandRegistry, textInputController, triggerRelayout]);

  const shrinkFont = useCallback(() => {
    commandRegistry.execute('shrinkFont');
    setFontSizeVal(v => Math.max(8, v - 2));
    textInputController.focus();
    triggerRelayout();
  }, [commandRegistry, textInputController, triggerRelayout]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. Nếu đang kéo di chuyển một ảnh có sẵn trong tài liệu
    if (draggedImgRef.current) {
      const oldImg = draggedImgRef.current;
      draggedImgRef.current = null;

      let range: Range | null = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if ((e as any).rangeParent) {
        range = document.createRange();
        range.setStart((e as any).rangeParent, (e as any).rangeOffset);
      }

      if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
        const clone = oldImg.cloneNode(true) as HTMLImageElement;
        oldImg.remove();
        range.insertNode(clone);
        window.requestAnimationFrame(() => {
          syncAll();
          setSelectedImgEl(clone);
        });
        return;
      }
    }

    // 2. Kéo thả file ảnh từ máy tính vào
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const url = ev.target?.result as string;
          if (url) insertImageWithOptimalSize(url);
        };
        reader.readAsDataURL(file);
      } else if (file.type === "text/html" || file.type === "text/plain") {
        file.text().then(text => exec("insertText", text));
      }
    }
  }, [exec, insertImageWithOptimalSize, syncAll]);

  const handlePasteOnEditor = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (ev) => {
              const url = ev.target?.result as string;
              if (url) insertImageWithOptimalSize(url);
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }
    }
  }, [insertImageWithOptimalSize]);

  const startResize = useCallback((handle: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImgEl) return;

    const startW = selectedImgEl.offsetWidth || selectedImgEl.width || 200;
    const startH = selectedImgEl.offsetHeight || selectedImgEl.height || 150;
    const maxPageContentWidth = (pageWidth || 794) - (pagePadding || 96) * 2;

    resizeStateRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW,
      startH,
      aspectRatio: startW / (startH || 1),
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeStateRef.current || !selectedImgEl) return;
      const { handle: h, startX, startY, startW: sw, startH: sh, aspectRatio } = resizeStateRef.current;
      const currentZoom = zoom / 100;
      const dx = (ev.clientX - startX) / currentZoom;
      const dy = (ev.clientY - startY) / currentZoom;

      let newW = sw;
      let newH = sh;

      if (h === "se") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw + dx));
        newH = Math.max(30, newW / aspectRatio);
      } else if (h === "sw") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw - dx));
        newH = Math.max(30, newW / aspectRatio);
      } else if (h === "ne") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw + dx));
        newH = Math.max(30, newW / aspectRatio);
      } else if (h === "nw") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw - dx));
        newH = Math.max(30, newW / aspectRatio);
      } else if (h === "e") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw + dx));
      } else if (h === "w") {
        newW = Math.min(maxPageContentWidth, Math.max(50, sw - dx));
      } else if (h === "s") {
        newH = Math.max(30, sh + dy);
      } else if (h === "n") {
        newH = Math.max(30, sh - dy);
      }

      selectedImgEl.style.width = `${Math.round(newW)}px`;
      selectedImgEl.style.height = `${Math.round(newH)}px`;
      selectedImgEl.style.maxWidth = "100%";
      updateSelectedImgRect();
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      syncAll();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [selectedImgEl, zoom, pageWidth, pagePadding, updateSelectedImgRect, syncAll]);

  const emojiList = ["😊","😂","❤️","👍","🎉","😢","😡","🤔","🙏","🔥","💪","😍","🥺","😎","✨","🌟","💡","📝","✅","❌","⭐","🎯","💯","🔍","🗂️","📌","🔗","🎨","📊","📈","💻","📱","🌙","☀️","🌈","🍀","🎵","📚","✏️","🖊️","📖","🔒","🔓","🚀","🛡️","⚡","🎮","🏆","🥇"];

  const exportTxt = useCallback(() => {
    const text = editorRef.current?.innerText || "";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [docName]);

  const handleFind = useCallback(() => {
    if (!findText) return;
    const query = findText.trim();
    if (!query) return;

    const matches: { blockId: string; offset: number; length: number }[] = [];
    for (const block of docModelRef.current.blocks) {
      const text = docModelRef.current.getBlockText(block);
      let pos = 0;
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        matches.push({ blockId: block.id, offset: pos, length: query.length });
        pos += lowerQuery.length;
      }
    }

    if (!matches.length) {
      notify(`Không tìm thấy "${query}" trong tài liệu.`);
      return;
    }

    const targetIdx = lastFindIndexRef.current % matches.length;
    const targetMatch = matches[targetIdx];
    lastFindIndexRef.current = targetIdx + 1;

    selectionEngine.setSelection(
      {
        anchor: { blockId: targetMatch.blockId, offset: targetMatch.offset },
        focus: { blockId: targetMatch.blockId, offset: targetMatch.offset + targetMatch.length },
      }
    );
    notify(`Đã tìm thấy ${targetIdx + 1}/${matches.length}`);
  }, [findText, selectionEngine, notify]);

  const moveImageUp = useCallback(() => {
    if (selectedImgEl && selectedImgEl.parentElement) {
      const prev = selectedImgEl.previousElementSibling;
      if (prev) {
        selectedImgEl.parentElement.insertBefore(selectedImgEl, prev);
        updateSelectedImgRect();
        syncAll();
      }
    }
  }, [selectedImgEl, updateSelectedImgRect, syncAll]);

  const moveImageDown = useCallback(() => {
    if (selectedImgEl && selectedImgEl.parentElement) {
      const next = selectedImgEl.nextElementSibling;
      if (next) {
        selectedImgEl.parentElement.insertBefore(next, selectedImgEl);
        updateSelectedImgRect();
        syncAll();
      }
    }
  }, [selectedImgEl, updateSelectedImgRect, syncAll]);

  const handleReplace = useCallback(() => {
    if (!findText) return;
    const sel = selectionEngine.getSelection();
    if (sel && !isSelectionCollapsed(sel)) {
      commandRegistry.execute('insertText', { text: replaceText });
      triggerRelayout();
    }
    handleFind();
  }, [findText, replaceText, selectionEngine, commandRegistry, triggerRelayout, handleFind]);

  const handleReplaceAll = useCallback(() => {
    if (!findText) return;
    const query = findText.trim();
    if (!query) return;

    let count = 0;
    for (const block of docModelRef.current.blocks) {
      const text = docModelRef.current.getBlockText(block);
      if (text.toLowerCase().includes(query.toLowerCase())) {
        const newText = text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText);
        if ('runs' in block && Array.isArray(block.runs)) {
          block.runs = [{ id: generateRunId(), text: newText, marks: block.runs[0]?.marks || {} }];
          count++;
        }
      }
    }
    if (count > 0) {
      notify(`Đã thay thế ${count} kết quả.`);
      triggerRelayout();
    } else {
      notify(`Không tìm thấy "${query}" để thay thế.`);
    }
  }, [findText, replaceText, triggerRelayout, notify]);

  const handlePaste = useCallback(async () => {
    await clipboardService.paste();
  }, [clipboardService]);

  const handleCut = useCallback(async () => {
    await clipboardService.cut();
    triggerRelayout();
  }, [clipboardService, triggerRelayout]);

  const handleCopy = useCallback(async () => {
    await clipboardService.copy();
  }, [clipboardService]);

  const handleSave = useCallback(async () => {
    const html = getDocumentHtml();
    const finalName = docName.trim().endsWith(".wnom") ? docName.trim() : `${docName.trim()}.wnom`;
    const docxBlob = generateValidDocxBlob(html, finalName);

    if (fileKey) {
      await saveFileBlob(fileKey, docxBlob);
      try {
        const cachedMeta = localStorage.getItem('doc_meta_' + fileKey);
        if (cachedMeta) {
          const meta = JSON.parse(cachedMeta);
          meta.name = finalName;
          meta.modified = new Date().toISOString();
          localStorage.setItem('doc_meta_' + fileKey, JSON.stringify(meta));
        }
      } catch (e) {}
    }

    onSaveSuccess && onSaveSuccess(finalName, docxBlob);
    notify("Đã lưu tài liệu Nôm thành công!");
  }, [docName, fileKey, getDocumentHtml, onSaveSuccess, notify]);

  useEffect(() => {
    return commandRegistry.register('save', () => {
      void handleSave();
    });
  }, [commandRegistry, handleSave]);

  const handleDownloadDocx = useCallback(() => {
    const html = getDocumentHtml();
    const finalName = docName.trim().endsWith(".wnom") ? docName.trim() : `${docName.trim()}.wnom`;
    const docxBlob = generateValidDocxBlob(html, finalName);

    const url = URL.createObjectURL(docxBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    a.click();
    URL.revokeObjectURL(url);
    notify("Đã tải tệp Nôm chuẩn về máy!");
  }, [docName, getDocumentHtml, notify]);

  const handleOpen = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wnom,.docx,.doc,.html,.htm,.txt";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.endsWith(".wnom") || fileNameLower.endsWith(".docx") || fileNameLower.endsWith(".doc")) {
        const parsed = await parseDocxBlobToHtml(file);
        if (parsed) {
          setDocumentHtml(parsed);
          setDocName(file.name);
          window.requestAnimationFrame(syncAll);
          notify("Đã mở tệp Word thành công!");
          return;
        }
      }

      const text = await file.text();
      if (text && !text.startsWith("PK")) {
        setDocumentHtml(text);
        setDocName(file.name);
        window.requestAnimationFrame(syncAll);
        notify("Đã mở tệp thành công!");
      }
    };
    input.click();
  }, [setDocumentHtml, syncAll, notify]);

  const clearDocument = useCallback(() => {
    setDocumentHtml('<p><br/></p>');
    window.requestAnimationFrame(() => {
      focusCurrentPage();
      syncAll();
    });
  }, [focusCurrentPage, setDocumentHtml, syncAll]);

  const handleFontChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFontName(val);
    commandRegistry.execute('setFontFamily', val);
    textInputController.focus();
    triggerRelayout();
  }, [commandRegistry, textInputController, triggerRelayout]);

  const handleSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    setFontSize(val);
    setFontSizeVal(val);
    commandRegistry.execute('setFontSize', val);
    textInputController.focus();
    triggerRelayout();
  }, [commandRegistry, textInputController, triggerRelayout]);

  const handleTextColor = useCallback(() => {
    const input = document.createElement("input");
    input.type = "color";
    input.value = "#000000";
    input.onchange = () => {
      commandRegistry.execute('setTextColor', input.value);
      triggerRelayout();
    };
    input.click();
  }, [commandRegistry, triggerRelayout]);

  const handleHighlight = useCallback(() => {
    const input = document.createElement("input");
    input.type = "color";
    input.value = "#FFE135";
    input.onchange = () => {
      commandRegistry.execute('setHighlightColor', input.value);
      triggerRelayout();
    };
    input.click();
  }, [commandRegistry, triggerRelayout]);

  const handleStyle = useCallback((style: string) => {
    if (style === "p") {
      commandRegistry.execute('setParagraphPreset', 'normal');
    } else if (style === "h1") {
      commandRegistry.execute('setParagraphPreset', 'h1');
    } else if (style === "h2") {
      commandRegistry.execute('setParagraphPreset', 'h2');
    } else if (style === "blockquote") {
      commandRegistry.execute('setParagraphPreset', 'subtitle');
    }
    triggerRelayout();
  }, [commandRegistry, triggerRelayout]);

  // Global Keyboard Shortcuts (Office / Word Standard)
  useEffect(() => {
    if (!open) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isSearchInput = target?.classList.contains('docx-search-input') || (target?.tagName === 'INPUT' && !target.classList.contains('doc-hidden-input'));

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isCtrlOrMeta) {
        const key = e.key.toLowerCase();

        // 1. Ctrl + S -> Lưu tài liệu
        if (key === "s") {
          e.preventDefault();
          e.stopPropagation();
          handleSave();
          return;
        }

        // 2. Ctrl + F -> Tìm kiếm
        if (key === "f") {
          e.preventDefault();
          e.stopPropagation();
          setShowFind(true);
          setShowReplace(false);
          window.setTimeout(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
          }, 50);
          return;
        }

        // 3. Ctrl + H -> Thay thế
        if (key === "h") {
          e.preventDefault();
          e.stopPropagation();
          setShowFind(true);
          setShowReplace(true);
          window.setTimeout(() => {
            findInputRef.current?.focus();
            findInputRef.current?.select();
          }, 50);
          return;
        }

        // Ctrl + Alt + P -> Toggle Engine Diagnostics Performance HUD
        if (key === "p" && e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          setShowPerfHud(prev => !prev);
          notify("Đã bật/tắt HUD giám sát hiệu năng engine.");
          return;
        }

        // 4. Ctrl + P -> In tài liệu
        if (key === "p") {
          e.preventDefault();
          e.stopPropagation();
          window.print();
          return;
        }

        // 5. Ctrl + B -> In đậm
        if (key === "b") {
          e.preventDefault();
          e.stopPropagation();
          exec("bold");
          return;
        }

        // 6. Ctrl + I -> In nghiêng
        if (key === "i") {
          e.preventDefault();
          e.stopPropagation();
          exec("italic");
          return;
        }

        // 7. Ctrl + U -> Gạch chân
        if (key === "u") {
          e.preventDefault();
          e.stopPropagation();
          exec("underline");
          return;
        }

        // 8. Ctrl + Z -> Hoàn tác
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          exec("undo");
          return;
        }

        // 9. Ctrl + Y (hoặc Ctrl + Shift + Z) -> Làm lại
        if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          exec("redo");
          return;
        }

        // 10. Ctrl + A -> Chọn tất cả nội dung trong tài liệu
        if (key === "a") {
          if (!isSearchInput) {
            e.preventDefault();
            e.stopPropagation();
            commandRegistry.execute('selectAll');
            triggerRelayout();
            return;
          }
        }

        // 11. Ctrl + C -> Sao chép
        if (key === "c" && !isSearchInput) {
          e.preventDefault();
          e.stopPropagation();
          clipboardService.copy();
          return;
        }

        // 12. Ctrl + X -> Cắt
        if (key === "x" && !isSearchInput) {
          e.preventDefault();
          e.stopPropagation();
          clipboardService.cut();
          return;
        }

        // 13. Ctrl + V -> Dán
        if (key === "v" && !isSearchInput) {
          if (e.repeat) e.preventDefault();
          // Keep the browser's single native paste event (including HTML).
          // Focus the editor when paste was invoked with a ribbon button focused.
          textInputController.focus();
          return;
        }

        // 14. Ctrl + Home -> Về đầu trang tài liệu
        if (e.key === "Home") {
          e.preventDefault();
          e.stopPropagation();
          keyboardController.handleKeyDown(e);
          docRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          triggerRelayout();
          return;
        }

        // 15. Ctrl + End -> Xuống cuối tài liệu
        if (e.key === "End") {
          e.preventDefault();
          e.stopPropagation();
          keyboardController.handleKeyDown(e);
          docRef.current?.scrollTo({ top: docRef.current.scrollHeight, behavior: "smooth" });
          triggerRelayout();
          return;
        }

        // 16. Ctrl + Enter -> Ngắt trang mới
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          commandRegistry.execute('insertPageBreak');
          triggerRelayout();
          notify("Đã thêm trang mới.");
          return;
        }
      }

      // Escape -> Đóng các bảng nổi
      if (e.key === "Escape") {
        setShowFind(false);
        setShowShortcuts(false);
        setShowStats(false);
        setShowTablePicker(false);
        setShowSource(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [open, handleSave, exec, clipboardService, keyboardController, textInputController, commandRegistry, triggerRelayout, notify]);

  // Zoom on Ctrl + Wheel / Cmd + Wheel (up to 500%)
  useEffect(() => {
    if (!open) return;
    const container = docRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const step = e.deltaY < 0 ? 10 : -10;
        setZoom((prev) => Math.max(10, Math.min(500, prev + step)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [open]);

  const handleRibbonAction = useCallback((action: string) => {
    const selectedText = window.getSelection()?.toString().trim() || "";
    const headings = getPageEditors().flatMap((page) => Array.from(page.querySelectorAll("h1, h2")));

    switch (action) {
      case "insert-page":
      case "insert-blank-page": {
        commandRegistry.execute('insertPageBreak');
        triggerRelayout();
        notify("Đã thêm trang mới.");
        return;
      }
      case "insert-hr":
        commandRegistry.execute('insertHorizontalRule');
        triggerRelayout();
        notify("Đã chèn đường kẻ ngang.");
        return;
      case "insert-date": {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        commandRegistry.execute('insertText', { text: todayStr });
        triggerRelayout();
        notify(`Đã chèn ngày ${todayStr}.`);
        return;
      }
      case "font-default":
        commandRegistry.execute('clearFormatting');
        commandRegistry.execute('setFontFamily', 'Times New Roman');
        commandRegistry.execute('setFontSize', 14);
        setFontName("Times New Roman");
        setFontSize(14);
        triggerRelayout();
        notify("Đã áp dụng phông mặc định Times New Roman, cỡ 14.");
        return;
      case "insert-chart":
        commandRegistry.execute('insertTable', { rows: 3, columns: 4 });
        triggerRelayout();
        notify("Đã chèn bảng biểu đồ mẫu.");
        return;
      case "insert-symbol": {
        const symbol = window.prompt("Nhập ký hiệu cần chèn:", "©");
        if (symbol) {
          commandRegistry.execute('insertText', { text: symbol });
          triggerRelayout();
          notify(`Đã chèn ký hiệu ${symbol}.`);
        }
        return;
      }
      case "show-format":
        notify("Đã bật/tắt ký tự định dạng.");
        return;
      case "home-addins":
        notify("Khu vực bổ trợ sẵn sàng để tích hợp các tiện ích của hệ thống.");
        return;
      case "home-editor":
        setTrackChanges((value) => !value);
        notify("Đã bật/tắt chế độ biên tập viên.");
        return;
      case "dictation": {
        const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!Recognition) { notify("Trình duyệt này chưa hỗ trợ đọc chính tả."); return; }
        const recognition = new Recognition();
        recognition.lang = "vi-VN";
        recognition.interimResults = false;
        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          if (text) {
            commandRegistry.execute('insertText', { text });
            triggerRelayout();
          }
        };
        recognition.onerror = () => notify("Không thể nhận giọng nói. Hãy kiểm tra quyền micro.");
        recognition.start();
        notify("Đang lắng nghe. Hãy bắt đầu đọc nội dung.");
        return;
      }
      case "draw-pen":
        setDrawMode((current) => current === "pen" ? null : "pen");
        commandRegistry.execute('setTextColor', '#0F6CBD');
        triggerRelayout();
        notify("Bút mực xanh đã bật. Nội dung nhập mới sẽ dùng màu mực xanh.");
        return;
      case "draw-highlight":
        setDrawMode((current) => current === "highlight" ? null : "highlight");
        commandRegistry.execute('setHighlightColor', '#FEF08A');
        triggerRelayout();
        notify("Bút đánh dấu đã bật cho vùng văn bản đang chọn.");
        return;
      case "draw-eraser":
        setDrawMode(null);
        commandRegistry.execute('clearFormatting');
        triggerRelayout();
        notify("Đã xóa định dạng của vùng văn bản đang chọn.");
        return;
      case "draw-to-text":
        commandRegistry.execute('clearFormatting');
        triggerRelayout();
        notify("Đã chuyển định dạng về chuẩn văn bản thường.");
        return;
      case "design-theme": {
        const next = pageBackground === "#FFFFFF" ? "#F8FBFF" : pageBackground === "#F8FBFF" ? "#FFF8F1" : "#FFFFFF";
        setPageBackground(next);
        notify("Đã áp dụng chủ đề màu cho tài liệu.");
        return;
      }
      case "design-colors":
        handleTextColor();
        return;
      case "design-font": {
        const next = fontName === "Times New Roman" ? "Arial" : fontName === "Arial" ? "Calibri" : "Times New Roman";
        setFontName(next);
        commandRegistry.execute('setFontFamily', next);
        triggerRelayout();
        notify(`Đã chuyển phông chữ sang ${next}.`);
        return;
      }
      case "design-page-color": {
        const input = document.createElement("input");
        input.type = "color";
        input.value = pageBackground;
        input.onchange = () => { setPageBackground(input.value); notify("Đã đổi màu nền trang."); };
        input.click();
        return;
      }
      case "design-watermark": {
        const label = window.prompt("Nội dung thủy ấn:", "BẢN NHÁP");
        if (label) {
          notify(`Đã đặt thủy ấn “${label}”.`);
        }
        return;
      }
      case "design-border":
        setPageBorder((value) => !value);
        notify(pageBorder ? "Đã bỏ viền trang." : "Đã thêm viền trang.");
        return;
      case "design-spacing":
      case "layout-spacing": {
        const next = lineHeight >= 1.8 ? 1.0 : lineHeight >= 1.4 ? 1.8 : 1.5;
        setLineHeight(next);
        notify(`Đã đặt giãn dòng ${next}.`);
        return;
      }
      case "layout-margin": {
        const next = pagePadding === 72 ? 96 : pagePadding === 96 ? 120 : 72;
        setPagePadding(next);
        notify("Đã đổi lề trang.");
        return;
      }
      case "layout-orientation":
        setLandscape((value) => !value);
        notify(landscape ? "Đã chuyển sang khổ dọc." : "Đã chuyển sang khổ ngang.");
        return;
      case "layout-size":
        setPaperSize((size) => size === "A4" ? "A5" : "A4");
        notify(paperSize === "A4" ? "Đã chuyển sang khổ giấy A5." : "Đã chuyển sang khổ giấy A4.");
        return;
      case "layout-columns": {
        const next = pageColumns === 1 ? 2 : pageColumns === 2 ? 3 : 1;
        setPageColumns(next);
        notify(next === 1 ? "Đã trở về một cột." : `Đã chia nội dung thành ${next} cột.`);
        return;
      }
      case "layout-line-numbers":
        setLineNumbers((value) => !value);
        notify(lineNumbers ? "Đã ẩn số dòng." : "Đã bật số dòng.");
        return;
      case "ref-toc": {
        if (!headings.length) { notify("Hãy tạo ít nhất một Tiêu đề 1 hoặc Tiêu đề 2 trước khi chèn mục lục."); return; }
        const items = headings.map((heading, index) => {
          const id = heading.id || `heading-${index + 1}`;
          heading.id = id;
          return `<li style="margin:4px 0"><a href="#${id}" style="color:#0F6CBD;text-decoration:none">${escapeHtml(heading.textContent || `Mục ${index + 1}`)}</a></li>`;
        }).join("");
        exec("insertHTML", `<section contenteditable="false" style="border:1px solid #CBD5E1;padding:14px;margin:12px 0;background:#F8FAFC"><strong>MỤC LỤC</strong><ol style="margin:8px 0 0;padding-left:24px">${items}</ol></section><p><br/></p>`);
        notify("Đã tạo mục lục từ các tiêu đề trong tài liệu.");
        return;
      }
      case "ref-footnote":
        exec("insertHTML", `<sup style="color:#0F6CBD">[${headings.length + 1}]</sup>`);
        notify("Đã chèn chú thích cuối trang.");
        return;
      case "ref-endnote":
        exec("insertHTML", `<sup style="color:#0F6CBD">[i]</sup>`);
        notify("Đã chèn chú thích cuối tài liệu.");
        return;
      case "ref-citation": {
        const source = window.prompt("Nguồn trích dẫn:", "Tài liệu tham khảo");
        if (source) {
          exec("insertHTML", `<cite style="color:#6B7280">${escapeHtml(selectedText || source)} — ${escapeHtml(source)}</cite>`);
          notify("Đã chèn trích dẫn.");
        }
        return;
      }
      case "ref-comment":
        if (!selectedText) { notify("Hãy chọn nội dung cần chú thích."); return; }
        exec("insertHTML", `<mark data-docx-comment="true" title="Chú thích" style="background:#FEF3C7">${escapeHtml(selectedText)}</mark>`);
        notify("Đã thêm chú thích cho nội dung được chọn.");
        return;
      case "ref-index":
        if (!selectedText) { notify("Hãy chọn thuật ngữ cần lập chỉ mục."); return; }
        exec("insertHTML", `<span data-docx-index="true" style="border-bottom:1px dotted #0F6CBD">${escapeHtml(selectedText)}</span>`);
        notify("Đã đánh dấu mục chỉ mục.");
        return;
      case "mail-envelope":
        exec("insertHTML", '<table style="width:100%;border:1px solid #64748B;margin:12px 0"><tbody><tr><td style="padding:18px"><strong>NGƯỜI GỬI</strong><br/>[Tên, địa chỉ]</td><td style="padding:18px"><strong>NGƯỜI NHẬN</strong><br/>{{Họ và tên}}<br/>{{Địa chỉ}}</td></tr></tbody></table><p><br/></p>');
        notify("Đã chèn mẫu phong bì.");
        return;
      case "mail-label":
        exec("insertHTML", '<p style="display:inline-block;border:1px solid #64748B;padding:10px 16px;margin:6px">{{Họ và tên}}<br/>{{Địa chỉ}}</p>');
        notify("Đã chèn nhãn thư.");
        return;
      case "mail-merge":
        exec("insertHTML", "{{Họ và tên}}");
        notify("Đã chèn trường trộn thư Họ và tên.");
        return;
      case "mail-recipient":
        exec("insertHTML", "{{Email}} ");
        notify("Đã chèn trường người nhận Email.");
        return;
      case "mail-field": {
        const field = window.prompt("Tên trường dữ liệu:", "Phòng ban");
        if (field) { exec("insertHTML", `{{${escapeHtml(field)}}}`); notify(`Đã chèn trường ${field}.`); }
        return;
      }
      case "mail-preview": {
        if (mailMergePreview) {
          setDocumentHtml(mailMergeSourceRef.current || getDocumentHtml());
          setMailMergePreview(false);
          notify("Đã trở lại dữ liệu gốc.");
        } else {
          mailMergeSourceRef.current = getDocumentHtml();
          setDocumentHtml(getDocumentHtml().replace(/\{\{Họ và tên\}\}/g, "Nguyễn Văn A").replace(/\{\{Email\}\}/g, "nguyenvana@example.com").replace(/\{\{Địa chỉ\}\}/g, "Hà Nội").replace(/\{\{Phòng ban\}\}/g, "Khối Phát triển Kinh doanh"));
          setMailMergePreview(true);
          notify("Đang xem trước dữ liệu trộn thư.");
        }
        return;
      }
      case "mail-finish":
        handleSave();
        notify("Đã tạo tệp hợp nhất để tải xuống.");
        return;
      case "review-spell":
        getPageEditors().forEach((page) => page.setAttribute("spellcheck", "true"));
        focusCurrentPage();
        notify("Đã bật kiểm tra chính tả của trình duyệt.");
        return;
      case "review-thesaurus":
        notify(selectedText ? `Tra cứu từ đồng nghĩa cho “${selectedText}”.` : "Hãy chọn một từ để tra từ đồng nghĩa.");
        return;
      case "review-language":
        getPageEditors().forEach((page) => page.setAttribute("lang", "vi"));
        notify("Đã đặt ngôn ngữ kiểm tra là Tiếng Việt.");
        return;
      case "review-comment":
        if (!selectedText) { notify("Hãy chọn nội dung trước khi thêm bình luận."); return; }
        exec("insertHTML", `<mark data-docx-comment="true" title="Bình luận" style="background:#DBEAFE">${escapeHtml(selectedText)}</mark>`);
        notify("Đã thêm bình luận vào vùng chọn.");
        return;
      case "review-delete-comments":
        getPageEditors().forEach((page) => page.querySelectorAll("[data-docx-comment]").forEach((node) => node.replaceWith(...Array.from(node.childNodes))));
        syncAll();
        notify("Đã xóa toàn bộ bình luận.");
        return;
      case "review-track":
        setTrackChanges((value) => !value);
        notify(trackChanges ? "Đã tắt theo dõi thay đổi." : "Đã bật theo dõi thay đổi.");
        return;
      case "review-compare":
        notify(`Tài liệu hiện có ${words} từ, ${chars} ký tự và ${totalPages} trang.`);
        return;
      case "review-protect":
        setProtectedDocument((value) => !value);
        notify(protectedDocument ? "Đã bỏ bảo vệ tài liệu." : "Tài liệu đang ở chế độ chỉ đọc.");
        return;
      case "view-print":
        setReadingMode(false);
        notify("Đã chuyển sang bố cục in.");
        return;
      case "view-reading":
        setReadingMode((value) => !value);
        notify(readingMode ? "Đã thoát chế độ đọc." : "Đã bật chế độ đọc.");
        return;
      case "view-web":
        setLandscape(false);
        setZoom(100);
        notify("Đã chuyển sang bố cục web.");
        return;
      case "view-outline":
        setShowNavigation((value) => !value);
        notify("Đã bật/tắt dàn bài tài liệu.");
        return;
      case "view-ruler":
        setShowRuler((value) => !value);
        return;
      case "view-grid":
        setShowGrid((value) => !value);
        return;
      case "view-navigation":
        setShowNavigation((value) => !value);
        return;
      case "help-shortcuts":
        setShowShortcuts(true);
        return;
      case "help-support":
        notify("Hỗ trợ: bạn có thể gửi phản hồi trực tiếp từ mục Báo lỗi.");
        return;
      case "help-tips":
        notify("Mẹo: dùng Ctrl+S để lưu và kéo-thả ảnh trực tiếp vào tài liệu.");
        return;
      case "help-community":
        notify("Khu vực cộng đồng đang dùng nội bộ trong hệ thống.");
        return;
      case "help-report":
        notify("Đã ghi nhận yêu cầu báo lỗi của bạn.");
        return;
      case "help-about":
        notify("Văn Nôm 1.2.0 vNôm — trình biên tập tài liệu của hệ thống.");
        return;
      case "help-update":
        notify("Ứng dụng đang dùng phiên bản mới nhất.");
        return;
      default:
        return;
    }
  }, [chars, drawMode, exec, focusCurrentPage, fontName, getDocumentHtml, getPageEditors, handleTextColor, landscape, lineHeight, mailMergePreview, notify, pageBackground, pageBorder, pageColumns, pagePadding, totalPages, paperSize, protectedDocument, readingMode, setDocumentHtml, syncAll, words]);

  const tabs = [
    { id: "file", label: "Tệp" },
    { id: "home", label: "Trang chủ" },
    { id: "insert", label: "Chèn" },
    { id: "draw", label: "Vẽ" },
    { id: "design", label: "Thiết kế" },
    { id: "layout", label: "Bố cục" },
    { id: "ref", label: "Tham khảo" },
    { id: "mail", label: "Thư tín" },
    { id: "review", label: "Xem lại" },
    { id: "view", label: "Xem" },
    { id: "help", label: "Trợ giúp" },
  ];

  const handleZoomSliderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const slider = e.currentTarget;
    slider.setPointerCapture(e.pointerId);

    const updateZoom = (clientX: number) => {
      const rect = slider.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newZoom = Math.round(ratio * 490 + 10);
      setZoom(newZoom);
    };

    updateZoom(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      updateZoom(ev.clientX);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        slider.releasePointerCapture(ev.pointerId);
      } catch (err) {}
      slider.removeEventListener("pointermove", onPointerMove);
      slider.removeEventListener("pointerup", onPointerUp);
      slider.removeEventListener("pointercancel", onPointerUp);
    };

    slider.addEventListener("pointermove", onPointerMove);
    slider.addEventListener("pointerup", onPointerUp);
    slider.addEventListener("pointercancel", onPointerUp);
  }, []);

  if (!open) return null;

  return (
    <div className="editor-wrap fixed inset-0 z-[100020] flex flex-col h-screen w-screen bg-[#F3F5F7] overflow-hidden select-none text-[#1f1f1f] rounded-[6px]"
      style={{ fontFamily: '"Segoe UI", system-ui, sans-serif', isolation: 'isolate' }}>

      {/* TITLE BAR */}
      <div className="docx-title-bar h-[42px] flex items-center justify-between px-3 shrink-0 relative z-50 bg-white">
        <div className="docx-title-start flex items-center gap-2 shrink-0">
          <div className="docx-title-brand w-[48px] h-[22px] bg-[#c94f2a] rounded-[3px] flex items-center justify-center font-bold text-white text-[12px] tracking-[0.5px] shadow shrink-0">Nôm</div>
          <div className="docx-title-history flex items-center">
            <button type="button" onClick={handleSave} className="docx-title-tool w-8 h-8 flex items-center justify-center rounded text-[#444]" title="Lưu"><Save className="w-4 h-4" strokeWidth={1.5} /></button>
            <button type="button" onClick={() => exec("undo")} className="docx-title-tool w-8 h-8 flex items-center justify-center rounded text-[#444]" title="Hoàn tác"><Undo2 className="w-4 h-4" strokeWidth={1.5} /></button>
            <button type="button" onClick={() => exec("redo")} className="docx-title-tool w-8 h-8 flex items-center justify-center rounded text-[#444]" title="Làm lại"><Undo2 className="w-4 h-4 scale-x-[-1]" strokeWidth={1.5} /></button>
            <button type="button" className="docx-title-tool w-5 h-8 flex items-center justify-center rounded text-[#444]"><ChevronDown className="w-3 h-3" strokeWidth={2} /></button>
          </div>
          <div className="docx-document-name flex items-center gap-1.5 text-[12px] text-[#555] ml-1">
            {editingName ? (
              <input autoFocus value={docName} onChange={e => setDocName(e.target.value)}
                onBlur={() => setEditingName(false)} onKeyDown={e => { if (e.key === "Enter") setEditingName(false); }}
                className="font-semibold text-[#1f1f1f] text-[12px] bg-white border border-[#0F6CBD] rounded px-1 outline-none w-[120px]" />
            ) : (
              <span onClick={() => setEditingName(true)} className="font-semibold text-[#1f1f1f] cursor-pointer hover:text-[#0F6CBD]">{docName}</span>
            )}
          </div>
        </div>

        <div className="docx-title-search absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center bg-white border border-[#ddd] shadow-sm hover:border-[#bbb] rounded-[6px] h-[30px] w-[360px] px-3 cursor-text transition-all"
            onClick={() => { setShowFind(true); setTimeout(() => findInputRef.current?.focus(), 50); }}>
            <Search className="w-[14px] h-[14px] text-[#777] mr-2 shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-[12.5px] text-[#999]">Tìm kiếm</span>
            <Mic className="w-[14px] h-[14px] text-[#777]" strokeWidth={1.5} />
          </div>
        </div>

        <div className="docx-window-actions flex items-center gap-1 shrink-0">
          <div className="docx-user-actions flex items-center gap-3 mr-3">
            <span className="text-[12.5px] text-[#444]">Tìm kiếm</span>
            <div className="w-[28px] h-[28px] rounded-full bg-[#0F6CBD] text-white text-[11px] font-bold flex items-center justify-center shadow">US</div>
            <Diamond className="w-[15px] h-[15px] text-[#666]" strokeWidth={1.5} />
          </div>
          <div className="docx-window-controls flex items-center h-[42px]">
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="docx-window-control"
              title="Thu nhỏ"
              style={{ width: 44, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1F1F1F' }}
            >
              <Minus className="w-[14px] h-[14px]" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.().catch(() => {});
                } else {
                  document.exitFullscreen?.().catch(() => {});
                }
              }}
              className="docx-window-control"
              title="Toàn màn hình / Khôi phục"
              style={{ width: 44, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1F1F1F' }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="docx-window-control docx-window-close"
              title="Đóng"
              style={{ width: 44, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1F1F1F' }}
            >
              <X className="w-[15px] h-[15px]" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="docx-tab-bar flex items-end justify-between px-2 h-[32px] shrink-0 z-40 relative bg-white border-b border-[#E2E8F0]">
        <div className="flex items-end h-full relative">
          {tabs.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabButtonRefs.current[t.id] = el; }}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 h-full text-[13px] relative flex items-center whitespace-nowrap transition-colors duration-150 font-normal rounded-t-[4px] outline-none ${activeTab === t.id ? "text-[#0F6CBD]" : "text-[#555] hover:text-[#1f1f1f]"}`}
            >
              {t.label}
            </button>
          ))}
          {/* Smooth Sliding Underline Indicator */}
          <div
            className="absolute bottom-0 h-[2.5px] bg-[#0F6CBD] rounded-t-full pointer-events-none"
            style={{
              left: `${tabIndicator.left}px`,
              width: `${tabIndicator.width}px`,
              opacity: tabIndicator.visible ? 1 : 0,
              transition: "left 0.22s cubic-bezier(0.2, 0, 0, 1), width 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.15s ease",
            }}
          />
        </div>
        <div className="docx-tab-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 3, paddingRight: 4 }}>
          <button
            type="button"
            onClick={() => handleRibbonAction("review-comment")}
            className="docx-action-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#333333',
              padding: '0 10px',
              height: 24,
              borderRadius: 4,
              border: '1px solid #D0D7DE',
              background: '#FFFFFF',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /> Chú thích
          </button>
          <button
            type="button"
            className="docx-action-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#333333',
              padding: '0 10px',
              height: 24,
              borderRadius: 4,
              border: '1px solid #D0D7DE',
              background: '#FFFFFF',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Edit3 className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /> Đang chỉnh sửa <ChevronDown className="w-3 h-3 ml-0.5 text-[#666]" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="docx-action-btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: '#FFFFFF',
              padding: '0 12px',
              height: 24,
              borderRadius: 4,
              border: 'none',
              background: '#0F6CBD',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
            onClick={handleSave}
          >
            <Share className="w-3.5 h-3.5 text-white" strokeWidth={1.5} /> Chia sẻ
          </button>
        </div>
      </div>

      {/* FIND BAR */}
      {showFind && (
        <div className="find-bar rounded-lg p-3 w-[340px]"
          style={{
            position: 'fixed',
            top: 80,
            right: 16,
            zIndex: 100050,
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}>
          <div className="flex gap-2 mb-2 items-center">
            <input
              ref={findInputRef}
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder="Tìm trong tài liệu..."
              className="flex-1 px-2.5 py-1 text-[13px]"
              style={{
                height: 28,
                background: '#FFFFFF',
                color: '#1F2937',
                border: '1px solid #CBD5E1',
                borderRadius: 4,
                outline: 'none',
                boxShadow: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#0F6CBD';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onKeyDown={e => e.key === "Enter" && handleFind()}
            />
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={handleFind}
              style={{
                background: '#0F6CBD',
                color: '#FFFFFF',
                padding: '0 12px',
                height: 28,
                borderRadius: 4,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#0A5AA8'}
              onMouseLeave={e => e.currentTarget.style.background = '#0F6CBD'}
            >
              Tìm
            </button>
            <button
              type="button"
              onClick={() => setShowReplace(v => !v)}
              style={{
                background: showReplace ? '#E2E8F0' : '#F1F5F9',
                color: '#334155',
                padding: '0 10px',
                height: 28,
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
              onMouseLeave={e => e.currentTarget.style.background = showReplace ? '#E2E8F0' : '#F1F5F9'}
            >
              {showReplace ? "Ẩn" : "Thay"}
            </button>
          </div>
          {showReplace && (
            <>
              <div className="flex gap-2 mb-2 items-center">
                <input
                  value={replaceText}
                  onChange={e => setReplaceText(e.target.value)}
                  placeholder="Thay bằng..."
                  className="flex-1 px-2.5 py-1 text-[13px]"
                  style={{
                    height: 28,
                    background: '#FFFFFF',
                    color: '#1F2937',
                    border: '1px solid #CBD5E1',
                    borderRadius: 4,
                    outline: 'none',
                    boxShadow: 'none',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#0F6CBD';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#CBD5E1';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onKeyDown={e => e.key === "Enter" && handleReplace()}
                />
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleReplace}
                  style={{
                    background: '#F1F5F9',
                    color: '#1E293B',
                    padding: '0 12px',
                    height: 28,
                    borderRadius: 4,
                    border: '1px solid #CBD5E1',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#F1F5F9'}
                >
                  Thay
                </button>
              </div>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={handleReplaceAll}
                style={{
                  width: '100%',
                  background: '#F8FAFC',
                  color: '#334155',
                  padding: '4px 0',
                  height: 28,
                  borderRadius: 4,
                  border: '1px solid #CBD5E1',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
                onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
              >
                Thay thế tất cả
              </button>
            </>
          )}
        </div>
      )}

      {/* MAIN */}
      <div className="flex-1 relative flex flex-col overflow-hidden">

        {/* FLOATING RIBBON - all tabs rendered, only active visible */}
        <div className="docx-ribbon absolute top-0 left-0 right-0 z-50 px-2 pt-[6px]" style={{ pointerEvents: "none" as any }}>
          <div className="bg-white border border-[#D7DEE8] shadow-[0_2px_8px_rgba(15,23,42,0.08)] flex items-stretch pr-1 pl-2 w-full overflow-hidden"
            style={{ height: "82px", pointerEvents: "auto" }}>
            <div className="flex items-stretch overflow-x-auto overflow-y-hidden w-full" style={{ scrollbarWidth: "none" }}>
              <div className={activeTab === "file" ? "flex" : "hidden"}>
                <RibbonFile handleSave={handleSave} handleOpen={handleOpen} clearDocument={clearDocument} exportTxt={exportTxt} handleDownloadDocx={handleDownloadDocx} setShowSource={setShowSource} setShowShortcuts={setShowShortcuts} />
              </div>
              <div className={activeTab === "home" ? "flex" : "hidden"}>
                <RibbonHome
                  bold={bold} ital={ital} uline={uline} strike={strike} align={align} fontName={fontName} fontSize={fontSize}
                  exec={exec} setAlign={setAlign} handleFontChange={handleFontChange} handleSizeChange={handleSizeChange}
                  handleTextColor={handleTextColor} handleHighlight={handleHighlight} handleStyle={handleStyle}
                  handlePaste={handlePaste} handleCut={handleCut} handleCopy={handleCopy}
                  setShowFind={setShowFind} findInputRef={findInputRef} setShowReplace={setShowReplace}
                  growFont={growFont} shrinkFont={shrinkFont} handleTextCase={handleTextCase} onAction={handleRibbonAction}
                />
              </div>
              <div className={activeTab === "insert" ? "flex" : "hidden"}>
                <RibbonInsert exec={exec} setShowTablePicker={setShowTablePicker} handleInsertImage={handleInsertImage} handleInsertLink={handleInsertLink} onAction={handleRibbonAction} />
              </div>
              <div className={activeTab === "draw" ? "flex" : "hidden"}><RibbonDraw onAction={handleRibbonAction} drawMode={drawMode} /></div>
              <div className={activeTab === "design" ? "flex" : "hidden"}><RibbonDesign onAction={handleRibbonAction} /></div>
              <div className={activeTab === "layout" ? "flex" : "hidden"}><RibbonLayout exec={exec} onAction={handleRibbonAction} /></div>
              <div className={activeTab === "ref" ? "flex" : "hidden"}><RibbonRef onAction={handleRibbonAction} /></div>
              <div className={activeTab === "mail" ? "flex" : "hidden"}><RibbonMail onAction={handleRibbonAction} /></div>
              <div className={activeTab === "review" ? "flex" : "hidden"}><RibbonReview exec={exec} editorRef={editorRef} onAction={handleRibbonAction} /></div>
              <div className={activeTab === "view" ? "flex" : "hidden"}><RibbonView zoom={zoom} setZoom={setZoom} onAction={handleRibbonAction} /></div>
              <div className={activeTab === "help" ? "flex" : "hidden"}><RibbonHelp onAction={handleRibbonAction} /></div>
            </div>
          </div>
        </div>

        {/* DOCUMENT CANVAS */}
        <div ref={docRef} className="docx-document-container flex-1 relative overflow-y-auto overflow-x-auto flex flex-col items-center pb-8"
          style={{
            paddingTop: "98px",
            scrollbarWidth: "thin",
            scrollbarColor: "#bbb transparent",
            backgroundColor: darkMode ? "#1F2937" : "#F3F5F7",
            backgroundImage: showGrid ? "linear-gradient(#DCE6F2 1px, transparent 1px), linear-gradient(90deg, #DCE6F2 1px, transparent 1px)" : undefined,
            backgroundSize: showGrid ? "20px 20px" : undefined,
          }}
          onContextMenu={handleContextMenu}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onScroll={updateRenderedPageWindow}>

          {showRuler && (
            <div className="docx-ruler h-6 mb-2 bg-white border border-[#CBD5E1] text-[9px] text-[#64748B] flex items-center justify-between px-5 shadow-sm" style={{ width: pageWidth * (zoom / 100) }}>
              {Array.from({ length: 16 }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
          )}

          {/* DYNAMIC SCALED WRAPPER FOR 100% PERFECT SCROLLING AT ANY ZOOM LEVEL */}
          {(() => {
            const scale = zoom / 100;
            const pageIndexTree = layout.pageHeightIndex || layoutEngine.pageHeightIndex;
            const pageW = layout.pages[0]?.width || pageWidth;
            const pageH = layout.pages[0]?.height || pageHeight;
            const scaledPageW = Math.round(pageW * scale);
            const scaledPageH = Math.round(pageH * scale);
            const scaledWrapperWidth = Math.max(scaledPageW + 48, pageW + 48);

            const scrollMetrics = pageIndexTree.getVirtualScrollMetrics(scale);
            const scrollRatio = scrollMetrics.scrollRatio;

            const visiblePages = layout.pages.slice(renderedPageStart, renderedPageEnd);
            const virtualTopOffset = pageIndexTree.getPageOffset(renderedPageStart) * scale;
            const topSpacerHeight = Math.round(virtualTopOffset / scrollRatio);

            const totalVirtualHeight = pageIndexTree.getTotalHeight() * scale;
            const virtualEndOffset = pageIndexTree.getPageOffset(renderedPageEnd) * scale;
            const bottomSpacerHeight = Math.max(0, Math.round((totalVirtualHeight - virtualEndOffset) / scrollRatio));

            return (
              <div
                className="docx-zoom-wrapper flex flex-col items-center justify-start pb-12"
                style={{
                  width: scaledWrapperWidth,
                  flexShrink: 0,
                }}
              >
                <div
                  ref={editorRef}
                  className="docx-page-stack flex flex-col items-center cursor-text"
                  style={{
                    width: scaledPageW,
                    minWidth: scaledPageW,
                    maxWidth: scaledPageW,
                    margin: "0 auto",
                    position: "relative",
                  }}
                >
                  <div
                    ref={optimisticOverlayRef}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      display: "none",
                      whiteSpace: "pre",
                      pointerEvents: "none",
                      zIndex: 5,
                    }}
                  />
                  {topSpacerHeight > 0 && (
                    <div
                      aria-hidden="true"
                      style={{
                        width: scaledPageW,
                        height: topSpacerHeight,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {visiblePages.map((pageLayout) => {
                    const pageIndex = pageLayout.pageIndex;
                    const pageSelRects = selectionRectsByPage.get(pageIndex) || [];
                    const pageCaret = caret && caret.pageIndex === pageIndex ? caret : null;
                    const currentScaledW = Math.round(pageLayout.width * scale);
                    const currentScaledH = Math.round(pageLayout.height * scale);

                    return (
                      <div
                        key={pageIndex}
                        className="docx-page bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12),0_4px_24px_rgba(0,0,0,0.07)]"
                        data-page-index={pageIndex}
                        onPointerDown={(e) => {
                          textInputController.focus();
                          if (e.target === e.currentTarget) {
                            pointerController.handlePointerDown(e as any, pageIndex, scale);
                          }
                        }}
                        style={{
                          width: currentScaledW,
                          minWidth: currentScaledW,
                          maxWidth: currentScaledW,
                          height: currentScaledH,
                          minHeight: currentScaledH,
                          maxHeight: currentScaledH,
                          backgroundColor: pageBackground,
                          border: pageBorder ? "1px solid #64748B" : undefined,
                          position: "relative",
                          boxSizing: "border-box",
                          overflow: "hidden",
                          flexShrink: 0,
                          margin: "0 auto 24px",
                          imageRendering: "-webkit-optimize-contrast",
                          transform: "translateZ(0)",
                        }}
                      >
                        <CanvasPage
                          page={pageLayout}
                          pageVersion={pageLayout.version}
                          zoom={scale}
                          dpr={dpr}
                          selectionRects={pageSelRects}
                          caret={pageCaret}
                          isCaretVisible={isCaretBlinkingVisible}
                          collaborators={EMPTY_COLLABORATORS}
                          findHighlights={EMPTY_FIND_HIGHLIGHTS}
                          onPointerDown={(e) => {
                            textInputController.focus();
                            pointerController.handlePointerDown(e, pageIndex, scale);
                          }}
                          onPointerMove={(e) => {
                            pointerController.handlePointerMove(e, pageIndex, scale);
                          }}
                          onPointerUp={(e) => {
                            pointerController.handlePointerUp(e);
                          }}
                          onContextMenu={handleContextMenu}
                        />
                      </div>
                    );
                  })}
                  {bottomSpacerHeight > 0 && (
                    <div
                      aria-hidden="true"
                      style={{
                        width: scaledPageW,
                        height: bottomSpacerHeight,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <textarea
                    ref={hiddenInputRef}
                    className="doc-hidden-input"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    aria-hidden="true"
                    onKeyDown={(e) => keyboardController.handleKeyDown(e.nativeEvent)}
                    onPaste={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void clipboardService.paste(e.nativeEvent);
                    }}
                    style={{
                      position: 'fixed',
                      top: '-10000px',
                      left: '-10000px',
                      width: 1,
                      height: 1,
                      opacity: 0,
                      pointerEvents: 'none',
                      zIndex: -99999,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'transparent',
                      caretColor: 'transparent',
                      resize: 'none',
                      overflow: 'hidden',
                    }}
                  />
                </div>
              </div>
            );
          })()}


          {/* IMAGE RESIZER OVERLAY (8 BLUE SQUARE HANDLES & FLOATING TOOLBAR) */}
          {selectedImgEl && imgRect && (
            <div
              className="docx-img-resizer-overlay absolute pointer-events-none"
              style={{
                top: imgRect.top,
                left: imgRect.left,
                width: imgRect.width,
                height: imgRect.height,
                border: '2px solid #0066CC',
                zIndex: 20,
                boxSizing: 'border-box',
              }}
            >
              {/* 8 Blue Square Resize Handles with White Borders */}
              {/* Top-Left */}
              <div
                onMouseDown={e => startResize("nw", e)}
                className="absolute -top-[5px] -left-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-nwse-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Top-Center */}
              <div
                onMouseDown={e => startResize("n", e)}
                className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-ns-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Top-Right */}
              <div
                onMouseDown={e => startResize("ne", e)}
                className="absolute -top-[5px] -right-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-nesw-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Middle-Right */}
              <div
                onMouseDown={e => startResize("e", e)}
                className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-ew-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Bottom-Right */}
              <div
                onMouseDown={e => startResize("se", e)}
                className="absolute -bottom-[5px] -right-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-nwse-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Bottom-Center */}
              <div
                onMouseDown={e => startResize("s", e)}
                className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-ns-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Bottom-Left */}
              <div
                onMouseDown={e => startResize("sw", e)}
                className="absolute -bottom-[5px] -left-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-nesw-resize pointer-events-auto shadow-sm z-10"
              />
              {/* Middle-Left */}
              <div
                onMouseDown={e => startResize("w", e)}
                className="absolute top-1/2 -translate-y-1/2 -left-[5px] w-[10px] h-[10px] bg-[#0066CC] border border-white cursor-ew-resize pointer-events-auto shadow-sm z-10"
              />

              {/* Floating Image Action Toolbar (Always-Visible Viewport-Aware Positioning) */}
              <div
                className="docx-img-toolbar absolute left-1/2 -translate-x-1/2 bg-white text-[#1E293B] border border-[#CBD5E1] px-2 py-1 rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.15)] flex items-center gap-1 text-[12px] font-medium pointer-events-auto z-30 whitespace-nowrap select-none"
                style={{
                  top: (() => {
                    if (!docRef.current) return -46;
                    const docScrollTop = docRef.current.scrollTop;
                    const relativeTop = imgRect.top - docScrollTop;

                    // 1. Khi đỉnh ảnh cách thanh ribbon >= 140px -> hiển thị phía trên ảnh
                    if (relativeTop >= 140) {
                      return -46;
                    }

                    // 2. Khi đỉnh ảnh trôi lên trên ribbon -> neo thanh công cụ ở 106px dưới ribbon trong tầm mắt
                    const targetTopInsideOverlay = docScrollTop + 106 - imgRect.top;
                    return Math.min(imgRect.height - 38, Math.max(10, targetTopInsideOverlay));
                  })(),
                }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.display = "block";
                      selectedImgEl.style.marginLeft = "0";
                      selectedImgEl.style.marginRight = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                  title="Căn trái"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span>Trái</span>
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.display = "block";
                      selectedImgEl.style.marginLeft = "auto";
                      selectedImgEl.style.marginRight = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                  title="Căn giữa"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                  <span>Giữa</span>
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.display = "block";
                      selectedImgEl.style.marginLeft = "auto";
                      selectedImgEl.style.marginRight = "0";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                  title="Căn phải"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                  <span>Phải</span>
                </button>
                <span className="w-[1px] h-4 bg-[#CBD5E1] mx-1" />
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
                  onClick={moveImageUp}
                  title="Di chuyển ảnh lên trên (Alt + Mũi tên Lên)"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Lên</span>
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
                  onClick={moveImageDown}
                  title="Di chuyển ảnh xuống dưới (Alt + Mũi tên Xuống)"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Xuống</span>
                </button>
                <span className="w-[1px] h-4 bg-[#CBD5E1] mx-1" />
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#475569] transition-colors"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.width = "30%";
                      selectedImgEl.style.height = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                >
                  30%
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#475569] transition-colors"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.width = "50%";
                      selectedImgEl.style.height = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                >
                  50%
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#475569] transition-colors"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.width = "75%";
                      selectedImgEl.style.height = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                >
                  75%
                </button>
                <button
                  type="button"
                  className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#475569] transition-colors"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.style.width = "100%";
                      selectedImgEl.style.height = "auto";
                      updateSelectedImgRect();
                      syncAll();
                    }
                  }}
                >
                  100%
                </button>
                <span className="w-[1px] h-4 bg-[#CBD5E1] mx-1" />
                <button
                  type="button"
                  className="p-1.5 hover:bg-[#FEE2E2] rounded text-[#E11D48] hover:text-[#BE123C] transition-colors flex items-center justify-center"
                  onClick={() => {
                    if (selectedImgEl) {
                      selectedImgEl.remove();
                      setSelectedImgEl(null);
                      syncAll();
                    }
                  }}
                  title="Xóa ảnh (Delete / Backspace)"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* FLOATING QUICK TABLE TOOLBAR */}
        {activeTableInfo && (
          <div
            className="docx-table-toolbar fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-[#1E293B] border border-[#CBD5E1] px-3 py-1.5 rounded-lg shadow-[0_6px_20px_rgba(0,0,0,0.18)] flex items-center gap-1.5 text-[12px] font-medium pointer-events-auto z-40 whitespace-nowrap select-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 pr-2 border-r border-[#E2E8F0] text-[#0F6CBD] font-bold">
              <TableIcon className="w-4 h-4" strokeWidth={1.8} />
              <span>Bảng dữ liệu</span>
            </div>
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
              onClick={() => exec("insertTableRowAbove")}
              title="Chèn hàng lên trên"
            >
              <ArrowUp className="w-3.5 h-3.5 text-[#0F6CBD]" />
              <span>+Hàng trên</span>
            </button>
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
              onClick={() => exec("insertTableRowBelow")}
              title="Chèn hàng xuống dưới"
            >
              <ArrowDown className="w-3.5 h-3.5 text-[#0F6CBD]" />
              <span>+Hàng dưới</span>
            </button>
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
              onClick={() => exec("insertTableColumnLeft")}
              title="Chèn cột bên trái"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#0F6CBD]" />
              <span>+Cột trái</span>
            </button>
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#EEF4FB] hover:text-[#0F6CBD] rounded text-[#334155] transition-colors flex items-center gap-1"
              onClick={() => exec("insertTableColumnRight")}
              title="Chèn cột bên phải"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[#0F6CBD]" />
              <span>+Cột phải</span>
            </button>
            <span className="w-[1px] h-4 bg-[#CBD5E1] mx-0.5" />
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#FEF2F2] hover:text-[#DC2626] rounded text-[#64748B] transition-colors flex items-center gap-1"
              onClick={() => exec("deleteTableRow")}
              title="Xóa hàng hiện tại"
            >
              <Minus className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>-Hàng</span>
            </button>
            <button
              type="button"
              className="px-2 py-1 hover:bg-[#FEF2F2] hover:text-[#DC2626] rounded text-[#64748B] transition-colors flex items-center gap-1"
              onClick={() => exec("deleteTableColumn")}
              title="Xóa cột hiện tại"
            >
              <Minus className="w-3.5 h-3.5 text-[#DC2626]" />
              <span>-Cột</span>
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-[#FEF2F2] rounded text-[#DC2626] hover:text-[#B91C1C] transition-colors flex items-center justify-center"
              onClick={() => exec("deleteTable")}
              title="Xóa toàn bộ bảng"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        )}

        {showNavigation && (
          <aside className="absolute top-[98px] right-4 z-20 w-[220px] max-h-[55%] overflow-auto bg-white border border-[#CBD5E1] shadow-lg p-3 text-[12px]">
            <div className="flex items-center justify-between mb-2"><strong>Dàn bài</strong><button type="button" onClick={() => setShowNavigation(false)} className="text-[#64748B]" title="Đóng"><X className="w-4 h-4" /></button></div>
            {Array.from(editorRef.current?.querySelectorAll("h1, h2") || []).length ? Array.from(editorRef.current?.querySelectorAll<HTMLElement>("h1, h2") || []).map((heading, index) => {
              const id = heading.id || `docx-nav-${index}`;
              heading.id = id;
              return <button type="button" key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" })} className={`block w-full text-left px-2 py-1 hover:bg-[#EAF3FF] ${heading.tagName === "H2" ? "pl-5" : "font-semibold"}`}>{heading.textContent || `Tiêu đề ${index + 1}`}</button>;
            }) : <p className="m-0 text-[#64748B]">Dùng Tiêu đề 1 hoặc Tiêu đề 2 để tạo dàn bài.</p>}
          </aside>
        )}

        {notice && (
          <div
            className="absolute right-4 bottom-8 z-50 max-w-[340px] rounded-lg bg-[#1E293B] text-white px-3.5 py-2 text-[12.5px] shadow-[0_8px_24px_rgba(0,0,0,0.3)] border border-[#334155] flex items-center"
            style={{ pointerEvents: 'auto', animation: 'fadeIn 0.2s ease-out' }}
          >
            <span className="font-medium leading-snug">{notice}</span>
          </div>
        )}

        {/* STATUS BAR */}
        <div className="h-[22px] bg-[#f5f5f5] border-t border-[#d0d0d0] text-[#555] flex items-center justify-between px-4 text-[11px] shrink-0">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditingName(true)} className="hover:text-[#0F6CBD] text-[#555] font-semibold">{docName}</button>
            <span className="text-[#bbb]">|</span>
            <span>{words} từ</span>
            <span className="text-[#bbb]">|</span>
            <span>{chars} ký tự</span>
            <span className="text-[#bbb]">|</span>
            <span>{paras} đoạn</span>
            <span className="text-[#bbb]">|</span>
            <button
              type="button"
              onClick={() => {
                const target = window.prompt(`Nhập số trang muốn chuyển tới (1 - ${totalPages.toLocaleString()}):`, String(currentPage));
                if (target) {
                  const pNum = parseInt(target, 10);
                  if (!isNaN(pNum)) jumpToPage(pNum);
                }
              }}
              className="hover:bg-[#e0e7ff] text-[#0F6CBD] font-medium px-1.5 py-0.5 rounded transition-colors"
              title="Nhấp để chuyển nhanh tới trang bất kỳ"
            >
              Trang {currentPage} / {totalPages.toLocaleString()}
            </button>
            <button
              type="button"
              onClick={() => setShowPerfHud(v => !v)}
              className={`hover:bg-[#e2e8f0] px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-colors ${showPerfHud ? 'bg-[#38BDF8]/20 text-[#0284C7]' : 'text-[#64748B]'}`}
              title="Bật/Tắt HUD Giám sát Hiệu năng (Ctrl+Alt+P)"
            >
              ⚡ {perfStats?.fps ? `${perfStats.fps} FPS` : 'FPS'}
            </button>
            {selInfo && (
              <><span className="text-[#bbb]">|</span><span className="text-[#0F6CBD]">{selInfo}</span></>
            )}
            <button type="button" onClick={() => setShowStats(true)} className="hover:bg-[#e5e5e5] px-1 rounded" title="Thống kê tài liệu">
              <LayoutGrid className="w-3 h-3 text-[#555]" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDarkMode(v => !v)} className="hover:bg-[#e5e5e5] p-0.5 rounded" title={darkMode ? "Chế độ sáng" : "Chế độ tối"}>
              {darkMode ? <Sun className="w-3 h-3 text-[#c94f2a]" strokeWidth={1.5} /> : <Moon className="w-3 h-3 text-[#555]" strokeWidth={1.5} />}
            </button>
            <button type="button" onClick={() => setShowEmoji(v => !v)} className="hover:bg-[#e5e5e5] p-0.5 rounded" title="Chèn biểu tượng cảm xúc">
              <SmilePlus className="w-3 h-3 text-[#555]" strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-1.5 select-none">
              <button type="button" className="hover:bg-[#e5e5e5] p-0.5 rounded text-[#555]" onClick={() => setZoom(v => Math.max(10, v - 10))} title="Thu nhỏ (-10%)"><ZoomOut className="w-3.5 h-3.5" strokeWidth={1.6} /></button>
              <div
                className="w-[90px] h-[18px] flex items-center cursor-pointer select-none touch-none px-1"
                onPointerDown={handleZoomSliderPointerDown}
                title={`Thu phóng: ${zoom}% (Kéo để điều chỉnh tối đa 500%)`}
              >
                <div className="w-full h-[4px] bg-[#CBD5E1] rounded-full relative">
                  <div className="h-full bg-[#0F6CBD] rounded-full" style={{ width: `${Math.max(0, Math.min(100, (zoom - 10) / 490 * 100))}%` }} />
                  <div
                    className="w-[12px] h-[12px] bg-white border-2 border-[#0F6CBD] rounded-full absolute top-1/2 -translate-y-1/2 shadow-sm transition-transform active:scale-125"
                    style={{ left: `calc(${Math.max(0, Math.min(100, (zoom - 10) / 490 * 100))}% - 6px)` }}
                  />
                </div>
              </div>
              <button type="button" className="hover:bg-[#e5e5e5] p-0.5 rounded text-[#555]" onClick={() => setZoom(v => Math.min(500, v + 10))} title="Phóng to (+10%)"><ZoomIn className="w-3.5 h-3.5" strokeWidth={1.6} /></button>
              <span className="w-[46px] text-right font-semibold text-[11px] text-[#334155] cursor-pointer hover:text-[#0F6CBD]" onClick={() => setZoom(100)} title="Nhấp để về 100%">{zoom}%</span>
            </div>
          </div>
        </div>

        {/* STATS DIALOG */}
        {showStats && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20" onClick={() => setShowStats(false)}>
            <div className="bg-white rounded-xl shadow-xl p-6 w-[320px]" onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-[#1f1f1f] mb-4">Thống kê tài liệu</h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="bg-[#f8f8f8] rounded-lg p-3"><span className="text-[#999] block">Số từ</span><span className="text-[20px] font-bold text-[#1f1f1f]">{words}</span></div>
                <div className="bg-[#f8f8f8] rounded-lg p-3"><span className="text-[#999] block">Ký tự</span><span className="text-[20px] font-bold text-[#1f1f1f]">{chars}</span></div>
                <div className="bg-[#f8f8f8] rounded-lg p-3"><span className="text-[#999] block">Đoạn</span><span className="text-[20px] font-bold text-[#1f1f1f]">{paras}</span></div>
                <div className="bg-[#f8f8f8] rounded-lg p-3"><span className="text-[#999] block">Dòng</span><span className="text-[20px] font-bold text-[#1f1f1f]">{lines}</span></div>
              </div>
              <button type="button" onClick={() => setShowStats(false)} className="w-full mt-4 bg-[#0F6CBD] text-white rounded-lg py-2 text-[13px] font-semibold hover:bg-[#0a5aa8]">Đóng</button>
            </div>
          </div>
        )}

        {/* EMOJI PICKER */}
        {showEmoji && (
          <div className="fixed bottom-[30px] right-4 z-[200] bg-white border border-[#d0d0d0] rounded-xl shadow-xl p-3 w-[320px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-[#333]">Biểu tượng cảm xúc</span>
              <button type="button" onClick={() => setShowEmoji(false)} className="text-[#999] hover:text-[#333]"><X className="w-3 h-3" strokeWidth={2} /></button>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {emojiList.map((emoji, i) => (
                <button type="button" key={i} onClick={() => { exec("insertHTML", emoji); setShowEmoji(false); }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-[#f0f0f0] rounded text-[16px]">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TABLE PICKER MODAL */}
        {showTablePicker && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20" onClick={() => setShowTablePicker(false)}>
            <div className="bg-white rounded-xl shadow-xl p-6 w-[280px]" onClick={e => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-[#1f1f1f] mb-3">Chèn bảng</h3>
              <div className="grid grid-cols-[repeat(5,40px)] gap-1 mb-4 justify-center">
                {Array.from({length:25}).map((_, i) => {
                  const r = Math.floor(i/5)+1, c = (i%5)+1;
                  return <button type="button" key={i} onClick={() => handleInsertTable(r, c)}
                    className="w-[40px] h-[30px] border border-[#ccc] hover:bg-[#0F6CBD]/10 hover:border-[#0F6CBD] rounded text-[10px] text-[#999]"
                    title={`${r} hàng, ${c} cột`}>
                    {r}x{c}
                  </button>;
                })}
              </div>
              <button type="button" onClick={() => setShowTablePicker(false)} className="w-full bg-[#f0f0f0] text-[#555] rounded-lg py-1.5 text-[12px]">Hủy</button>
            </div>
          </div>
        )}

        {/* HTML SOURCE VIEW */}
        {showSource && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={() => setShowSource(false)}>
            <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[80vh]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-[#e5e5e5]">
                <h3 className="text-[15px] font-bold text-[#1f1f1f]">Mã nguồn HTML</h3>
                <button type="button" onClick={() => setShowSource(false)} className="text-[#999] hover:text-[#333] p-1"><X className="w-4 h-4" strokeWidth={2} /></button>
              </div>
              <textarea
                defaultValue={getDocumentHtml()}
                className="source-textarea w-full p-4 font-mono text-[13px] text-[#1f1f1f] border-0 outline-none resize-none"
                style={{ minHeight: "300px", maxHeight: "60vh" }}
                onChange={e => { /* live preview could go here */ }}
              />
              <div className="flex justify-end gap-2 p-3 border-t border-[#e5e5e5]">
                <button type="button" onClick={() => setShowSource(false)} className="px-4 py-2 text-[13px] text-[#555] bg-[#f0f0f0] rounded-lg hover:bg-[#e5e5e5]">Hủy</button>
                <button type="button" onClick={() => {
                  const ta = document.querySelector(".source-textarea") as HTMLTextAreaElement;
                  if (ta) setDocumentHtml(ta.value);
                  window.requestAnimationFrame(syncAll);
                  setShowSource(false);
                }} className="px-4 py-2 text-[13px] text-white bg-[#0F6CBD] rounded-lg hover:bg-[#0a5aa8]">Áp dụng</button>
              </div>
            </div>
          </div>
        )}

        {/* KEYBOARD SHORTCUTS */}
        {showShortcuts && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20" onClick={() => setShowShortcuts(false)}>
            <div className="bg-white rounded-xl shadow-xl p-5 w-[400px]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[16px] font-bold text-[#1f1f1f]">Phím tắt</h3>
                <button type="button" onClick={() => setShowShortcuts(false)} className="text-[#999] hover:text-[#333]"><X className="w-4 h-4" strokeWidth={2} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                {[
                  ["Ctrl+B", "Đậm"],
                  ["Ctrl+I", "Nghiêng"],
                  ["Ctrl+U", "Gạch chân"],
                  ["Ctrl+C", "Sao chép"],
                  ["Ctrl+X", "Cắt"],
                  ["Ctrl+V", "Dán"],
                  ["Ctrl+Z", "Hoàn tác"],
                  ["Ctrl+Y", "Làm lại"],
                  ["Ctrl+A", "Chọn tất cả"],
                  ["Ctrl+S", "Lưu"],
                  ["Ctrl+F", "Tìm kiếm"],
                  ["Ctrl+H", "Thay thế"],
                  ["Ctrl+Home", "Về đầu"],
                  ["Ctrl+End", "Xuống cuối"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2 p-1.5 rounded hover:bg-[#f8f8f8]">
                    <kbd className="bg-[#f0f0f0] border border-[#ddd] rounded px-1.5 py-0.5 text-[11px] font-mono min-w-[60px] text-center">{key}</kbd>
                    <span className="text-[#555]">{desc}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setShowShortcuts(false)} className="w-full mt-3 bg-[#f0f0f0] text-[#555] rounded-lg py-2 text-[13px] hover:bg-[#e5e5e5]">Đóng</button>
            </div>
          </div>
        )}
      </div>

      {/* CONTEXT MENU */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="docx-menu fixed z-[100] bg-white border border-[#94A3B8] shadow-[0_2px_6px_rgba(15,23,42,0.14)] py-1 min-w-[200px] text-[13px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button type="button" onClick={handleCtxPaste} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <Clipboard className="w-3.5 h-3.5 text-[#c99a3a]" strokeWidth={1.5} /><span>Dán</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+V</span>
          </button>
          <button type="button" onClick={handleCtxCopy} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <Copy className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Sao chép</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+C</span>
          </button>
          <button type="button" onClick={handleCtxCut} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <Scissors className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Cắt</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+X</span>
          </button>
          <div className="h-[1px] bg-[#e5e5e5] my-1" />
          <button type="button" onClick={() => handleCtxCmd("bold")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <span className="w-3.5 text-center font-bold text-[13px]">B</span><span>Đậm</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+B</span>
          </button>
          <button type="button" onClick={() => handleCtxCmd("italic")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <span className="w-3.5 text-center italic text-[13px] font-serif">I</span><span>Nghiêng</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+I</span>
          </button>
          <button type="button" onClick={() => handleCtxCmd("underline")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <span className="w-3.5 text-center underline text-[13px]">U</span><span>Gạch chân</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+U</span>
          </button>
          <div className="h-[1px] bg-[#e5e5e5] my-1" />
          <button type="button" onClick={() => handleCtxCmd("justifyLeft")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <AlignLeft className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Căn trái</span>
          </button>
          <button type="button" onClick={() => handleCtxCmd("justifyCenter")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <AlignCenter className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Căn giữa</span>
          </button>
          <button type="button" onClick={() => handleCtxCmd("justifyRight")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <AlignRight className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Căn phải</span>
          </button>
          <div className="h-[1px] bg-[#e5e5e5] my-1" />
          <button type="button" onClick={() => handleCtxCmd("insertUnorderedList")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <List className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Danh sách</span>
          </button>
          <button type="button" onClick={() => handleCtxCmd("insertOrderedList")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <ListOrdered className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Danh sách số</span>
          </button>
          <div className="h-[1px] bg-[#e5e5e5] my-1" />
          <button type="button" onClick={() => handleCtxCmd("selectAll")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
            <TextCursorInput className="w-3.5 h-3.5 text-[#555]" strokeWidth={1.5} /><span>Chọn tất cả</span><span className="ml-auto text-[10px] text-[#999]">Ctrl+A</span>
          </button>
          {activeTableInfo && (
            <>
              <div className="h-[1px] bg-[#e5e5e5] my-1" />
              <div className="px-3 py-1 text-[11px] font-bold text-[#0F6CBD] uppercase tracking-wider flex items-center gap-1.5 bg-[#F8FAFC]">
                <TableIcon className="w-3.5 h-3.5 text-[#0F6CBD]" /> Thao tác Bảng
              </div>
              <button type="button" onClick={() => handleCtxCmd("insertTableRowAbove")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
                <ArrowUp className="w-3.5 h-3.5 text-[#0F6CBD]" strokeWidth={1.5} /><span>Chèn hàng lên trên</span>
              </button>
              <button type="button" onClick={() => handleCtxCmd("insertTableRowBelow")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
                <ArrowDown className="w-3.5 h-3.5 text-[#0F6CBD]" strokeWidth={1.5} /><span>Chèn hàng xuống dưới</span>
              </button>
              <button type="button" onClick={() => handleCtxCmd("insertTableColumnLeft")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
                <ArrowLeft className="w-3.5 h-3.5 text-[#0F6CBD]" strokeWidth={1.5} /><span>Chèn cột bên trái</span>
              </button>
              <button type="button" onClick={() => handleCtxCmd("insertTableColumnRight")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#f0f0f0] text-left">
                <ArrowRight className="w-3.5 h-3.5 text-[#0F6CBD]" strokeWidth={1.5} /><span>Chèn cột bên phải</span>
              </button>
              <div className="h-[1px] bg-[#e5e5e5] my-1" />
              <button type="button" onClick={() => handleCtxCmd("deleteTableRow")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#FEF2F2] text-[#DC2626] text-left">
                <Minus className="w-3.5 h-3.5 text-[#DC2626]" strokeWidth={1.5} /><span>Xóa hàng này</span>
              </button>
              <button type="button" onClick={() => handleCtxCmd("deleteTableColumn")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#FEF2F2] text-[#DC2626] text-left">
                <Minus className="w-3.5 h-3.5 text-[#DC2626]" strokeWidth={1.5} /><span>Xóa cột này</span>
              </button>
              <button type="button" onClick={() => handleCtxCmd("deleteTable")} className="w-full flex items-center gap-3 px-3 py-1.5 hover:bg-[#FEF2F2] text-[#DC2626] text-left">
                <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" strokeWidth={1.5} /><span>Xóa toàn bộ bảng</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 100% IDENTICAL SCOPED STYLES FROM OFFICEVKY */}
      <style>{`
        .editor-wrap button {
          border: 0;
          background: transparent;
          outline: 0;
          cursor: pointer;
          font-family: inherit;
        }
        .editor-wrap button:focus {
          outline: 0;
        }
        /* Keep the document chrome completely stable when the pointer moves over it. */
        .editor-wrap .docx-title-bar {
          min-width: 0;
          overflow: hidden;
          isolation: isolate;
        }
        .editor-wrap .docx-title-start {
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
        }
        .editor-wrap .docx-title-history,
        .editor-wrap .docx-window-actions,
        .editor-wrap .docx-window-controls {
          flex: 0 0 auto;
        }
        .editor-wrap .docx-window-actions {
          margin-left: auto;
        }
        .editor-wrap .docx-title-tool {
          flex: 0 0 auto;
          transition: none !important;
          transform: none !important;
        }
        .editor-wrap .docx-title-tool:hover {
          background: #F3F6F9 !important;
        }
        .editor-wrap .docx-window-control {
          width: 44px !important;
          height: 42px !important;
          flex: 0 0 44px !important;
          color: #1F1F1F !important;
          transition: none !important;
          transform: none !important;
          background: transparent !important;
        }
        .editor-wrap .docx-window-control:hover {
          background: #E5E7EB !important;
          color: #000000 !important;
        }
        .editor-wrap .docx-window-close:hover {
          background: #E81123 !important;
          color: #FFFFFF !important;
        }
        .editor-wrap .docx-tab-bar,
        .editor-wrap .docx-ribbon,
        .editor-wrap .docx-ribbon *,
        .editor-wrap .docx-tab-bar * {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        .editor-wrap .docx-tab-bar::-webkit-scrollbar,
        .editor-wrap .docx-ribbon::-webkit-scrollbar,
        .editor-wrap .docx-ribbon *::-webkit-scrollbar,
        .editor-wrap .docx-tab-bar *::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        .editor-wrap .docx-tab-bar > div:first-child button {
          border-top-left-radius: 4px !important;
          border-top-right-radius: 4px !important;
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          transition: background-color 0.15s ease, color 0.15s ease !important;
          transform: none !important;
          outline: none !important;
        }
        .editor-wrap .docx-tab-bar > div:first-child button:hover {
          background: #F3F6F9 !important;
          border-top-left-radius: 4px !important;
          border-top-right-radius: 4px !important;
        }
        .editor-wrap .docx-tab-bar > div:first-child button:active {
          background: #EBF1F8 !important;
          border-top-left-radius: 4px !important;
          border-top-right-radius: 4px !important;
        }
        .editor-wrap .docx-action-btn:hover {
          background: #F3F4F6 !important;
          border-color: #CBD5E1 !important;
          color: #1F2937 !important;
        }
        .editor-wrap .docx-action-btn-primary:hover {
          background: #0A5AA8 !important;
          color: #FFFFFF !important;
        }
        .editor-wrap .docx-ribbon-btn {
          min-width: 24px;
          min-height: 24px;
        }
        .editor-wrap .docx-ribbon-btn.flex-col {
          width: 54px !important;
          height: 54px !important;
          min-width: 54px !important;
          min-height: 54px !important;
          flex: 0 0 54px !important;
        }
        .editor-wrap .docx-ribbon-btn.flex-col > span {
          max-width: 50px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .editor-wrap .docx-ribbon-group {
          min-width: max-content;
        }
        .editor-wrap .docx-select-shell {
          border-color: #CBD5E1 !important;
          border-radius: 3px !important;
          box-shadow: none !important;
          outline: none !important;
        }
        .editor-wrap .docx-select-shell:hover {
          border-color: #94A3B8 !important;
        }
        .editor-wrap .docx-select-shell:focus-within,
        .editor-wrap .docx-select-shell:focus,
        .editor-wrap .docx-select-shell:active {
          border-color: #94A3B8 !important;
          box-shadow: none !important;
          outline: none !important;
        }
        .editor-wrap .docx-native-select,
        .editor-wrap .docx-native-select:focus,
        .editor-wrap .docx-native-select:active {
          border-radius: 0;
          color: #1F2937;
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
        .editor-wrap .docx-menu button:hover {
          background: #EAF3FF;
        }
        .editor-wrap .docx-page-editor {
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
          box-sizing: border-box !important;
        }
        .editor-wrap .docx-page-editor table {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          box-sizing: border-box !important;
          margin: 10px 0 !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }
        .editor-wrap .docx-page-editor tr {
          box-sizing: border-box !important;
          max-width: 100% !important;
        }
        .editor-wrap .docx-page-editor td,
        .editor-wrap .docx-page-editor th {
          box-sizing: border-box !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          white-space: normal !important;
          overflow: hidden !important;
          padding: 6px 8px !important;
          vertical-align: top !important;
        }
        .editor-wrap .docx-page-editor p,
        .editor-wrap .docx-page-editor div,
        .editor-wrap .docx-page-editor span,
        .editor-wrap .docx-page-editor h1,
        .editor-wrap .docx-page-editor h2,
        .editor-wrap .docx-page-editor h3,
        .editor-wrap .docx-page-editor blockquote,
        .editor-wrap .docx-page-editor pre {
          max-width: 100% !important;
          box-sizing: border-box !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
        }
        .editor-wrap .docx-page-editor.docx-show-format p::after {
          content: " ¶";
          color: #94A3B8;
          font-size: 11px;
        }
        .editor-wrap .docx-page-editor.docx-track-changes {
          box-shadow: inset 3px 0 0 #0F6CBD;
        }
        .editor-wrap .docx-page-editor.docx-line-numbers {
          background-image: linear-gradient(to bottom, transparent 31px, rgba(148, 163, 184, .32) 32px);
          background-size: 100% 32px;
        }
        .editor-wrap .docx-page-editor[contenteditable="false"] {
          cursor: default;
        }
        .editor-wrap .docx-page-editor img {
          cursor: grab !important;
          user-select: none !important;
          -webkit-user-drag: element !important;
          max-width: 100%;
        }
        .editor-wrap .docx-page-editor img:hover {
          cursor: grab !important;
        }
        .editor-wrap .docx-page-editor img:active {
          cursor: grabbing !important;
        }
        .editor-wrap .docx-img-resizer-overlay {
          cursor: grab;
        }
        @media (max-width: 900px) {
          .editor-wrap .docx-title-search,
          .editor-wrap .docx-document-name,
          .editor-wrap .docx-user-actions,
          .editor-wrap .docx-tab-actions {
            display: none;
          }
          .editor-wrap .docx-tab-bar {
            overflow-x: auto;
          }
          .editor-wrap .docx-tab-bar > div:first-child {
            min-width: max-content;
          }
          .editor-wrap .docx-ribbon {
            overflow-x: auto;
            padding-left: 0;
            padding-right: 0;
          }
          .editor-wrap .docx-ribbon > div {
            min-width: max-content;
          }
        }
        @media (max-width: 520px) {
          .editor-wrap .docx-title-bar {
            padding-left: 2px;
            padding-right: 0;
          }
          .editor-wrap .docx-title-start {
            gap: 0;
          }
          .editor-wrap .docx-title-brand {
            display: none;
          }
          .editor-wrap .docx-title-tool {
            width: 30px !important;
            height: 32px !important;
            flex-basis: 30px !important;
          }
          .editor-wrap .docx-window-controls,
          .editor-wrap .docx-window-control {
            height: 32px !important;
          }
          .editor-wrap .docx-window-control {
            width: 34px !important;
            flex-basis: 34px !important;
          }
        }
        @media (max-width: 360px) {
          .editor-wrap .docx-title-history {
            display: none;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .editor-wrap,
          .editor-wrap .docx-page-stack,
          .editor-wrap .docx-page-stack * {
            visibility: visible;
          }
          .editor-wrap {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            overflow: visible !important;
          }
          .editor-wrap .docx-title-bar,
          .editor-wrap .docx-ribbon,
          .editor-wrap .docx-ruler,
          .editor-wrap .docx-img-resizer-overlay,
          .editor-wrap .docx-img-toolbar,
          .editor-wrap .docx-status-bar {
            display: none !important;
          }
          .editor-wrap .docx-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
          }
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c0c0c0; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a0a0a0; }
        [contenteditable]:focus { outline: none; }
        [contenteditable] h1 { font-size: 24px; font-weight: bold; margin: 12px 0; }
        [contenteditable] h2 { font-size: 20px; font-weight: bold; margin: 10px 0; }
        [contenteditable] blockquote { border-left: 3px solid #0F6CBD; padding-left: 12px; margin: 8px 0; color: #555; font-style: italic; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 30px; margin: 6px 0; }
        [contenteditable] hr { margin: 12px 0; border: none; border-top: 1px solid #ccc; }
      `}</style>

      {/* PERFORMANCE DIAGNOSTICS HUD */}
      {showPerfHud && perfStats && (
        <div
          className="fixed bottom-10 right-6 z-50 bg-[#0F172A]/90 text-white rounded-lg p-3 text-[11px] font-mono shadow-2xl backdrop-blur border border-slate-700 pointer-events-none select-none"
          style={{ minWidth: 230 }}
        >
          <div className="flex items-center justify-between font-bold border-b border-slate-700 pb-1 mb-2 text-[#38BDF8]">
            <span>⚡ NOM ENGINE HUD</span>
            <span className={perfStats.fps >= 50 ? "text-emerald-400" : "text-amber-400"}>{perfStats.fps} FPS</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-slate-400">Input Latency:</span>
            <span className="text-right text-emerald-300 font-semibold">{perfStats.inputLatencyMs} ms</span>
            <span className="text-slate-400">Layout Time:</span>
            <span className="text-right text-emerald-300 font-semibold">{perfStats.layoutTimeMs} ms</span>
            <span className="text-slate-400">Mounted Pages:</span>
            <span className="text-right text-sky-300 font-semibold">{perfStats.mountedPages} / {perfStats.totalPages.toLocaleString()}</span>
            <span className="text-slate-400">Layout Cache:</span>
            <span className="text-right text-indigo-300 font-semibold">{perfStats.cacheSize} pgs</span>
            <span className="text-slate-400">Memory (Est):</span>
            <span className="text-right text-violet-300 font-semibold">{perfStats.memoryEstimateMB} MB</span>
            <span className="text-slate-400">Dropped Frames:</span>
            <span className="text-right text-slate-400 font-semibold">{perfStats.droppedFrames}</span>
          </div>
        </div>
      )}
    </div>
  );
};
