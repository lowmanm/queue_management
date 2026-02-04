import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Task } from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';

export type AgentStatus = 'Available' | 'Busy';

@Injectable({
  providedIn: 'root',
})
export class QueueService {
  private currentTaskSubject = new BehaviorSubject<Task | null>(null);
  private agentStatusSubject = new BehaviorSubject<AgentStatus>('Available');

  public currentTask$: Observable<Task | null> =
    this.currentTaskSubject.asObservable();
  public agentStatus$: Observable<AgentStatus> =
    this.agentStatusSubject.asObservable();

  constructor(private http: HttpClient) {}

  get currentTask(): Task | null {
    return this.currentTaskSubject.value;
  }

  get agentStatus(): AgentStatus {
    return this.agentStatusSubject.value;
  }

  /**
   * Fetches the next available task from the backend.
   * Updates the currentTask BehaviorSubject with the result.
   */
  getNextTask(): Observable<Task> {
    return this.http.get<Task>(`${environment.apiUrl}/tasks/next`).pipe(
      tap((task) => {
        this.currentTaskSubject.next(task);
      })
    );
  }

  /**
   * Toggles the agent's availability status.
   */
  toggleStatus(): void {
    const newStatus: AgentStatus =
      this.agentStatusSubject.value === 'Available' ? 'Busy' : 'Available';
    this.agentStatusSubject.next(newStatus);
  }

  /**
   * Sets the agent's status explicitly.
   */
  setStatus(status: AgentStatus): void {
    this.agentStatusSubject.next(status);
  }

  /**
   * Clears the current task.
   */
  clearCurrentTask(): void {
    this.currentTaskSubject.next(null);
  }
}
