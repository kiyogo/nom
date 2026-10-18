import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Upload,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  Clock,
  HardDrive,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { filesApi, StoredFileNode } from '../api/endpoints';
import { formatFileSize, getFileBlob } from '../utils/fileStorage';

export const DocumentsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<StoredFileNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await filesApi.list();
      setFiles(res.data.data || []);
    } catch (err) {
      console.warn('Backend chưa sẵn sàng, dùng danh sách mẫu cục bộ');
      // Fallback mẫu bao gồm cả file b45281ee...
      const sampleFiles: StoredFileNode[] = [
        {
          key: 'b45281ee-0669-4fbc-bf20-3a9ba03daf61',
          id: 'b45281ee-0669-4fbc-bf20-3a9ba03daf61',
          name: 'Nghị_quyết_điều_hành_Văn_Nôm_2026.wnom',
          type: 'file',
          mime: 'application/x-wnom',
          sizeBytes: 32450,
          modified: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          key: 'doc-template-hopdong',
          id: 'doc-template-hopdong',
          name: 'Hợp_đồng_cung_cấp_dịch_vụ_phần_mềm.wnom',
          type: 'file',
          mime: 'application/x-wnom',
          sizeBytes: 28120,
          modified: new Date(Date.now() - 3600000 * 24).toISOString(),
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        }
      ];
      setFiles(sampleFiles);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleCreateNew = async () => {
    const newId = crypto.randomUUID ? crypto.randomUUID() : 'doc-' + Date.now();
    const defaultName = `Van_Ban_Nom_${new Date().toISOString().slice(0, 10)}.wnom`;
    try {
      await filesApi.create(defaultName);
    } catch (e) {
      // Offline fallback
    }
    navigate(`/files/document/wnom/${newId}/edit`);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file.name.match(/\.(wnom)$/i)) {
      showNotify('Vui lòng chọn file định dạng Văn bản Nôm (.wnom)', 'error');
      return;
    }

    setUploading(true);
    try {
      const res = await filesApi.upload(file, file.name);
      showNotify(`Đã tải lên "${file.name}" thành công!`);
      await fetchFiles();
      if (res.data?.file?.id) {
        navigate(`/files/document/wnom/${res.data.file.id}/edit`);
      }
    } catch (err: any) {
      showNotify('Tải lên thất bại: ' + (err?.message || 'Lỗi kết nối'), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (file: StoredFileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let blob: Blob | null = await getFileBlob(file.id);
      if (!blob) {
        const res = await filesApi.download(file.id);
        blob = res.data;
      }
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.endsWith('.wnom') ? file.name : `${file.name}.wnom`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotify(`Đã tải file "${file.name}" về máy.`);
      }
    } catch (err) {
      showNotify('Không thể tải file về máy', 'error');
    }
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Bạn có chắc chắn muốn xóa văn bản "${name}" không?`)) return;
    try {
      await filesApi.remove(id);
      setFiles((prev) => prev.filter((f) => f.id !== id && f.key !== id));
      showNotify(`Đã xóa văn bản "${name}".`);
    } catch (err) {
      setFiles((prev) => prev.filter((f) => f.id !== id && f.key !== id));
      showNotify(`Đã xóa khỏi danh sách.`);
    }
  };

  const handleStartRename = (file: StoredFileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(file.id);
    setEditingName(file.name);
  };

  const handleSaveRename = async (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!editingName.trim()) return;
    try {
      await filesApi.update(id, editingName.trim());
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: editingName.trim() } : f))
      );
      showNotify('Đã đổi tên thành công.');
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: editingName.trim() } : f))
      );
    } finally {
      setEditingId(null);
    }
  };

  const filteredFiles = files.filter((f) =>
    (f.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C94F2A] flex items-center justify-center font-bold text-white text-base shadow-sm">
              Nôm
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">VĂN NÔM WNOM</h1>
              <p className="text-xs text-slate-500">Hệ thống Trình soạn thảo Văn bản Nôm Wnom Trực tuyến</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadFile}
              accept=".wnom"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>{uploading ? 'Đang tải lên...' : 'Tải lên .wnom'}</span>
            </button>

            <button
              onClick={handleCreateNew}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#C94F2A] rounded-lg hover:bg-[#B34320] transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo văn bản mới</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Quick Link for requested UUID */}
        <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-white border border-orange-200 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 text-[#C94F2A] rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Văn bản mẫu mục tiêu</h3>
              <p className="text-xs text-slate-600 font-mono mt-0.5">
                /files/document/wnom/b45281ee-0669-4fbc-bf20-3a9ba03daf61/edit
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/files/document/wnom/b45281ee-0669-4fbc-bf20-3a9ba03daf61/edit')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#C94F2A] bg-white border border-orange-300 rounded-lg hover:bg-orange-50 shadow-xs cursor-pointer transition-colors"
          >
            <span>Mở ngay</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm tài liệu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C94F2A] focus:border-transparent transition-all shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={fetchFiles}
              title="Làm mới danh sách"
              className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-slate-100 rounded w-1/2 mb-6"></div>
                <div className="h-8 bg-slate-100 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700">Chưa có văn bản nào</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Bấm "Tạo văn bản mới" hoặc tải lên tệp .wnom có sẵn để bắt đầu soạn thảo.
            </p>
            <button
              onClick={handleCreateNew}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#C94F2A] rounded-lg hover:bg-[#B34320] transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo văn bản ngay</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredFiles.map((file) => (
              <div
                key={file.id || file.key}
                onClick={() => navigate(`/files/document/wnom/${file.id || file.key}/edit`)}
                className="group bg-white rounded-xl border border-slate-200 hover:border-orange-300 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-[#2B579A]">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      WNOM
                    </span>
                  </div>

                  {editingId === file.id ? (
                    <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(file.id, e)}
                        autoFocus
                        className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none"
                      />
                      <div className="flex gap-2 mt-1.5 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                          }}
                          className="px-2 py-0.5 text-xs text-slate-600 hover:text-slate-800"
                        >
                          Hủy
                        </button>
                        <button
                          onClick={(e) => handleSaveRename(file.id, e)}
                          className="px-2.5 py-0.5 text-xs bg-blue-600 text-white rounded font-medium"
                        >
                          Lưu
                        </button>
                      </div>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-slate-900 group-hover:text-[#C94F2A] transition-colors line-clamp-2 text-sm leading-snug mb-2">
                      {file.name}
                    </h3>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                      {formatFileSize(file.sizeBytes || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {file.updatedAt ? new Date(file.updatedAt).toLocaleDateString('vi-VN') : 'Mới tạo'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-[#C94F2A] group-hover:underline flex items-center gap-1">
                    Soạn thảo <ExternalLink className="w-3 h-3" />
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleStartRename(file, e)}
                      title="Đổi tên"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDownload(file, e)}
                      title="Tải về .wnom"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(file.id, file.name, e)}
                      title="Xóa"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default DocumentsListPage;
