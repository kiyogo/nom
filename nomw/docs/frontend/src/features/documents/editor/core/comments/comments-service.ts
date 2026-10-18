import { DocPosition } from '../selection/position';

export interface DocumentCommentItem {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  authorCode: string;
  anchor: DocPosition | null;
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export class CommentsService {
  private documentId: string;
  private comments: DocumentCommentItem[] = [];
  private listeners: Set<(comments: DocumentCommentItem[]) => void> = new Set();

  constructor(documentId: string) {
    this.documentId = documentId;
  }

  public setComments(comments: DocumentCommentItem[]): void {
    this.comments = comments;
    this.notify();
  }

  public getComments(): DocumentCommentItem[] {
    return [...this.comments];
  }

  public addComment(comment: DocumentCommentItem): void {
    this.comments.push(comment);
    this.notify();
  }

  public updateComment(comment: DocumentCommentItem): void {
    const idx = this.comments.findIndex((c) => c.id === comment.id);
    if (idx !== -1) {
      this.comments[idx] = comment;
      this.notify();
    }
  }

  public removeComment(commentId: string): void {
    this.comments = this.comments.filter((c) => c.id !== commentId);
    this.notify();
  }

  public subscribe(listener: (comments: DocumentCommentItem[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.comments));
  }
}
