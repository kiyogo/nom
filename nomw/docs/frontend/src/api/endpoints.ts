import api from './axios';

export type StoredFileNode = {
  key: string;
  id: string;
  name: string;
  type: 'dir' | 'file';
  mime?: string;
  sizeBytes: number;
  size?: string;
  modified: string;
  createdAt: string;
  updatedAt: string;
};

export const filesApi = {
  list: () => api.get<{ data: StoredFileNode[] }>('/files'),
  get: (id: string) => api.get<{ file: StoredFileNode }>(`/files/${id}`),
  create: (name: string, content?: Blob) => {
    if (content) {
      return filesApi.upload(content, name);
    }
    return api.post<{ file: StoredFileNode }>('/files/create', { name });
  },
  upload: (file: Blob, name: string) => {
    return api.post<{ file: StoredFileNode }>('/files/upload', file, {
      headers: {
        'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-File-Name': encodeURIComponent(name),
      },
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });
  },
  update: (id: string, name: string) => api.patch<{ file: StoredFileNode }>(`/files/${id}`, { name }),
  updateContent: (id: string, content: Blob) => {
    return api.put<{ file: StoredFileNode }>(`/files/${id}/content`, content, {
      headers: { 'Content-Type': content.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });
  },
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/files/${id}`),
  download: (id: string) => api.get<Blob>(`/files/${id}/download`, { responseType: 'blob' }),
};

export type EnterpriseDocument = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  ownerCode: string;
  currentRevision: number;
  settings?: Record<string, unknown>;
  userRole: string;
  createdAt: string;
  updatedAt: string;
};

export const documentsApi = {
  getAll: () => api.get<{ data: EnterpriseDocument[] }>('/documents'),
  create: (data: { id?: string; title?: string; settings?: Record<string, unknown> }) =>
    api.post<{ document: EnterpriseDocument }>('/documents', data),
};
