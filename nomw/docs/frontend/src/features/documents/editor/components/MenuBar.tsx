import React, { useState, useRef, useEffect } from 'react';
import { CommandRegistry } from '../core/commands/command-registry';
import {
  FilePlus,
  FileDown,
  Printer,
  Sliders,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Clipboard,
  Search,
  Check,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Minus,
  FileDigit,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Eraser,
  MessageSquarePlus,
  HelpCircle,
} from 'lucide-react';

interface MenuBarProps {
  commands: CommandRegistry;
  onOpenPageSetup: () => void;
  onOpenFindReplace: () => void;
  onOpenWordCount: () => void;
  onOpenInsertTable: () => void;
  onOpenInsertImage: () => void;
  onOpenInsertLink: () => void;
  onExportPdf: () => void;
  onExportText: () => void;
  onPrint: () => void;
  showRuler: boolean;
  onToggleRuler: () => void;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  debugMode: boolean;
  onToggleDebugMode: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  commands,
  onOpenPageSetup,
  onOpenFindReplace,
  onOpenWordCount,
  onOpenInsertTable,
  onOpenInsertImage,
  onOpenInsertLink,
  onExportPdf,
  onExportText,
  onPrint,
  showRuler,
  onToggleRuler,
  zoom,
  onSetZoom,
  debugMode,
  onToggleDebugMode,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const menuItems = [
    {
      id: 'file',
      label: 'Tệp',
      children: [
        { label: 'Tài liệu mới', icon: <FilePlus size={14} />, action: () => window.open('/files/document/new', '_blank') },
        { type: 'divider' },
        { label: 'Thiết lập trang...', icon: <Sliders size={14} />, action: onOpenPageSetup },
        { label: 'Tải xuống tệp PDF (.pdf)', icon: <FileDown size={14} />, action: onExportPdf },
        { label: 'Tải xuống văn bản thô (.txt)', icon: <FileDown size={14} />, action: onExportText },
        { type: 'divider' },
        { label: 'In ấn (Ctrl+P)', icon: <Printer size={14} />, action: onPrint },
      ],
    },
    {
      id: 'edit',
      label: 'Chỉnh sửa',
      children: [
        { label: 'Hoàn tác (Ctrl+Z)', icon: <Undo2 size={14} />, action: () => commands.execute('undo') },
        { label: 'Làm lại (Ctrl+Y)', icon: <Redo2 size={14} />, action: () => commands.execute('redo') },
        { type: 'divider' },
        { label: 'Chọn tất cả (Ctrl+A)', action: () => commands.execute('selectAll') },
        { type: 'divider' },
        { label: 'Tìm kiếm và thay thế (Ctrl+F)', icon: <Search size={14} />, action: onOpenFindReplace },
      ],
    },
    {
      id: 'view',
      label: 'Xem',
      children: [
        {
          label: showRuler ? '✓ Hiển thị thước đo' : '  Hiển thị thước đo',
          action: onToggleRuler,
        },
        { type: 'divider' },
        { label: `${Math.round(zoom * 100)}% (Thu phóng)`, action: () => {} },
        { label: '  50%', action: () => onSetZoom(0.5) },
        { label: '  75%', action: () => onSetZoom(0.75) },
        { label: '  90%', action: () => onSetZoom(0.9) },
        { label: '  100% (Chuẩn)', action: () => onSetZoom(1.0) },
        { label: '  125%', action: () => onSetZoom(1.25) },
        { label: '  150%', action: () => onSetZoom(1.5) },
        { label: '  200%', action: () => onSetZoom(2.0) },
        { label: '  300%', action: () => onSetZoom(3.0) },
        { label: '  400%', action: () => onSetZoom(4.0) },
        { label: '  500% (Tối đa)', action: () => onSetZoom(5.0) },
      ],
    },
    {
      id: 'insert',
      label: 'Chèn',
      children: [
        { label: 'Hình ảnh...', icon: <ImageIcon size={14} />, action: onOpenInsertImage },
        { label: 'Bảng biểu...', icon: <TableIcon size={14} />, action: onOpenInsertTable },
        { label: 'Liên kết...', icon: <LinkIcon size={14} />, action: onOpenInsertLink },
        { type: 'divider' },
        { label: 'Đường kẻ ngang', icon: <Minus size={14} />, action: () => commands.execute('insertHorizontalRule') },
        { label: 'Ngắt trang (Ctrl+Enter)', icon: <FileDigit size={14} />, action: () => commands.execute('insertPageBreak') },
      ],
    },
    {
      id: 'format',
      label: 'Định dạng',
      children: [
        { label: 'In đậm (Ctrl+B)', icon: <Bold size={14} />, action: () => commands.execute('toggleBold') },
        { label: 'In nghiêng (Ctrl+I)', icon: <Italic size={14} />, action: () => commands.execute('toggleItalic') },
        { label: 'Gạch chân (Ctrl+U)', icon: <Underline size={14} />, action: () => commands.execute('toggleUnderline') },
        { label: 'Gạch ngang chữ', icon: <Strikethrough size={14} />, action: () => commands.execute('toggleStrike') },
        { type: 'divider' },
        { label: 'Căn lề trái', icon: <AlignLeft size={14} />, action: () => commands.execute('setAlignment', 'left') },
        { label: 'Căn lề giữa', icon: <AlignCenter size={14} />, action: () => commands.execute('setAlignment', 'center') },
        { label: 'Căn lề phải', icon: <AlignRight size={14} />, action: () => commands.execute('setAlignment', 'right') },
        { label: 'Căn đều hai bên', icon: <AlignJustify size={14} />, action: () => commands.execute('setAlignment', 'justify') },
        { type: 'divider' },
        { label: 'Xóa định dạng', icon: <Eraser size={14} />, action: () => commands.execute('clearFormatting') },
      ],
    },
    {
      id: 'tools',
      label: 'Công cụ',
      children: [
        { label: 'Đếm từ...', icon: <Type size={14} />, action: onOpenWordCount },
        { type: 'divider' },
        {
          label: debugMode ? '✓ Tắt chế độ gỡ lỗi Canvas' : '  Bật chế độ gỡ lỗi Canvas (?editorDebug=1)',
          action: onToggleDebugMode,
        },
      ],
    },
    {
      id: 'help',
      label: 'Trợ giúp',
      children: [
        {
          label: 'Phím tắt thông dụng',
          icon: <HelpCircle size={14} />,
          action: () => alert('Phím tắt:\n- Ctrl+B: In đậm\n- Ctrl+I: In nghiêng\n- Ctrl+U: Gạch chân\n- Ctrl+Z: Hoàn tác\n- Ctrl+Y: Làm lại\n- Ctrl+A: Chọn tất cả\n- Ctrl+F: Tìm kiếm\n- Ctrl+P: In'),
        },
      ],
    },
  ];

  return (
    <nav
      ref={containerRef}
      className="doc-menu-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 28,
        minHeight: 28,
        padding: '0 12px',
        background: '#FFFFFF',
        userSelect: 'none',
        position: 'relative',
        zIndex: 100,
        gap: 2,
      }}
    >
      {menuItems.map((m) => {
        const isOpen = activeMenu === m.id;
        return (
          <div key={m.id} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setActiveMenu(isOpen ? null : m.id)}
              onMouseEnter={() => activeMenu && setActiveMenu(m.id)}
              style={{
                background: isOpen ? '#E8F0FE' : 'transparent',
                color: isOpen ? '#1A73E8' : '#202124',
                border: 'none',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
            >
              {m.label}
            </button>

            {/* Dropdown menu */}
            {isOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 2,
                  background: '#FFFFFF',
                  borderRadius: 4,
                  boxShadow: '0 2px 6px 2px rgba(60,64,67,0.15), 0 1px 2px 0 rgba(60,64,67,0.3)',
                  border: '1px solid #DADCE0',
                  minWidth: 220,
                  padding: '6px 0',
                  zIndex: 1000,
                }}
              >
                {m.children.map((item: any, idx: number) => {
                  if (item.type === 'divider') {
                    return <div key={`div-${idx}`} style={{ height: 1, background: '#E0E0E0', margin: '4px 0' }} />;
                  }
                  return (
                    <button
                      key={`item-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveMenu(null);
                        item.action();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '6px 14px',
                        border: 'none',
                        background: 'transparent',
                        color: '#3C4043',
                        fontSize: 13,
                        textAlign: 'left',
                        cursor: 'pointer',
                        gap: 10,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.icon && <span style={{ color: '#5F6368', display: 'flex' }}>{item.icon}</span>}
                        <span>{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};
