import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { DocumentsListPage } from './pages/DocumentsListPage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';

const DocxRedirect: React.FC = () => {
  const { fileKey } = useParams<{ fileKey?: string }>();
  const targetKey = fileKey ? fileKey.replace(/\/edit$/, '') : 'b45281ee-0669-4fbc-bf20-3a9ba03daf61';
  return <Navigate to={`/files/document/wnom/${targetKey}/edit`} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Trang danh sách tài liệu */}
        <Route path="/" element={<DocumentsListPage />} />
        <Route path="/files" element={<DocumentsListPage />} />

        {/* Trình soạn thảo Nôm Wnom */}
        <Route path="/files/document/wnom/:fileKey/edit" element={<DocumentEditorPage />} />
        <Route path="/files/document/wnom/:fileKey" element={<DocumentEditorPage />} />
        <Route path="/files/document/wnom/*" element={<DocumentEditorPage />} />

        {/* Các alias tiện lợi */}
        <Route path="/document/wnom/:fileKey/edit" element={<DocumentEditorPage />} />
        <Route path="/document/wnom/*" element={<DocumentEditorPage />} />

        {/* Tự động chuyển hướng từ các đường dẫn cũ sang WNOM chuẩn */}
        <Route path="/files/document/docx/:fileKey/edit" element={<DocxRedirect />} />
        <Route path="/files/document/docx/:fileKey" element={<DocxRedirect />} />
        <Route path="/document/docx/:fileKey/edit" element={<DocxRedirect />} />
        <Route path="/document/docx/:fileKey" element={<DocxRedirect />} />
        <Route path="/files/document/:fileKey/edit" element={<DocxRedirect />} />
        <Route path="/files/document/:fileKey" element={<DocxRedirect />} />
        <Route path="/document/:fileKey/edit" element={<DocxRedirect />} />
        <Route path="/document/:fileKey" element={<DocxRedirect />} />

        {/* Fallback - Quay về trang chủ nếu đường dẫn không tồn tại */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
