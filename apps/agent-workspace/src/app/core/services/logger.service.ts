import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  levelName: string;
  context: string;
  message: string;
  data?: unknown;
}

/**
 * Centralized logging service for the Agent Workspace
 *
 * Features:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - In-memory log storage for export/review
 * - Formatted console output
 * - Observable log stream for UI components
 * - Export to clipboard/download
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private currentLevel: LogLevel = LogLevel.DEBUG;

  private logsSubject = new BehaviorSubject<LogEntry[]>([]);
  public logs$: Observable<LogEntry[]> = this.logsSubject.asObservable();

  private levelColors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '#9e9e9e',
    [LogLevel.INFO]: '#2196f3',
    [LogLevel.WARN]: '#ff9800',
    [LogLevel.ERROR]: '#f44336',
  };

  private levelNames: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
  };

  /**
   * Set the minimum log level to display
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    this.info('Logger', `Log level set to ${this.levelNames[level]}`);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Log a DEBUG message
   */
  debug(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  /**
   * Log an INFO message
   */
  info(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  /**
   * Log a WARN message
   */
  warn(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, context, message, data);
  }

  /**
   * Log an ERROR message
   */
  error(context: string, message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, context, message, data);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      levelName: this.levelNames[level],
      context,
      message,
      data,
    };

    // Store log entry
    this.logs.push(entry);

    // Trim if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Emit to subscribers
    this.logsSubject.next([...this.logs]);

    // Output to console if level is sufficient
    if (level >= this.currentLevel) {
      this.consoleOutput(entry);
    }
  }

  /**
   * Format and output to browser console
   */
  private consoleOutput(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const color = this.levelColors[entry.level];
    const prefix = `%c[${timestamp}] [${entry.levelName}] [${entry.context}]`;

    const args: unknown[] = [
      prefix,
      `color: ${color}; font-weight: bold;`,
      entry.message,
    ];

    if (entry.data !== undefined) {
      args.push(entry.data);
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.info(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }

  /**
   * Get all stored logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level >= level);
  }

  /**
   * Get logs filtered by context
   */
  getLogsByContext(context: string): LogEntry[] {
    return this.logs.filter((log) =>
      log.context.toLowerCase().includes(context.toLowerCase())
    );
  }

  /**
   * Clear all stored logs
   */
  clearLogs(): void {
    this.logs = [];
    this.logsSubject.next([]);
    this.info('Logger', 'Logs cleared');
  }

  /**
   * Export logs as formatted text
   */
  exportAsText(): string {
    return this.logs
      .map((entry) => {
        const timestamp = entry.timestamp.toISOString();
        const dataStr = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
        return `[${timestamp}] [${entry.levelName}] [${entry.context}] ${entry.message}${dataStr}`;
      })
      .join('\n');
  }

  /**
   * Export logs as JSON
   */
  exportAsJson(): string {
    return JSON.stringify(
      this.logs.map((entry) => ({
        timestamp: entry.timestamp.toISOString(),
        level: entry.levelName,
        context: entry.context,
        message: entry.message,
        data: entry.data,
      })),
      null,
      2
    );
  }

  /**
   * Copy logs to clipboard
   */
  async copyToClipboard(format: 'text' | 'json' = 'text'): Promise<boolean> {
    try {
      const content = format === 'json' ? this.exportAsJson() : this.exportAsText();
      await navigator.clipboard.writeText(content);
      this.info('Logger', `Logs copied to clipboard (${format})`);
      return true;
    } catch (err) {
      this.error('Logger', 'Failed to copy logs to clipboard', err);
      return false;
    }
  }

  /**
   * Download logs as a file
   */
  downloadLogs(format: 'text' | 'json' = 'text'): void {
    const content = format === 'json' ? this.exportAsJson() : this.exportAsText();
    const extension = format === 'json' ? 'json' : 'txt';
    const mimeType = format === 'json' ? 'application/json' : 'text/plain';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `nexus-queue-logs-${timestamp}.${extension}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.info('Logger', `Logs downloaded as ${filename}`);
  }

  /**
   * Get summary statistics
   */
  getStats(): { total: number; byLevel: Record<string, number> } {
    const byLevel: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.levelName]++;
    });

    return {
      total: this.logs.length,
      byLevel,
    };
  }
}
