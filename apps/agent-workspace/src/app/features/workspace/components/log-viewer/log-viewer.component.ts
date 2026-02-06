import { Component, OnInit, OnDestroy, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { LoggerService, LogEntry, LogLevel } from '../../../../core/services';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './log-viewer.component.html',
  styleUrl: './log-viewer.component.scss',
})
export class LogViewerComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();

  private logger = inject(LoggerService);
  private destroy$ = new Subject<void>();

  logs: LogEntry[] = [];
  filteredLogs: LogEntry[] = [];
  selectedLevel: LogLevel = LogLevel.DEBUG;
  filterContext = '';
  autoScroll = true;

  // For template access
  LogLevel = LogLevel;

  ngOnInit(): void {
    // Subscribe to logs updates
    this.logger.logs$.pipe(takeUntil(this.destroy$)).subscribe((logs) => {
      this.logs = logs;
      this.applyFilters();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters(): void {
    this.filteredLogs = this.logs.filter((log) => {
      const levelMatch = log.level >= this.selectedLevel;
      const contextMatch =
        !this.filterContext ||
        log.context.toLowerCase().includes(this.filterContext.toLowerCase());
      return levelMatch && contextMatch;
    });
  }

  onLevelChange(level: LogLevel): void {
    this.selectedLevel = level;
    this.applyFilters();
  }

  onContextFilterChange(): void {
    this.applyFilters();
  }

  clearLogs(): void {
    this.logger.clearLogs();
  }

  copyToClipboard(format: 'text' | 'json'): void {
    this.logger.copyToClipboard(format);
  }

  downloadLogs(format: 'text' | 'json'): void {
    this.logger.downloadLogs(format);
  }

  getStats(): { total: number; byLevel: Record<string, number> } {
    return this.logger.getStats();
  }

  getLevelClass(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'level-debug';
      case LogLevel.INFO:
        return 'level-info';
      case LogLevel.WARN:
        return 'level-warn';
      case LogLevel.ERROR:
        return 'level-error';
      default:
        return '';
    }
  }

  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  }

  formatData(data: unknown): string {
    if (data === undefined || data === null) return '';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  onClose(): void {
    this.close.emit();
  }
}
