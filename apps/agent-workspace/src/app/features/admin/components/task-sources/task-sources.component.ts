import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskSourceService } from '../../services/task-source.service';
import {
  TaskSource,
  CsvParseResult,
  PendingOrder,
  TaskQueueStats,
  FieldMapping,
  TaskMappableField,
} from '@nexus-queue/shared-models';

@Component({
  selector: 'app-task-sources',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-sources.component.html',
  styleUrls: ['./task-sources.component.scss'],
})
export class TaskSourcesComponent implements OnInit {
  private readonly taskSourceService = inject(TaskSourceService);

  // State
  sources = signal<TaskSource[]>([]);
  activeSource = signal<TaskSource | null>(null);
  orders = signal<PendingOrder[]>([]);
  queueStats = signal<TaskQueueStats | null>(null);
  parseResult = signal<CsvParseResult | null>(null);

  // UI State
  isLoading = signal(false);
  activeTab = signal<'upload' | 'queue' | 'config'>('upload');
  csvContent = signal('');
  previewUrl = signal('');
  errorMessage = signal('');
  successMessage = signal('');

  // Configuration form
  urlTemplate = signal('https://example.com/orders/{orderId}');
  fieldMappings = signal<FieldMapping[]>([
    { sourceField: 'OrderId', targetField: 'externalId', required: true },
    { sourceField: 'City', targetField: 'metadata' },
    { sourceField: 'State', targetField: 'metadata' },
  ]);

  // Sample data for URL preview
  sampleData = signal<Record<string, string>>({
    orderId: '123456',
    OrderId: '123456',
    City: 'Phoenix',
    State: 'Arizona',
  });

  // Computed
  pendingCount = computed(() => this.queueStats()?.totalPending ?? 0);
  assignedCount = computed(() => this.queueStats()?.totalAssigned ?? 0);
  completedCount = computed(() => this.queueStats()?.totalCompleted ?? 0);
  errorCount = computed(() => this.queueStats()?.totalErrors ?? 0);

  // Available target fields for mapping
  readonly targetFields: TaskMappableField[] = [
    'externalId',
    'workType',
    'title',
    'description',
    'priority',
    'queue',
    'skills',
    'metadata',
  ];

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);

    // Load sources
    this.taskSourceService.getAllSources().subscribe({
      next: (sources) => this.sources.set(sources),
      error: (err) => console.error('Failed to load sources', err),
    });

    // Load active source
    this.taskSourceService.getActiveSource().subscribe({
      next: (source) => {
        this.activeSource.set(source);
        if (source) {
          this.urlTemplate.set(source.urlTemplate);
          this.fieldMappings.set([...source.fieldMappings]);
        }
      },
      error: (err) => console.error('Failed to load active source', err),
    });

    // Load queue stats
    this.taskSourceService.getQueueStats().subscribe({
      next: (stats) => {
        this.queueStats.set(stats);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load queue stats', err);
        this.isLoading.set(false);
      },
    });

    // Load orders
    this.taskSourceService.getAllOrders().subscribe({
      next: (orders) => this.orders.set(orders),
      error: (err) => console.error('Failed to load orders', err),
    });
  }

  setActiveTab(tab: 'upload' | 'queue' | 'config'): void {
    this.activeTab.set(tab);
    this.clearMessages();
  }

  // ============ CSV Upload ============

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result as string;
        this.csvContent.set(content);
        this.parseResult.set(null);
        this.clearMessages();
      };

      reader.readAsText(file);
    }
  }

  uploadCsv(): void {
    if (!this.csvContent()) {
      this.errorMessage.set('Please select a CSV file first');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.taskSourceService.uploadCsv(this.csvContent()).subscribe({
      next: (result) => {
        this.parseResult.set(result);
        this.isLoading.set(false);

        if (result.success) {
          this.successMessage.set(
            `Successfully loaded ${result.successRows} orders (${result.errorRows} errors)`
          );
          this.loadData(); // Refresh all data
        } else {
          this.errorMessage.set(result.error || 'Failed to parse CSV');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to upload CSV: ' + (err.message || 'Unknown error'));
      },
    });
  }

  clearCsv(): void {
    this.csvContent.set('');
    this.parseResult.set(null);
    this.clearMessages();
  }

  // ============ Queue Management ============

  clearQueue(): void {
    if (!confirm('Are you sure you want to clear all orders from the queue?')) {
      return;
    }

    this.isLoading.set(true);
    this.taskSourceService.clearOrders().subscribe({
      next: () => {
        this.successMessage.set('Queue cleared successfully');
        this.loadData();
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to clear queue');
      },
    });
  }

  releaseOrder(rowIndex: number): void {
    this.taskSourceService.releaseOrder(rowIndex).subscribe({
      next: () => {
        this.successMessage.set(`Order ${rowIndex} released back to pending`);
        this.loadData();
      },
      error: () => this.errorMessage.set('Failed to release order'),
    });
  }

  // ============ Configuration ============

  updateUrlTemplate(): void {
    this.previewUrlFromTemplate();
  }

  previewUrlFromTemplate(): void {
    this.taskSourceService.previewUrl(this.urlTemplate(), this.sampleData()).subscribe({
      next: (result) => this.previewUrl.set(result.url),
      error: () => this.previewUrl.set('Error generating preview'),
    });
  }

  addFieldMapping(): void {
    const mappings = this.fieldMappings();
    mappings.push({ sourceField: '', targetField: 'metadata' });
    this.fieldMappings.set([...mappings]);
  }

  removeFieldMapping(index: number): void {
    const mappings = this.fieldMappings();
    mappings.splice(index, 1);
    this.fieldMappings.set([...mappings]);
  }

  saveConfiguration(): void {
    const source = this.activeSource();
    if (!source) {
      this.errorMessage.set('No active source to update');
      return;
    }

    this.isLoading.set(true);
    this.taskSourceService
      .updateSource(source.id, {
        urlTemplate: this.urlTemplate(),
        fieldMappings: this.fieldMappings(),
      })
      .subscribe({
        next: (updated) => {
          this.activeSource.set(updated);
          this.isLoading.set(false);
          this.successMessage.set('Configuration saved successfully');
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Failed to save configuration');
        },
      });
  }

  // ============ Helpers ============

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  getOrderStatusClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'status-pending';
      case 'ASSIGNED':
        return 'status-assigned';
      case 'COMPLETED':
        return 'status-completed';
      case 'ERROR':
        return 'status-error';
      default:
        return '';
    }
  }

  openUrl(url: string): void {
    window.open(url, '_blank');
  }
}
