import api from '../../../../api/axios';
import { DocumentModelData, DocumentSettings } from '../core/model/types';
import { DocumentCommentItem } from '../core/comments/comments-service';

export interface DocumentMetaResponse {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  ownerCode: string;
  currentRevision: number;
  settings: DocumentSettings;
  userRole: 'owner' | 'editor' | 'commenter' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

export interface GetDocumentResponse {
  document: DocumentMetaResponse;
  snapshot: { revision: number; data: string } | null;
  operations: any[];
}

export const documentApiService = {
  list: () => api.get<{ data: DocumentMetaResponse[] }>('/documents'),

  get: (id: string) => api.get<GetDocumentResponse>(`/documents/${id}`),

  create: (title: string, settings?: DocumentSettings, initialData?: DocumentModelData) =>
    api.post<{ document: DocumentMetaResponse; snapshot: { revision: number; data: string } }>('/documents', {
      title,
      settings,
      initialData,
    }),

  update: (id: string, updates: { title?: string; settings?: DocumentSettings }) =>
    api.patch<{ document: DocumentMetaResponse }>(`/documents/${id}`, updates),

  remove: (id: string) => api.delete<{ deleted: boolean }>(`/documents/${id}`),

  saveOperations: (id: string, operations: any[], snapshot?: { revision: number; data: string }) =>
    api.post<{ success: boolean; revision: number }>(`/documents/${id}/operations`, { operations, snapshot }),

  saveSnapshot: (id: string, revision: number, data: string) =>
    api.post<{ success: boolean; revision: number }>(`/documents/${id}/snapshots`, { revision, data }),

  getHistory: (id: string) => api.get<{ history: any[] }>(`/documents/${id}/history`),

  getComments: (id: string) => api.get<{ comments: DocumentCommentItem[] }>(`/documents/${id}/comments`),

  createComment: (id: string, anchor: any, body: string) =>
    api.post<{ comment: DocumentCommentItem }>(`/documents/${id}/comments`, { anchor, body }),

  updateComment: (id: string, commentId: string, updates: { resolved?: boolean; body?: string }) =>
    api.patch<{ comment: DocumentCommentItem }>(`/documents/${id}/comments/${commentId}`, updates),

  deleteComment: (id: string, commentId: string) =>
    api.delete<{ deleted: boolean }>(`/documents/${id}/comments/${commentId}`),

  getMembers: (id: string) => api.get<{ members: any[] }>(`/documents/${id}/members`),

  share: (id: string, target: { userId?: string; email?: string; role: 'editor' | 'commenter' | 'viewer' }) =>
    api.post<{ success: boolean; member: any }>(`/documents/${id}/share`, target),
};
