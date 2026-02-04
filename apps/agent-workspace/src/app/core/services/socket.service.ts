import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Task, AgentState } from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  agentId?: string;
  error?: string;
}

/**
 * Reconnection configuration
 */
interface ReconnectionConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

@Injectable({
  providedIn: 'root',
})
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private reconnectionConfig = DEFAULT_RECONNECTION_CONFIG;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private storedAgentId: string | null = null;
  private storedAgentName: string | null = null;
  private intentionalDisconnect = false;

  // Connection status
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>({
    connected: false,
    reconnecting: false,
  });
  public connectionStatus$: Observable<ConnectionStatus> =
    this.connectionStatusSubject.asObservable();

  // Task events
  private taskAssignedSubject = new Subject<Task>();
  public taskAssigned$: Observable<Task> = this.taskAssignedSubject.asObservable();

  private taskTimeoutSubject = new Subject<{ taskId: string }>();
  public taskTimeout$: Observable<{ taskId: string }> =
    this.taskTimeoutSubject.asObservable();

  // Reconnection events
  private reconnectingSubject = new Subject<{ attempt: number; maxAttempts: number }>();
  public reconnecting$: Observable<{ attempt: number; maxAttempts: number }> =
    this.reconnectingSubject.asObservable();

  private reconnectFailedSubject = new Subject<void>();
  public reconnectFailed$: Observable<void> = this.reconnectFailedSubject.asObservable();

  get isConnected(): boolean {
    return this.connectionStatusSubject.value.connected;
  }

  get isReconnecting(): boolean {
    return this.connectionStatusSubject.value.reconnecting;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(agentId: string, agentName: string): void {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Store credentials for reconnection
    this.storedAgentId = agentId;
    this.storedAgentName = agentName;
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;

    this.establishConnection(agentId, agentName);
  }

  /**
   * Internal method to establish the WebSocket connection
   */
  private establishConnection(agentId: string, agentName: string): void {
    // Clean up any existing socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    // Extract base URL (remove /api suffix)
    const wsUrl = environment.apiUrl.replace('/api', '');

    console.log(`Connecting to WebSocket: ${wsUrl}/queue`);

    this.socket = io(`${wsUrl}/queue`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: false, // We handle reconnection manually
    });

    this.setupEventListeners(agentId, agentName);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cancelReconnect();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.storedAgentId = null;
    this.storedAgentName = null;
    this.connectionStatusSubject.next({ connected: false, reconnecting: false });
  }

  /**
   * Cancel any pending reconnection attempt
   */
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.intentionalDisconnect) {
      return;
    }

    if (!this.storedAgentId || !this.storedAgentName) {
      console.error('Cannot reconnect: No stored credentials');
      return;
    }

    if (this.reconnectAttempts >= this.reconnectionConfig.maxAttempts) {
      console.error('Max reconnection attempts reached');
      this.connectionStatusSubject.next({
        connected: false,
        reconnecting: false,
        error: 'Connection failed after maximum retry attempts',
      });
      this.reconnectFailedSubject.next();
      return;
    }

    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectionConfig.baseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.reconnectionConfig.maxDelayMs
    );

    console.log(
      `Reconnection attempt ${this.reconnectAttempts}/${this.reconnectionConfig.maxAttempts} in ${delay}ms`
    );

    this.connectionStatusSubject.next({
      connected: false,
      reconnecting: true,
    });

    this.reconnectingSubject.next({
      attempt: this.reconnectAttempts,
      maxAttempts: this.reconnectionConfig.maxAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.establishConnection(this.storedAgentId!, this.storedAgentName!);
    }, delay);
  }

  /**
   * Manually trigger a reconnection attempt
   */
  retryConnection(): void {
    if (!this.storedAgentId || !this.storedAgentName) {
      console.error('Cannot retry: No stored credentials');
      return;
    }

    this.reconnectAttempts = 0;
    this.intentionalDisconnect = false;
    this.attemptReconnect();
  }

  /**
   * Notify server that agent is ready for work (IDLE)
   */
  sendAgentReady(agentId: string): void {
    if (this.socket?.connected) {
      console.log('Sending agent:ready');
      this.socket.emit('agent:ready', { agentId });
    }
  }

  /**
   * Notify server of agent state change
   */
  sendStateChange(agentId: string, state: AgentState): void {
    if (this.socket?.connected) {
      console.log(`Sending state change: ${state}`);
      this.socket.emit('agent:state-change', { agentId, state });
    }
  }

  /**
   * Notify server of task action (accept, reject, complete, transfer)
   */
  sendTaskAction(
    agentId: string,
    taskId: string,
    action: 'accept' | 'reject' | 'complete' | 'transfer'
  ): void {
    if (this.socket?.connected) {
      console.log(`Sending task action: ${action} for task ${taskId}`);
      this.socket.emit('agent:task-action', { agentId, taskId, action });
    }
  }

  /**
   * Notify server that disposition is complete
   */
  sendDispositionComplete(
    agentId: string,
    taskId: string,
    dispositionCode: string
  ): void {
    if (this.socket?.connected) {
      console.log(`Sending disposition complete: ${dispositionCode}`);
      this.socket.emit('agent:disposition-complete', {
        agentId,
        taskId,
        dispositionCode,
      });
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private setupEventListeners(agentId: string, agentName: string): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      console.log('Socket connected, registering agent...');
      this.socket?.emit('agent:connect', { agentId, name: agentName });
    });

    // Connection acknowledged
    this.socket.on('connection:ack', (data: { agentId: string; status: string }) => {
      console.log('Connection acknowledged:', data);

      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.cancelReconnect();

      this.connectionStatusSubject.next({
        connected: true,
        reconnecting: false,
        agentId: data.agentId,
      });
    });

    // Task assigned (Force Mode push)
    this.socket.on('task:assigned', (task: Task) => {
      console.log('Task assigned:', task.id);
      this.taskAssignedSubject.next(task);
    });

    // Task timeout
    this.socket.on('task:timeout', (data: { taskId: string }) => {
      console.log('Task timeout:', data.taskId);
      this.taskTimeoutSubject.next(data);
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);

      this.connectionStatusSubject.next({
        connected: false,
        reconnecting: false,
      });

      // Attempt reconnection for unexpected disconnects
      if (!this.intentionalDisconnect) {
        // Don't reconnect for server-initiated disconnects
        if (reason !== 'io server disconnect') {
          this.attemptReconnect();
        } else {
          console.log('Server initiated disconnect, not reconnecting automatically');
        }
      }
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);

      this.connectionStatusSubject.next({
        connected: false,
        reconnecting: false,
        error: error.message,
      });

      // Attempt reconnection on connection errors
      if (!this.intentionalDisconnect) {
        this.attemptReconnect();
      }
    });
  }
}
