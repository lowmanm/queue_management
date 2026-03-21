import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { interval, switchMap } from 'rxjs';
import { startWith, takeUntil } from 'rxjs/operators';
import { MetricsSnapshot } from '@nexus-queue/shared-models';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-observability',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, PageLayoutComponent],
  templateUrl: './observability.component.html',
  styleUrl: './observability.component.scss',
})
export class ObservabilityComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroy$ = new Subject<void>();

  metrics = signal<MetricsSnapshot | null>(null);
  isLoading = signal(true);
  error = signal('');

  constructor() {
    interval(10000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http.get<MetricsSnapshot>(`${environment.apiUrl}/metrics/json`)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (snapshot) => {
          this.metrics.set(snapshot);
          this.isLoading.set(false);
          this.error.set('');
        },
        error: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : 'Failed to load metrics';
          this.error.set(message);
          this.isLoading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  totalQueueDepth(): number {
    const snapshot = this.metrics();
    if (!snapshot) return 0;
    return Object.values(snapshot.queueDepth).reduce((sum, v) => sum + v, 0);
  }

  totalAgentsOnline(): number {
    const snapshot = this.metrics();
    if (!snapshot) return 0;
    return Object.entries(snapshot.agentsActive)
      .filter(([state]) => state !== 'OFFLINE')
      .reduce((sum, [, count]) => sum + count, 0);
  }

  totalTasksToday(): number {
    const snapshot = this.metrics();
    if (!snapshot) return 0;
    return Object.values(snapshot.tasksTotal).reduce((sum, v) => sum + v, 0);
  }

  queueDepthEntries(): { name: string; depth: number }[] {
    const snapshot = this.metrics();
    if (!snapshot) return [];
    return Object.entries(snapshot.queueDepth).map(([name, depth]) => ({
      name,
      depth,
    }));
  }
}
