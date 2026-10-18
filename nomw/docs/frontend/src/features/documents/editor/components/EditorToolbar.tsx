import React, { useState, useRef, useEffect } from 'react';
import { CommandRegistry } from '../core/commands/command-registry';
import { TextMarks, ParagraphStyle, ParagraphPreset, ListType } from '../core/model/types';
import { AVAILABLE_FONTS } from '../core/fonts/font-manager';
import {
  Undo2,
  Redo2,
  Printer,
  Minus,
  Plus,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Baseline,
  Highlighter,
  Link as LinkIcon,
  MessageSquarePlus,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListTodo,
  Outdent,
  Indent,
  Eraser,
  ChevronDown,
} from 'lucide-react';

interface EditorToolbarProps {
  commands: CommandRegistry;
  activeMarks: TextMarks;
  activeParagraphStyle: ParagraphStyle;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  onOpenInsertImage: () => void;
  onOpenInsertLink: () => void;
  onAddComment: () => void;
  onPrint: () => void;
}

const COLOR_PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
];

const HIGHLIGHT_PALETTE = [
  'transparent', '#FFF9C4', '#C8E6C9', '#B3E5FC', '#F8BBD0', '#E1BEE7',
  '#FFE0B2', '#FFCDD2', '#D7CCC8', '#CFD8DC', '#FFEB3B', '#4CAF50',
];

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  commands,
  activeMarks,
  activeParagraphStyle,
  zoom,
  onSetZoom,
  onOpenInsertImage,
  onOpenInsertLink,
  onAddComment,
  onPrint,
}) => {
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = useState(false);
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTextColorOpen(false);
        setHighlightColorOpen(false);
        setStyleDropdownOpen(false);
        setFontDropdownOpen(false);
        setAlignDropdownOpen(false);
        setLineSpacingOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const fontSize = activeMarks.fontSize || 11;
  const fontFamily = activeMarks.fontFamily || 'Arial';

  const toolBtnStyle = (active = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    minWidth: 28,
    padding: '0 4px',
    borderRadius: 4,
    border: 'none',
    background: active ? '#D3E3FD' : 'transparent',
    color: active ? '#041E49' : '#444746',
    cursor: 'pointer',
    transition: 'background 0.1s',
  });

  const divider = <div style={{ width: 1, height: 18, background: '#E0E0E0', margin: '0 4px' }} />;

  return (
    <div
      ref={containerRef}
      className="doc-format-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 38,
        minHeight: 38,
        padding: '0 12px',
        background: '#EDF2FA',
        borderBottom: '1px solid #E0E0E0',
        borderRadius: 20,
        margin: '2px 12px',
        userSelect: 'none',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: 2,
      }}
    >
      {/* Undo / Redo / Print */}
      <button
        type="button"
        title="Hoàn tác (Ctrl+Z)"
        style={toolBtnStyle()}
        onClick={() => commands.execute('undo')}
      >
        <Undo2 size={16} />
      </button>

      <button
        type="button"
        title="Làm lại (Ctrl+Y)"
        style={toolBtnStyle()}
        onClick={() => commands.execute('redo')}
      >
        <Redo2 size={16} />
      </button>

      <button
        type="button"
        title="In ấn (Ctrl+P)"
        style={toolBtnStyle()}
        onClick={onPrint}
      >
        <Printer size={16} />
      </button>

      {divider}

      {/* Zoom Dropdown */}
      <select
        value={zoom}
        onChange={(e) => onSetZoom(parseFloat(e.target.value))}
        style={{
          height: 26,
          borderRadius: 4,
          border: '1px solid transparent',
          background: 'transparent',
          fontSize: 12.5,
          color: '#444746',
          padding: '0 4px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value={0.5}>50%</option>
        <option value={0.75}>75%</option>
        <option value={0.9}>90%</option>
        <option value={1.0}>100%</option>
        <option value={1.1}>110%</option>
        <option value={1.25}>125%</option>
        <option value={1.5}>150%</option>
        <option value={2.0}>200%</option>
      </select>

      {divider}

      {/* Paragraph Style Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
          style={{
            ...toolBtnStyle(),
            padding: '0 6px',
            fontSize: 13,
            gap: 4,
            minWidth: 110,
            justifyContent: 'space-between',
          }}
        >
          <span>Văn bản thường</span>
          <ChevronDown size={14} />
        </button>

        {styleDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#FFFFFF',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              border: '1px solid #DADCE0',
              zIndex: 1000,
              minWidth: 160,
              padding: '4px 0',
            }}
          >
            {[
              { label: 'Văn bản thường', preset: 'normal', fontSize: 13 },
              { label: 'Tiêu đề lớn', preset: 'title', fontSize: 18, bold: true },
              { label: 'Phụ đề', preset: 'subtitle', fontSize: 14, color: '#5F6368' },
              { label: 'Tiêu đề 1', preset: 'h1', fontSize: 16, bold: true },
              { label: 'Tiêu đề 2', preset: 'h2', fontSize: 14.5, bold: true },
              { label: 'Tiêu đề 3', preset: 'h3', fontSize: 13.5, bold: true },
            ].map((s) => (
              <button
                key={s.preset}
                type="button"
                onClick={() => {
                  commands.execute('setParagraphPreset', s.preset);
                  setStyleDropdownOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 14px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: s.fontSize,
                  fontWeight: s.bold ? 700 : 400,
                  color: s.color || '#202124',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {divider}

      {/* Font Family Dropdown */}
      <select
        value={fontFamily}
        onChange={(e) => commands.execute('setFontFamily', e.target.value)}
        style={{
          height: 26,
          borderRadius: 4,
          border: '1px solid transparent',
          background: 'transparent',
          fontSize: 13,
          color: '#444746',
          padding: '0 4px',
          maxWidth: 120,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {AVAILABLE_FONTS.map((f) => (
          <option key={f.family} value={f.family}>
            {f.name}
          </option>
        ))}
      </select>

      {divider}

      {/* Font Size controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <button
          type="button"
          title="Giảm cỡ chữ"
          style={toolBtnStyle()}
          onClick={() => commands.execute('setFontSize', Math.max(6, fontSize - 1))}
        >
          <Minus size={13} />
        </button>

        <input
          type="number"
          value={fontSize}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val && val > 0 && val < 200) commands.execute('setFontSize', val);
          }}
          style={{
            width: 32,
            height: 24,
            textAlign: 'center',
            border: '1px solid #DADCE0',
            borderRadius: 3,
            fontSize: 12.5,
            fontWeight: 500,
            background: '#FFFFFF',
            outline: 'none',
          }}
        />

        <button
          type="button"
          title="Tăng cỡ chữ"
          style={toolBtnStyle()}
          onClick={() => commands.execute('setFontSize', Math.min(144, fontSize + 1))}
        >
          <Plus size={13} />
        </button>
      </div>

      {divider}

      {/* Bold / Italic / Underline / Strike */}
      <button
        type="button"
        title="In đậm (Ctrl+B)"
        style={toolBtnStyle(Boolean(activeMarks.bold))}
        onClick={() => commands.execute('toggleBold')}
      >
        <Bold size={16} />
      </button>

      <button
        type="button"
        title="In nghiêng (Ctrl+I)"
        style={toolBtnStyle(Boolean(activeMarks.italic))}
        onClick={() => commands.execute('toggleItalic')}
      >
        <Italic size={16} />
      </button>

      <button
        type="button"
        title="Gạch chân (Ctrl+U)"
        style={toolBtnStyle(Boolean(activeMarks.underline))}
        onClick={() => commands.execute('toggleUnderline')}
      >
        <Underline size={16} />
      </button>

      <button
        type="button"
        title="Gạch ngang chữ"
        style={toolBtnStyle(Boolean(activeMarks.strike))}
        onClick={() => commands.execute('toggleStrike')}
      >
        <Strikethrough size={16} />
      </button>

      {/* Text Color Picker */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Màu chữ"
          style={toolBtnStyle(textColorOpen)}
          onClick={() => setTextColorOpen(!textColorOpen)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Baseline size={15} />
            <div
              style={{
                width: 14,
                height: 3,
                background: activeMarks.foregroundColor || '#202124',
                marginTop: 1,
              }}
            />
          </div>
        </button>

        {textColorOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#FFFFFF',
              borderRadius: 6,
              boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
              border: '1px solid #DADCE0',
              padding: 10,
              zIndex: 1000,
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 18px)',
              gap: 4,
            }}
          >
            {COLOR_PALETTE.map((c, i) => (
              <div
                key={`col-${i}`}
                onClick={() => {
                  commands.execute('setTextColor', c);
                  setTextColorOpen(false);
                }}
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: c === '#FFFFFF' ? '1px solid #E0E0E0' : 'none',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight Color Picker */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Màu làm nổi bật"
          style={toolBtnStyle(highlightColorOpen)}
          onClick={() => setHighlightColorOpen(!highlightColorOpen)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Highlighter size={15} />
            <div
              style={{
                width: 14,
                height: 3,
                background: activeMarks.backgroundColor || 'transparent',
                marginTop: 1,
                border: !activeMarks.backgroundColor ? '1px solid #999' : 'none',
              }}
            />
          </div>
        </button>

        {highlightColorOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#FFFFFF',
              borderRadius: 6,
              boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
              border: '1px solid #DADCE0',
              padding: 10,
              zIndex: 1000,
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 22px)',
              gap: 6,
            }}
          >
            {HIGHLIGHT_PALETTE.map((c, i) => (
              <div
                key={`hl-${i}`}
                onClick={() => {
                  commands.execute('setHighlightColor', c === 'transparent' ? undefined : c);
                  setHighlightColorOpen(false);
                }}
                style={{
                  width: 22,
                  height: 22,
                  background: c,
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: '1px solid #DADCE0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                }}
              >
                {c === 'transparent' && '✕'}
              </div>
            ))}
          </div>
        )}
      </div>

      {divider}

      {/* Insert Link / Add Comment / Insert Image */}
      <button
        type="button"
        title="Chèn đường liên kết (Ctrl+K)"
        style={toolBtnStyle(Boolean(activeMarks.link))}
        onClick={onOpenInsertLink}
      >
        <LinkIcon size={16} />
      </button>

      <button
        type="button"
        title="Thêm nhận xét"
        style={toolBtnStyle()}
        onClick={onAddComment}
      >
        <MessageSquarePlus size={16} />
      </button>

      <button
        type="button"
        title="Chèn hình ảnh"
        style={toolBtnStyle()}
        onClick={onOpenInsertImage}
      >
        <ImageIcon size={16} />
      </button>

      {divider}

      {/* Alignment */}
      <button
        type="button"
        title="Căn lề trái"
        style={toolBtnStyle(activeParagraphStyle.alignment === 'left' || !activeParagraphStyle.alignment)}
        onClick={() => commands.execute('setAlignment', 'left')}
      >
        <AlignLeft size={16} />
      </button>

      <button
        type="button"
        title="Căn giữa"
        style={toolBtnStyle(activeParagraphStyle.alignment === 'center')}
        onClick={() => commands.execute('setAlignment', 'center')}
      >
        <AlignCenter size={16} />
      </button>

      <button
        type="button"
        title="Căn lề phải"
        style={toolBtnStyle(activeParagraphStyle.alignment === 'right')}
        onClick={() => commands.execute('setAlignment', 'right')}
      >
        <AlignRight size={16} />
      </button>

      <button
        type="button"
        title="Căn đều hai bên"
        style={toolBtnStyle(activeParagraphStyle.alignment === 'justify')}
        onClick={() => commands.execute('setAlignment', 'justify')}
      >
        <AlignJustify size={16} />
      </button>

      {divider}

      {/* Lists: Checklist, Bullet, Numbered */}
      <button
        type="button"
        title="Danh sách việc cần làm"
        style={toolBtnStyle()}
        onClick={() => commands.execute('toggleList', 'checklist')}
      >
        <ListTodo size={16} />
      </button>

      <button
        type="button"
        title="Danh sách dấu đầu dòng"
        style={toolBtnStyle()}
        onClick={() => commands.execute('toggleList', 'bullet')}
      >
        <List size={16} />
      </button>

      <button
        type="button"
        title="Danh sách đánh số"
        style={toolBtnStyle()}
        onClick={() => commands.execute('toggleList', 'numbered')}
      >
        <ListOrdered size={16} />
      </button>

      {/* Indents: Decrease, Increase */}
      <button
        type="button"
        title="Giảm thụt lề"
        style={toolBtnStyle()}
        onClick={() => commands.execute('decreaseIndent')}
      >
        <Outdent size={16} />
      </button>

      <button
        type="button"
        title="Tăng thụt lề"
        style={toolBtnStyle()}
        onClick={() => commands.execute('increaseIndent')}
      >
        <Indent size={16} />
      </button>

      {/* Clear Formatting */}
      <button
        type="button"
        title="Xóa định dạng"
        style={toolBtnStyle()}
        onClick={() => commands.execute('clearFormatting')}
      >
        <Eraser size={16} />
      </button>
    </div>
  );
};
