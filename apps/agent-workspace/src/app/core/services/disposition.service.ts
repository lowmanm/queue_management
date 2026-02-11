import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, map, tap, catchError, of } from 'rxjs';
import {
  Disposition,
  CompleteTaskRequest,
  TaskCompletion,
} from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

const LOG_CONTEXT = 'DispositionService';

/**
 * Service for managing dispositions in the agent workspace.
 * Handles loading context-specific dispositions and completing tasks with dispositions.
 */
@Injectable({
  providedIn: 'root',
})
export class DispositionService {
  private logger = inject(LoggerService);

  private dispositionsSubject = new BehaviorSubject<Disposition[]>([]);
  public dispositions$ = this.dispositionsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get all available dispositions
   */
  getAllDispositions(): Observable<Disposition[]> {
    return this.http.get<Disposition[]>(`${environment.apiUrl}/dispositions`);
  }

  /**
   * Get dispositions for a specific context (queue and work type)
   */
  getDispositionsForContext(
    queueId?: string,
    workTypeId?: string
  ): Observable<Disposition[]> {
    this.loadingSubject.next(true);

    let url = `${environment.apiUrl}/dispositions/context`;
    const params: string[] = [];

    if (queueId) {
      params.push(`queueId=${encodeURIComponent(queueId)}`);
    }
    if (workTypeId) {
      params.push(`workTypeId=${encodeURIComponent(workTypeId)}`);
    }

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    return this.http.get<Disposition[]>(url).pipe(
      tap((dispositions) => {
        this.logger.debug(LOG_CONTEXT, 'Loaded dispositions for context', {
          queueId,
          workTypeId,
          count: dispositions.length,
        });
        this.dispositionsSubject.next(dispositions);
        this.loadingSubject.next(false);
      }),
      catchError((error) => {
        this.logger.error(LOG_CONTEXT, 'Failed to load dispositions', error);
        this.loadingSubject.next(false);
        return of([]);
      })
    );
  }

  /**
   * Complete a task with a disposition.
   * Sends all required fields to the backend including agent/task context.
   */
  completeTaskWithDisposition(
    request: CompleteTaskRequest & {
      agentId?: string;
      workType?: string;
      queue?: string;
      assignedAt?: string;
    }
  ): Observable<TaskCompletion> {
    return this.http
      .post<TaskCompletion>(
        `${environment.apiUrl}/dispositions/complete`,
        request
      )
      .pipe(
        tap((completion) => {
          this.logger.info(LOG_CONTEXT, 'Task completed with disposition', {
            taskId: request.taskId,
            dispositionId: request.dispositionId,
            completionId: completion.id,
          });
        }),
        catchError((error) => {
          this.logger.error(LOG_CONTEXT, 'Failed to complete task', error);
          throw error;
        })
      );
  }

  /**
   * Get cached dispositions
   */
  get cachedDispositions(): Disposition[] {
    return this.dispositionsSubject.value;
  }
}
