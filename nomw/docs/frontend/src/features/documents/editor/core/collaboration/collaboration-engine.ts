import { DocumentModel } from '../model/document-model';
import { TransactionEngine, EditorTransaction } from '../transactions/transaction-engine';
import { PresenceService } from './presence-service';
import { CommentsService } from '../comments/comments-service';
import { TypedEventBus } from '../utils/event-bus';
import { EditorSelection } from '../selection/position';
import { getCollaboratorColor } from '../utils/color';

export interface CollaborationConfig {
  documentId: string;
  userId: string;
  userName: string;
  clientId: string;
  token?: string;
  endpointUrl?: string;
}

export class CollaborationEngine {
  private config: CollaborationConfig;
  private doc: DocumentModel;
  private transactionEngine: TransactionEngine;
  private presenceService: PresenceService;
  private commentsService: CommentsService;
  private eventBus: TypedEventBus;
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private pendingOperationsQueue: any[] = [];
  private isConnected: boolean = false;
  private presenceThrottleTimer: any = null;

  constructor(
    config: CollaborationConfig,
    doc: DocumentModel,
    transactionEngine: TransactionEngine,
    presenceService: PresenceService,
    commentsService: CommentsService,
    eventBus: TypedEventBus
  ) {
    this.config = config;
    this.doc = doc;
    this.transactionEngine = transactionEngine;
    this.presenceService = presenceService;
    this.commentsService = commentsService;
    this.eventBus = eventBus;

    // Cross-tab broadcast channel for local peer sync
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(`doc_collab_${config.documentId}`);
      this.broadcastChannel.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    }
  }

  public connect(): void {
    if (typeof window === 'undefined') return;

    const token = this.config.token || localStorage.getItem('minepanel_token') || '';
    const url = `/api/v1/documents/${encodeURIComponent(this.config.documentId)}/events`;

    try {
      // Connect EventSource if supported
      this.eventSource = new EventSource(`${url}?token=${encodeURIComponent(token)}`);

      this.eventSource.addEventListener('connected', () => {
        this.isConnected = true;
        this.eventBus.emit('saveStateChanged', { state: 'saved' });
      });

      this.eventSource.addEventListener('operations', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleRemoteOperations(data);
        } catch (e) {
          console.error('Failed to parse SSE operations event:', e);
        }
      });

      this.eventSource.addEventListener('presence', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.clientId !== this.config.clientId) {
            this.presenceService.updatePresence(data);
          }
        } catch (e) {}
      });

      this.eventSource.addEventListener('comment_created', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.commentsService.addComment(data);
        } catch (e) {}
      });

      this.eventSource.addEventListener('comment_updated', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.commentsService.updateComment(data);
        } catch (e) {}
      });

      this.eventSource.addEventListener('comment_deleted', (event) => {
        try {
          const data = JSON.parse(event.data);
          this.commentsService.removeComment(data.commentId);
        } catch (e) {}
      });

      this.eventSource.onerror = () => {
        this.isConnected = false;
        this.eventBus.emit('saveStateChanged', { state: 'offline' });
      };
    } catch (e) {
      console.warn('Realtime SSE connection failed, operating with local broadcast channel:', e);
    }
  }

  public disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
  }

  public broadcastPresence(selection: EditorSelection | null): void {
    if (this.presenceThrottleTimer) return;

    this.presenceThrottleTimer = setTimeout(() => {
      this.presenceThrottleTimer = null;
      const payload = {
        type: 'presence',
        userId: this.config.userId,
        name: this.config.userName,
        clientId: this.config.clientId,
        color: getCollaboratorColor(this.config.userId),
        selection,
      };

      // Broadcast to local tabs
      this.broadcastChannel?.postMessage(payload);

      // Post to server if connected
      fetch(`/api/v1/documents/${encodeURIComponent(this.config.documentId)}/presence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token || localStorage.getItem('minepanel_token') || ''}`,
        },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 150);
  }

  public broadcastLocalTransaction(tx: EditorTransaction): void {
    const payload = {
      type: 'operations',
      documentId: this.config.documentId,
      clientId: this.config.clientId,
      operations: tx.operations,
      revision: this.doc.revision,
    };

    this.broadcastChannel?.postMessage(payload);
  }

  private handleMessage(message: any): void {
    if (!message || message.clientId === this.config.clientId) return;

    if (message.type === 'presence') {
      this.presenceService.updatePresence(message);
    } else if (message.type === 'operations') {
      this.handleRemoteOperations(message);
    }
  }

  private handleRemoteOperations(payload: any): void {
    if (payload.actorId === this.config.userId && payload.clientId === this.config.clientId) {
      return;
    }

    if (Array.isArray(payload.operations)) {
      const remoteTx = this.transactionEngine.createTransaction(payload.operations, 'remote');
      this.transactionEngine.applyTransaction(remoteTx);
      this.doc.revision = payload.revision || this.doc.revision + 1;
      this.eventBus.emit('documentChanged', {
        documentId: this.doc.id,
        revision: this.doc.revision,
      });
    }
  }
}
