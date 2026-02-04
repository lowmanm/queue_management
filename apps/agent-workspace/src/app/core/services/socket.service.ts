import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Task, AgentState } from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';

export interface ConnectionStatus {
  connected: boolean;
  agentId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;

  // Connection status
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>({
    connected: false,
  });
  public connectionStatus$: Observable<ConnectionStatus> =
    this.connectionStatusSubject.asObservable();

  // Task events
  private taskAssignedSubject = new Subject<Task>();
  public taskAssigned$: Observable<Task> = this.taskAssignedSubject.asObservable();

  private taskTimeoutSubject = new Subject<{ taskId: string }>();
  public taskTimeout$: Observable<{ taskId: string }> =
    this.taskTimeoutSubject.asObservable();

  get isConnected(): boolean {
    return this.connectionStatusSubject.value.connected;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(agentId: string, agentName: string): void {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Extract base URL (remove /api suffix)
    const wsUrl = environment.apiUrl.replace('/api', '');

    console.log(`Connecting to WebSocket: ${wsUrl}/queue`);

    this.socket = io(`${wsUrl}/queue`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    this.setupEventListeners(agentId, agentName);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionStatusSubject.next({ connected: false });
    }
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
      this.connectionStatusSubject.next({
        connected: true,
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
      this.connectionStatusSubject.next({ connected: false });
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.connectionStatusSubject.next({ connected: false });
    });
  }
}
