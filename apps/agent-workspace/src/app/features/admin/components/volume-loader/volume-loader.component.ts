import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { VolumeLoaderApiService, CsvUploadResult } from '../../services/volume-loader.service';
import { PipelineApiService } from '../../services/pipeline.service';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';
import {
  VolumeLoader,
  VolumeLoaderType,
  VolumeLoaderRun,
  VolumeLoaderSummary,
  VolumeLoaderTestResult,
  CreateVolumeLoaderRequest,
  UpdateVolumeLoaderRequest,
  VolumeFieldMapping,
  VolumeTaskField,
  ProcessingOptions,
  DataFormatConfig,
  VolumeLoaderSchedule,
  DEFAULT_PROCESSING_OPTIONS,
  DEFAULT_CSV_OPTIONS,
  GcsConfig,
  S3Config,
  HttpConfig,
  LocalConfig,
  Pipeline,
} from '@nexus-queue/shared-models';

@Component({
  selector: 'app-volume-loader',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageLayoutComponent],
  templateUrl: './volume-loader.component.html',
  styleUrls: ['./volume-loader.component.scss'],
})
export class VolumeLoaderComponent implements OnInit {
  private readonly loaderService = inject(VolumeLoaderApiService);
  private readonly pipelineService = inject(PipelineApiService);

  // Data
  loaders = signal<VolumeLoader[]>([]);
  pipelines = signal<Pipeline[]>([]);
  summary = signal<VolumeLoaderSummary | null>(null);
  selectedLoader = signal<VolumeLoader | null>(null);
  selectedLoaderRuns = signal<VolumeLoaderRun[]>([]);
  testResult = signal<VolumeLoaderTestResult | null>(null);

  // UI State
  isLoading = signal(false);
  showEditor = signal(false);
  showRunsPanel = signal(false);
  activeTab = signal<'loaders' | 'runs'>('loaders');
  errorMessage = signal('');
  successMessage = signal('');

  // Form state
  editingLoader = signal<VolumeLoader | null>(null);
  formData = signal<Partial<CreateVolumeLoaderRequest>>({
    name: '',
    description: '',
    type: 'GCS',
    config: { type: 'GCS', bucket: '', filePattern: '*.csv' } as GcsConfig,
    dataFormat: {
      format: 'CSV',
      csvOptions: DEFAULT_CSV_OPTIONS,
      encoding: 'utf-8',
    },
    fieldMappings: [],
    processingOptions: DEFAULT_PROCESSING_OPTIONS,
  });

  // CSV Upload state
  showUploadPanel = signal(false);
  uploadLoader = signal<VolumeLoader | null>(null);
  csvContent = signal('');
  uploadResult = signal<CsvUploadResult | null>(null);
  isUploading = signal(false);
  dryRunMode = signal(true); // Preview mode by default

  @ViewChild('csvFileInput') csvFileInput!: ElementRef<HTMLInputElement>;

  // Available options
  readonly loaderTypes: { value: VolumeLoaderType; label: string; icon: string }[] = [
    { value: 'GCS', label: 'Google Cloud Storage', icon: 'cloud' },
    { value: 'S3', label: 'Amazon S3', icon: 'cloud_queue' },
    { value: 'HTTP', label: 'REST API', icon: 'api' },
    { value: 'SFTP', label: 'SFTP Server', icon: 'folder_shared' },
    { value: 'LOCAL', label: 'Local File System', icon: 'folder_open' },
  ];

  readonly targetFields: { value: VolumeTaskField; label: string }[] = [
    { value: 'externalId', label: 'External ID' },
    { value: 'workType', label: 'Work Type' },
    { value: 'title', label: 'Title' },
    { value: 'description', label: 'Description' },
    { value: 'priority', label: 'Priority' },
    { value: 'queue', label: 'Queue' },
    { value: 'queueId', label: 'Queue ID' },
    { value: 'skills', label: 'Skills' },
    { value: 'payloadUrl', label: 'Payload URL' },
    { value: 'metadata', label: 'Metadata' },
  ];

  readonly dataFormats: { value: string; label: string }[] = [
    { value: 'CSV', label: 'CSV' },
    { value: 'JSON', label: 'JSON' },
    { value: 'JSONL', label: 'JSON Lines' },
    { value: 'XML', label: 'XML' },
    { value: 'EXCEL', label: 'Excel' },
  ];

  // Computed
  isEditMode = computed(() => this.editingLoader() !== null);
  enabledLoaders = computed(() => this.loaders().filter((l) => l.enabled));
  disabledLoaders = computed(() => this.loaders().filter((l) => !l.enabled));

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.clearMessages();

    this.loaderService.getAllLoaders().subscribe({
      next: (loaders) => {
        this.loaders.set(loaders);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load loaders', err);
        this.errorMessage.set('Failed to load volume loaders');
        this.isLoading.set(false);
      },
    });

    this.loaderService.getSummary().subscribe({
      next: (summary) => this.summary.set(summary),
    });

    // Load pipelines for the selector
    this.pipelineService.getAllPipelines().subscribe({
      next: (pipelines) => this.pipelines.set(pipelines),
      error: (err) => console.error('Failed to load pipelines', err),
    });
  }

  // ============ Loader Selection ============

  selectLoader(loader: VolumeLoader): void {
    this.selectedLoader.set(loader);
    this.showRunsPanel.set(true);
    this.loadLoaderRuns(loader.id);
  }

  loadLoaderRuns(loaderId: string): void {
    this.loaderService.getLoaderRuns(loaderId).subscribe({
      next: (runs) => this.selectedLoaderRuns.set(runs),
    });
  }

  closeRunsPanel(): void {
    this.showRunsPanel.set(false);
    this.selectedLoader.set(null);
    this.selectedLoaderRuns.set([]);
  }

  // ============ Editor ============

  openNewEditor(): void {
    this.editingLoader.set(null);
    this.formData.set({
      name: '',
      description: '',
      type: 'GCS',
      config: { type: 'GCS', bucket: '', filePattern: '*.csv' } as GcsConfig,
      dataFormat: {
        format: 'CSV',
        csvOptions: DEFAULT_CSV_OPTIONS,
        encoding: 'utf-8',
      },
      fieldMappings: [
        { sourceField: '', targetField: 'externalId', required: true },
        { sourceField: '', targetField: 'workType', required: true },
        { sourceField: '', targetField: 'title', required: true },
      ],
      processingOptions: DEFAULT_PROCESSING_OPTIONS,
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  openEditEditor(loader: VolumeLoader): void {
    this.editingLoader.set(loader);
    this.formData.set({
      name: loader.name,
      description: loader.description,
      type: loader.type,
      config: { ...loader.config },
      schedule: loader.schedule ? { ...loader.schedule } : undefined,
      dataFormat: { ...loader.dataFormat },
      fieldMappings: loader.fieldMappings.map((m) => ({ ...m })),
      defaults: loader.defaults ? { ...loader.defaults } : undefined,
      processingOptions: { ...loader.processingOptions },
      // @ts-ignore - pipelineId will be added to CreateVolumeLoaderRequest
      pipelineId: loader.pipelineId,
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingLoader.set(null);
    this.testResult.set(null);
    this.clearMessages();
  }

  saveLoader(): void {
    const data = this.formData();
    if (!data.name) {
      this.errorMessage.set('Name is required');
      return;
    }
    if (!data.fieldMappings || data.fieldMappings.length === 0) {
      this.errorMessage.set('At least one field mapping is required');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    const editing = this.editingLoader();
    if (editing) {
      const updates: UpdateVolumeLoaderRequest = {
        name: data.name,
        description: data.description,
        config: data.config,
        schedule: data.schedule,
        dataFormat: data.dataFormat,
        fieldMappings: data.fieldMappings,
        defaults: data.defaults,
        processingOptions: data.processingOptions,
      };
      this.loaderService.updateLoader(editing.id, updates).subscribe({
        next: (updated) => {
          const list = this.loaders();
          const index = list.findIndex((l) => l.id === updated.id);
          if (index >= 0) {
            list[index] = updated;
            this.loaders.set([...list]);
          }
          this.successMessage.set('Loader updated successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update loader');
          this.isLoading.set(false);
        },
      });
    } else {
      this.loaderService.createLoader(data as CreateVolumeLoaderRequest).subscribe({
        next: (created) => {
          this.loaders.set([created, ...this.loaders()]);
          this.successMessage.set('Loader created successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create loader');
          this.isLoading.set(false);
        },
      });
    }
  }

  // ============ Loader Control ============

  toggleLoader(loader: VolumeLoader): void {
    this.isLoading.set(true);
    const action = loader.enabled
      ? this.loaderService.disableLoader(loader.id)
      : this.loaderService.enableLoader(loader.id);

    action.subscribe({
      next: (updated) => {
        const list = this.loaders();
        const index = list.findIndex((l) => l.id === updated.id);
        if (index >= 0) {
          list[index] = updated;
          this.loaders.set([...list]);
        }
        this.successMessage.set(`Loader ${updated.enabled ? 'enabled' : 'disabled'}`);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to toggle loader');
        this.isLoading.set(false);
      },
    });
  }

  runLoader(loader: VolumeLoader): void {
    this.isLoading.set(true);
    this.loaderService.triggerRun(loader.id).subscribe({
      next: (run) => {
        this.successMessage.set(`Run started: ${run.id}`);
        this.isLoading.set(false);
        // Refresh loader to get updated status
        setTimeout(() => this.loadData(), 1000);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to trigger run');
        this.isLoading.set(false);
      },
    });
  }

  deleteLoader(loader: VolumeLoader): void {
    if (!confirm(`Are you sure you want to delete "${loader.name}"?`)) {
      return;
    }

    this.isLoading.set(true);
    this.loaderService.deleteLoader(loader.id).subscribe({
      next: () => {
        this.loaders.set(this.loaders().filter((l) => l.id !== loader.id));
        this.successMessage.set('Loader deleted');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete loader');
        this.isLoading.set(false);
      },
    });
  }

  testConnection(): void {
    const editing = this.editingLoader();
    if (!editing) return;

    this.isLoading.set(true);
    this.loaderService.testConnection(editing.id).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.isLoading.set(false);
        if (result.connectionSuccess) {
          this.successMessage.set('Connection test successful');
        } else {
          this.errorMessage.set(result.connectionError || 'Connection test failed');
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to test connection');
        this.isLoading.set(false);
      },
    });
  }

  // ============ Form Helpers ============

  updateFormField<K extends keyof CreateVolumeLoaderRequest>(
    field: K,
    value: CreateVolumeLoaderRequest[K]
  ): void {
    this.formData.set({ ...this.formData(), [field]: value });
  }

  onTypeChange(type: VolumeLoaderType): void {
    let config: any;
    switch (type) {
      case 'GCS':
        config = { type: 'GCS', bucket: '', filePattern: '*.csv' };
        break;
      case 'S3':
        config = { type: 'S3', bucket: '', region: 'us-east-1', filePattern: '*.csv' };
        break;
      case 'HTTP':
        config = { type: 'HTTP', url: '', method: 'GET' };
        break;
      case 'SFTP':
        config = { type: 'SFTP', host: '', port: 22, username: '', remotePath: '/', filePattern: '*.csv' };
        break;
      case 'LOCAL':
        config = { type: 'LOCAL', directory: '/tmp', filePattern: '*.csv' };
        break;
    }
    this.formData.set({
      ...this.formData(),
      type,
      config,
    });
  }

  addFieldMapping(): void {
    const mappings = this.formData().fieldMappings || [];
    mappings.push({ sourceField: '', targetField: 'metadata', required: false });
    this.updateFormField('fieldMappings', [...mappings]);
  }

  removeFieldMapping(index: number): void {
    const mappings = this.formData().fieldMappings || [];
    mappings.splice(index, 1);
    this.updateFormField('fieldMappings', [...mappings]);
  }

  updateFieldMapping(index: number, field: keyof VolumeFieldMapping, value: any): void {
    const mappings = this.formData().fieldMappings || [];
    if (mappings[index]) {
      (mappings[index] as any)[field] = value;
      this.updateFormField('fieldMappings', [...mappings]);
    }
  }

  updateProcessingOption<K extends keyof ProcessingOptions>(
    field: K,
    value: ProcessingOptions[K]
  ): void {
    const current = this.formData().processingOptions || DEFAULT_PROCESSING_OPTIONS;
    this.updateFormField('processingOptions', { ...current, [field]: value });
  }

  updateConfigField(field: string, value: any): void {
    const config = this.formData().config;
    if (config) {
      (config as any)[field] = value;
      this.updateFormField('config', { ...config });
    }
  }

  updateDataFormatField(field: string, value: any): void {
    const dataFormat = this.formData().dataFormat;
    if (dataFormat) {
      (dataFormat as any)[field] = value;
      this.updateFormField('dataFormat', { ...dataFormat });
    }
  }

  getConfigValue(field: string): any {
    const config = this.formData().config;
    return config ? (config as any)[field] : undefined;
  }

  // ============ Display Helpers ============

  getLoaderTypeIcon(type: VolumeLoaderType): string {
    return this.loaderTypes.find((t) => t.value === type)?.icon || 'storage';
  }

  getLoaderTypeLabel(type: VolumeLoaderType): string {
    return this.loaderTypes.find((t) => t.value === type)?.label || type;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'RUNNING':
        return 'status-running';
      case 'IDLE':
      case 'SCHEDULED':
        return 'status-idle';
      case 'ERROR':
        return 'status-error';
      case 'DISABLED':
        return 'status-disabled';
      default:
        return '';
    }
  }

  getRunStatusClass(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'run-completed';
      case 'PARTIAL':
        return 'run-partial';
      case 'FAILED':
        return 'run-failed';
      case 'RUNNING':
        return 'run-running';
      default:
        return '';
    }
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  }

  formatDuration(ms: number | undefined): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  // ============ CSV Upload ============

  /**
   * Open the CSV upload panel for a loader
   */
  openUploadPanel(loader: VolumeLoader): void {
    this.uploadLoader.set(loader);
    this.showUploadPanel.set(true);
    this.csvContent.set('');
    this.uploadResult.set(null);
    this.dryRunMode.set(true);
    this.clearMessages();
  }

  /**
   * Close the CSV upload panel
   */
  closeUploadPanel(): void {
    this.showUploadPanel.set(false);
    this.uploadLoader.set(null);
    this.csvContent.set('');
    this.uploadResult.set(null);
  }

  /**
   * Handle file selection for CSV upload
   */
  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.name.endsWith('.csv')) {
      this.errorMessage.set('Please select a CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      this.csvContent.set(content);
      // Auto-preview on file load
      this.uploadCsv(true);
    };
    reader.onerror = () => {
      this.errorMessage.set('Failed to read file');
    };
    reader.readAsText(file);
  }

  /**
   * Handle CSV paste into textarea
   */
  onCsvPaste(): void {
    // The content is already bound via ngModel
    // Just trigger a preview after a short delay for the model to update
    setTimeout(() => {
      if (this.csvContent()) {
        this.uploadCsv(true);
      }
    }, 100);
  }

  /**
   * Upload/process CSV content
   */
  uploadCsv(dryRun = false): void {
    const loader = this.uploadLoader();
    if (!loader) return;

    const content = this.csvContent();
    if (!content.trim()) {
      this.errorMessage.set('Please provide CSV content');
      return;
    }

    this.isUploading.set(true);
    this.clearMessages();

    this.loaderService.uploadCsv(loader.id, content, dryRun).subscribe({
      next: (result) => {
        this.uploadResult.set(result);
        this.isUploading.set(false);
        if (result.success) {
          if (dryRun) {
            this.successMessage.set(
              `Preview: ${result.recordsFound} records found, ${result.recordsProcessed} valid, ` +
              `${result.recordsFailed} errors`
            );
          } else {
            this.successMessage.set(
              `Uploaded: ${result.recordsProcessed} tasks created, ${result.recordsFailed} failed, ` +
              `${result.recordsSkipped} skipped`
            );
            // Clear the content after successful upload
            this.csvContent.set('');
          }
        } else {
          this.errorMessage.set(result.error || 'Upload failed');
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload CSV');
        this.isUploading.set(false);
      },
    });
  }

  /**
   * Trigger file input click
   */
  triggerFileInput(): void {
    this.csvFileInput?.nativeElement?.click();
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  // ============ Pipeline Helpers ============

  /**
   * Get pipeline name by ID
   */
  getPipelineName(pipelineId: string | undefined): string {
    if (!pipelineId) return 'Not assigned';
    const pipeline = this.pipelines().find((p) => p.id === pipelineId);
    return pipeline?.name || pipelineId;
  }

  /**
   * Update pipelineId on the loader
   */
  updatePipelineId(pipelineId: string): void {
    // Store pipelineId as a custom field in formData
    // We'll need to add this to the interface or handle it separately
    const current = this.formData();
    this.formData.set({
      ...current,
      // @ts-ignore - pipelineId will be added to CreateVolumeLoaderRequest
      pipelineId: pipelineId || undefined,
    });
  }

  /**
   * Get current pipelineId from form data
   */
  getFormPipelineId(): string {
    // @ts-ignore - pipelineId will be added to CreateVolumeLoaderRequest
    return (this.formData() as any).pipelineId || '';
  }
}
