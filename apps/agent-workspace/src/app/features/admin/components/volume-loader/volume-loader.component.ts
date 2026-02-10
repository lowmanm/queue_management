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
  ProcessingOptions,
  VolumeTaskDefaults,
  DEFAULT_PROCESSING_OPTIONS,
  DEFAULT_CSV_OPTIONS,
  CsvFormatOptions,
  GcsConfig,
  S3Config,
  HttpConfig,
  LocalConfig,
  Pipeline,
  PipelineQueue,
  RoutingRule,
  RoutingCondition,
  RoutingOperator,
  ROUTING_OPERATORS_BY_TYPE,
  ROUTING_OPERATOR_LABELS,
  DetectedField,
  ParseSampleFileResult,
  DetectedFieldType,
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

  // Wizard/Stepper state
  currentStep = signal(1);
  readonly wizardSteps = [
    { step: 1, title: 'Basic Info', description: 'Name and source type' },
    { step: 2, title: 'Pipeline', description: 'Select target pipeline' },
    { step: 3, title: 'Connection', description: 'Configure source' },
    { step: 4, title: 'Data Format', description: 'CSV/JSON settings' },
    { step: 5, title: 'Sample File', description: 'Upload to detect fields' },
    { step: 6, title: 'Field Mappings', description: 'Select primary ID' },
    { step: 7, title: 'URL & Options', description: 'Work URL and processing' },
    { step: 8, title: 'Queues', description: 'Configure queues' },
    { step: 9, title: 'Routing', description: 'Set routing rules' },
  ];

  // Sample file parsing state
  sampleFileContent = signal('');
  sampleFileName = signal('');
  sampleParseResult = signal<ParseSampleFileResult | null>(null);
  detectedFields = signal<DetectedField[]>([]);
  selectedPrimaryIdField = signal<string>('');
  isParsingSample = signal(false);

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
    defaults: {},
    processingOptions: DEFAULT_PROCESSING_OPTIONS,
  });

  // CSV Upload state
  showUploadPanel = signal(false);
  uploadLoader = signal<VolumeLoader | null>(null);
  csvContent = signal('');
  uploadResult = signal<CsvUploadResult | null>(null);
  isUploading = signal(false);
  dryRunMode = signal(true); // Preview mode by default

  // Inline pipeline creation state
  showInlinePipelineCreator = signal(false);
  newPipelineName = signal('');
  newPipelineDescription = signal('');

  // Queue setup state (Step 8)
  pipelineQueues = signal<PipelineQueue[]>([]);
  showAddQueueForm = signal(false);
  newQueueName = signal('');
  newQueueDescription = signal('');
  newQueuePriority = signal(5);
  newQueueSkills = signal('');

  // Routing rules state (Step 9)
  pipelineRoutingRules = signal<RoutingRule[]>([]);
  showAddRuleForm = signal(false);
  newRuleName = signal('');
  newRuleConditions = signal<{ field: string; operator: RoutingOperator; value: string }[]>([
    { field: '', operator: 'equals', value: '' },
  ]);
  newRuleConditionLogic = signal<'AND' | 'OR'>('AND');
  newRuleTargetQueue = signal('');

  // Convenience accessors for the "active" condition (used by availableOperators computed)
  activeConditionIndex = signal(0);

  @ViewChild('csvFileInput') csvFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('sampleFileInput') sampleFileInput!: ElementRef<HTMLInputElement>;

  // Available options
  readonly loaderTypes: { value: VolumeLoaderType; label: string; icon: string }[] = [
    { value: 'GCS', label: 'Google Cloud Storage', icon: 'cloud' },
    { value: 'S3', label: 'Amazon S3', icon: 'cloud_queue' },
    { value: 'HTTP', label: 'REST API', icon: 'api' },
    { value: 'SFTP', label: 'SFTP Server', icon: 'folder_shared' },
    { value: 'LOCAL', label: 'Local File System', icon: 'folder_open' },
  ];

  // Field type display labels
  readonly fieldTypeLabels: Record<DetectedFieldType, string> = {
    string: 'Text',
    number: 'Number',
    integer: 'Integer',
    boolean: 'Boolean',
    date: 'Date',
    datetime: 'Date/Time',
    timestamp: 'Timestamp',
    email: 'Email',
    url: 'URL',
    phone: 'Phone',
    currency: 'Currency',
    empty: 'Empty',
  };

  readonly dataFormats: { value: string; label: string }[] = [
    { value: 'CSV', label: 'CSV' },
    { value: 'JSON', label: 'JSON' },
    { value: 'JSONL', label: 'JSON Lines' },
    { value: 'XML', label: 'XML' },
    { value: 'EXCEL', label: 'Excel' },
  ];

  readonly delimiterOptions: { value: string; label: string }[] = [
    { value: ',', label: ', (Comma)' },
    { value: '\t', label: 'Tab' },
    { value: ';', label: '; (Semicolon)' },
    { value: '|', label: '| (Pipe)' },
    { value: ' ', label: 'Space' },
  ];

  // Field type options for dropdown
  readonly fieldTypeOptions: { value: DetectedFieldType; label: string }[] = [
    { value: 'string', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'integer', label: 'Integer' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date/Time' },
    { value: 'timestamp', label: 'Timestamp' },
    { value: 'email', label: 'Email' },
    { value: 'url', label: 'URL' },
    { value: 'phone', label: 'Phone' },
    { value: 'currency', label: 'Currency' },
  ];

  // Computed
  isEditMode = computed(() => this.editingLoader() !== null);

  // Operator labels for display
  readonly operatorLabels = ROUTING_OPERATOR_LABELS;

  /**
   * Get available operators for a given field name based on its detected type.
   */
  getOperatorsForField(fieldName: string): RoutingOperator[] {
    if (!fieldName) return ROUTING_OPERATORS_BY_TYPE['string'];
    const field = this.detectedFields().find((f) => f.name === fieldName);
    const fieldType = field?.detectedType || 'string';
    return ROUTING_OPERATORS_BY_TYPE[fieldType] || ROUTING_OPERATORS_BY_TYPE['string'];
  }
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
    this.currentStep.set(1); // Start at step 1 for new loaders
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
      fieldMappings: [], // Will be auto-generated from sample file
      processingOptions: DEFAULT_PROCESSING_OPTIONS,
    });
    // Reset sample file state
    this.sampleFileContent.set('');
    this.sampleFileName.set('');
    this.sampleParseResult.set(null);
    this.detectedFields.set([]);
    this.selectedPrimaryIdField.set('');
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

    // Reconstruct schema state from saved field mappings
    this.reconstructSchemaFromMappings(loader.fieldMappings);

    // Set the primary ID field
    const primaryMapping = loader.fieldMappings.find((m) => m.isPrimaryId);
    if (primaryMapping) {
      this.selectedPrimaryIdField.set(primaryMapping.sourceField);
    }

    // Load pipeline queues/routing rules if pipeline is assigned
    if (loader.pipelineId) {
      this.pipelineQueues.set([]);
      this.pipelineRoutingRules.set([]);
      this.loadPipelineQueuesAndRules();
    }

    this.currentStep.set(1);
    this.showEditor.set(true);
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingLoader.set(null);
    this.testResult.set(null);
    this.currentStep.set(1);
    // Reset sample file state
    this.sampleFileContent.set('');
    this.sampleFileName.set('');
    this.sampleParseResult.set(null);
    this.detectedFields.set([]);
    this.selectedPrimaryIdField.set('');
    this.clearMessages();
  }

  // ============ Wizard Navigation ============

  goToStep(step: number): void {
    if (step >= 1 && step <= this.wizardSteps.length) {
      this.currentStep.set(step);
    }
  }

  nextStep(): void {
    const current = this.currentStep();
    if (current < this.wizardSteps.length) {
      // Validate current step before proceeding
      if (this.validateCurrentStep()) {
        const nextStep = current + 1;
        this.currentStep.set(nextStep);
        // Load pipeline queues/rules when entering steps 8 or 9
        if ((nextStep === 8 || nextStep === 9) && this.getFormPipelineId()) {
          this.loadPipelineQueuesAndRules();
        }
      }
    }
  }

  prevStep(): void {
    const current = this.currentStep();
    if (current > 1) {
      this.currentStep.set(current - 1);
    }
  }

  validateCurrentStep(): boolean {
    const data = this.formData();
    const step = this.currentStep();
    this.clearMessages();

    switch (step) {
      case 1: // Basic Info
        if (!data.name?.trim()) {
          this.errorMessage.set('Name is required');
          return false;
        }
        return true;

      case 2: // Pipeline
        // Pipeline is optional but recommended
        return true;

      case 3: // Connection
        // Basic validation based on type
        if (data.type === 'GCS') {
          const config = data.config as GcsConfig;
          if (!config?.bucket) {
            this.errorMessage.set('Bucket name is required');
            return false;
          }
        } else if (data.type === 'S3') {
          const config = data.config as S3Config;
          if (!config?.bucket) {
            this.errorMessage.set('Bucket name is required');
            return false;
          }
        } else if (data.type === 'HTTP') {
          const config = data.config as HttpConfig;
          if (!config?.url) {
            this.errorMessage.set('URL is required');
            return false;
          }
        } else if (data.type === 'LOCAL') {
          const config = data.config as LocalConfig;
          if (!config?.directory) {
            this.errorMessage.set('Directory path is required');
            return false;
          }
        }
        return true;

      case 4: // Data Format
        return true;

      case 5: // Sample File
        // Check if sample was uploaded and parsed successfully
        const parseResult = this.sampleParseResult();
        if (!parseResult || !parseResult.success) {
          this.errorMessage.set('Please upload a valid sample file to detect fields');
          return false;
        }
        if (this.detectedFields().length === 0) {
          this.errorMessage.set('No fields were detected. Please check the file format.');
          return false;
        }
        return true;

      case 6: // Field Mappings
        if (!data.fieldMappings || data.fieldMappings.length === 0) {
          this.errorMessage.set('At least one field mapping is required');
          return false;
        }
        // Check that a primary ID field is selected
        const hasPrimaryId = data.fieldMappings.some((m) => m.isPrimaryId);
        if (!hasPrimaryId) {
          this.errorMessage.set('Please select a primary ID field (unique identifier)');
          return false;
        }
        return true;

      case 7: // Options
        return true;

      case 8: // Queues (optional)
        return true;

      case 9: // Routing (optional)
        return true;

      default:
        return true;
    }
  }

  isStepComplete(step: number): boolean {
    const data = this.formData();

    switch (step) {
      case 1:
        return !!data.name?.trim();
      case 2:
        return true; // Optional
      case 3:
        if (data.type === 'GCS') return !!(data.config as GcsConfig)?.bucket;
        if (data.type === 'S3') return !!(data.config as S3Config)?.bucket;
        if (data.type === 'HTTP') return !!(data.config as HttpConfig)?.url;
        if (data.type === 'LOCAL') return !!(data.config as LocalConfig)?.directory;
        return true;
      case 4:
        return true;
      case 5: // Sample File
        const parseResult = this.sampleParseResult();
        return !!parseResult?.success && this.detectedFields().length > 0;
      case 6: // Field Mappings
        return (data.fieldMappings?.length || 0) > 0 && data.fieldMappings?.some((m) => m.isPrimaryId) === true;
      case 7:
        return true;
      case 8: // Queues (optional)
        return true;
      case 9: // Routing (optional)
        return true;
      default:
        return false;
    }
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
    this.clearMessages();
    this.successMessage.set('Run started — processing records...');

    this.loaderService.triggerRun(loader.id).subscribe({
      next: (run) => {
        // Poll for completion since processing is async on the backend
        this.pollRunStatus(loader.id, run.id, 0);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to trigger run');
        this.isLoading.set(false);
      },
    });
  }

  private pollRunStatus(loaderId: string, runId: string, attempt: number): void {
    const maxAttempts = 20; // ~10 seconds max
    if (attempt >= maxAttempts) {
      this.successMessage.set('Run is still processing. Refresh to see results.');
      this.isLoading.set(false);
      this.loadData();
      return;
    }

    setTimeout(() => {
      this.loaderService.getRun(loaderId, runId).subscribe({
        next: (run) => {
          if (!run || run.status === 'RUNNING') {
            this.pollRunStatus(loaderId, runId, attempt + 1);
          } else {
            this.isLoading.set(false);
            if (run.status === 'COMPLETED') {
              this.successMessage.set(
                `Run complete: ${run.recordsProcessed} records processed, ` +
                `${run.recordsFailed} failed, ${run.recordsSkipped} skipped`
              );
            } else if (run.status === 'PARTIAL') {
              this.successMessage.set(
                `Run completed with errors: ${run.recordsProcessed}/${run.recordsFound} records processed`
              );
            } else {
              this.errorMessage.set(
                `Run failed: ${run.errorLog?.[0]?.message || 'Unknown error'}`
              );
            }
            this.loadData();
          }
        },
        error: () => {
          this.pollRunStatus(loaderId, runId, attempt + 1);
        },
      });
    }, 500);
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
        config = { type: 'HTTP', url: '', method: 'GET', authType: 'none', urlTemplate: '', urlField: '' };
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
    mappings.push({ sourceField: '', targetField: '', isPrimaryId: false, required: false });
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

  updateDefault<K extends keyof VolumeTaskDefaults>(
    field: K,
    value: VolumeTaskDefaults[K]
  ): void {
    const current = this.formData().defaults || {};
    this.updateFormField('defaults', { ...current, [field]: value });
  }

  /**
   * Append a field placeholder to the URL template input.
   */
  insertPlaceholder(fieldName: string): void {
    const current = this.formData().defaults?.payloadUrlTemplate || '';
    this.updateDefault('payloadUrlTemplate', current + `{${fieldName}}`);
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

  getCsvOptionValue(field: string): any {
    const dataFormat = this.formData().dataFormat;
    if (dataFormat?.csvOptions) {
      return (dataFormat.csvOptions as any)[field];
    }
    // Return defaults
    switch (field) {
      case 'delimiter':
        return ',';
      case 'quoteChar':
        return '"';
      case 'hasHeader':
        return true;
      case 'trimWhitespace':
        return true;
      default:
        return undefined;
    }
  }

  updateCsvOption(field: string, value: any): void {
    const dataFormat = this.formData().dataFormat;
    if (dataFormat) {
      const csvOptions = dataFormat.csvOptions || { ...DEFAULT_CSV_OPTIONS };
      (csvOptions as any)[field] = value;
      this.updateFormField('dataFormat', {
        ...dataFormat,
        csvOptions: { ...csvOptions },
      });
    }
  }

  // ============ Sample File Parsing ============

  /**
   * Handle sample file selection for schema detection
   */
  onSampleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.sampleFileName.set(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      this.sampleFileContent.set(content);
      // Auto-parse on file load
      this.parseSampleFile();
    };
    reader.onerror = () => {
      this.errorMessage.set('Failed to read sample file');
    };
    reader.readAsText(file);

    // Clear the input so the same file can be selected again
    input.value = '';
  }

  /**
   * Trigger sample file input click
   */
  triggerSampleFileInput(): void {
    this.sampleFileInput?.nativeElement?.click();
  }

  /**
   * Parse sample file content and detect fields
   */
  parseSampleFile(): void {
    const content = this.sampleFileContent();
    if (!content.trim()) {
      this.errorMessage.set('Please provide sample file content');
      return;
    }

    this.isParsingSample.set(true);
    this.clearMessages();

    // Detect format from file name or content
    const fileName = this.sampleFileName() || 'sample.csv';
    const dataFormat = this.formData().dataFormat;
    const format = dataFormat?.format || this.detectFormatFromFileName(fileName);

    // Parse based on format
    try {
      let result: ParseSampleFileResult;

      if (format === 'CSV') {
        result = this.parseCsvContent(content, dataFormat?.csvOptions);
      } else if (format === 'JSON' || format === 'JSONL') {
        result = this.parseJsonContent(content, format === 'JSONL');
      } else {
        result = {
          success: false,
          error: `Unsupported format: ${format}`,
          detectedFields: [],
          sampleData: [],
          totalRows: 0,
          failedRows: 0,
        };
      }

      this.sampleParseResult.set(result);

      if (result.success) {
        this.detectedFields.set(result.detectedFields);
        // Auto-select suggested primary ID field
        if (result.suggestedPrimaryIdField) {
          this.selectedPrimaryIdField.set(result.suggestedPrimaryIdField);
        }
        // Auto-generate field mappings
        this.generateFieldMappingsFromDetectedFields(result.detectedFields, result.suggestedPrimaryIdField);
        this.successMessage.set(
          `Detected ${result.detectedFields.length} fields from ${result.totalRows} rows`
        );
      } else {
        this.errorMessage.set(result.error || 'Failed to parse sample file');
      }
    } catch (err: any) {
      this.sampleParseResult.set({
        success: false,
        error: err.message || 'Failed to parse sample file',
        detectedFields: [],
        sampleData: [],
        totalRows: 0,
        failedRows: 0,
      });
      this.errorMessage.set(err.message || 'Failed to parse sample file');
    }

    this.isParsingSample.set(false);
  }

  /**
   * Detect file format from file name
   */
  private detectFormatFromFileName(fileName: string): 'CSV' | 'JSON' | 'JSONL' {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.json')) return 'JSON';
    if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) return 'JSONL';
    return 'CSV';
  }

  /**
   * Parse CSV content and detect field types
   */
  private parseCsvContent(
    content: string,
    options?: Partial<CsvFormatOptions>
  ): ParseSampleFileResult {
    const delimiter = options?.delimiter || ',';
    const hasHeader = options?.hasHeader !== false;
    const skipRows = options?.skipRows || 0;

    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
      return {
        success: false,
        error: 'File is empty',
        detectedFields: [],
        sampleData: [],
        totalRows: 0,
        failedRows: 0,
      };
    }

    // Skip initial rows if configured
    const dataLines = lines.slice(skipRows);
    if (dataLines.length === 0) {
      return {
        success: false,
        error: 'No data after skipping rows',
        detectedFields: [],
        sampleData: [],
        totalRows: 0,
        failedRows: 0,
      };
    }

    // Parse headers
    const headerLine = dataLines[0];
    const headers = this.parseCsvLine(headerLine, delimiter);

    // If no header, generate column names
    const columnNames = hasHeader
      ? headers
      : headers.map((_, i) => `column_${i + 1}`);

    // Parse data rows
    const startRow = hasHeader ? 1 : 0;
    const dataRows = dataLines.slice(startRow);
    const maxRowsToAnalyze = Math.min(dataRows.length, 100); // Analyze up to 100 rows

    const sampleData: Record<string, unknown>[] = [];
    const fieldValues: Map<string, string[]> = new Map();
    let failedRows = 0;

    // Initialize field values map
    columnNames.forEach((col) => fieldValues.set(col, []));

    for (let i = 0; i < maxRowsToAnalyze; i++) {
      try {
        const values = this.parseCsvLine(dataRows[i], delimiter);
        const row: Record<string, unknown> = {};

        columnNames.forEach((col, idx) => {
          const value = values[idx] || '';
          row[col] = value;
          fieldValues.get(col)?.push(value);
        });

        sampleData.push(row);
      } catch {
        failedRows++;
      }
    }

    // Analyze fields
    const detectedFields = this.analyzeFields(columnNames, fieldValues, dataRows.length);

    // Find suggested primary ID field
    const suggestedPrimaryIdField = this.findPrimaryIdCandidate(detectedFields);

    return {
      success: true,
      detectedFormat: 'CSV',
      detectedFields,
      sampleData: sampleData.slice(0, 5), // First 5 rows for preview
      totalRows: dataRows.length,
      failedRows,
      suggestedPrimaryIdField,
      detectedDelimiter: delimiter,
    };
  }

  /**
   * Parse a single CSV line handling quotes
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Parse JSON/JSONL content
   */
  private parseJsonContent(content: string, isJsonl: boolean): ParseSampleFileResult {
    let records: Record<string, unknown>[] = [];
    let failedRows = 0;

    try {
      if (isJsonl) {
        const lines = content.split(/\r?\n/).filter((line) => line.trim());
        for (const line of lines) {
          try {
            records.push(JSON.parse(line));
          } catch {
            failedRows++;
          }
        }
      } else {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          records = parsed;
        } else if (typeof parsed === 'object') {
          // Try to find an array in the object
          const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
          if (arrayKey) {
            records = parsed[arrayKey];
          } else {
            records = [parsed];
          }
        }
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Invalid JSON: ${err.message}`,
        detectedFields: [],
        sampleData: [],
        totalRows: 0,
        failedRows: 0,
      };
    }

    if (records.length === 0) {
      return {
        success: false,
        error: 'No records found in JSON',
        detectedFields: [],
        sampleData: [],
        totalRows: 0,
        failedRows,
      };
    }

    // Get all unique field names
    const fieldNames = new Set<string>();
    records.forEach((record) => {
      Object.keys(record).forEach((key) => fieldNames.add(key));
    });

    // Build field values map
    const fieldValues: Map<string, string[]> = new Map();
    fieldNames.forEach((field) => fieldValues.set(field, []));

    const maxRowsToAnalyze = Math.min(records.length, 100);
    for (let i = 0; i < maxRowsToAnalyze; i++) {
      const record = records[i];
      fieldNames.forEach((field) => {
        const value = record[field];
        fieldValues.get(field)?.push(value !== undefined ? String(value) : '');
      });
    }

    const columnNames = Array.from(fieldNames);
    const detectedFields = this.analyzeFields(columnNames, fieldValues, records.length);
    const suggestedPrimaryIdField = this.findPrimaryIdCandidate(detectedFields);

    return {
      success: true,
      detectedFormat: isJsonl ? 'JSONL' : 'JSON',
      detectedFields,
      sampleData: records.slice(0, 5),
      totalRows: records.length,
      failedRows,
      suggestedPrimaryIdField,
    };
  }

  /**
   * Analyze fields and detect types
   */
  private analyzeFields(
    columnNames: string[],
    fieldValues: Map<string, string[]>,
    totalRows: number
  ): DetectedField[] {
    return columnNames.map((name) => {
      const values = fieldValues.get(name) || [];
      const nonEmptyValues = values.filter((v) => v && v.trim());
      const uniqueValues = new Set(nonEmptyValues);

      // Detect type
      const typeInfo = this.detectFieldType(nonEmptyValues);

      // Check if it looks like an ID field
      const looksLikeId = this.looksLikeIdField(name, uniqueValues.size, nonEmptyValues.length, totalRows);

      return {
        name,
        detectedType: typeInfo.type,
        typeConfidence: typeInfo.confidence,
        isRequired: nonEmptyValues.length === values.length && values.length > 0,
        uniqueValueCount: uniqueValues.size,
        nonEmptyCount: nonEmptyValues.length,
        sampleValues: Array.from(uniqueValues).slice(0, 5),
        looksLikeId,
        suggestedLabel: this.formatFieldLabel(name),
        numericRange: typeInfo.numericRange,
        dateFormat: typeInfo.dateFormat,
      };
    });
  }

  /**
   * Detect the type of a field based on its values
   */
  private detectFieldType(values: string[]): {
    type: DetectedFieldType;
    confidence: number;
    numericRange?: { min: number; max: number };
    dateFormat?: string;
  } {
    if (values.length === 0) {
      return { type: 'empty', confidence: 1 };
    }

    // Check patterns
    let numberCount = 0;
    let integerCount = 0;
    let booleanCount = 0;
    let emailCount = 0;
    let urlCount = 0;
    let phoneCount = 0;
    let dateCount = 0;
    let timestampCount = 0;
    let currencyCount = 0;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const urlRegex = /^https?:\/\/.+/i;
    const phoneRegex = /^[\d\s\-+().]{7,}$/;
    const dateOnlyRegex = /^\d{4}[-/]\d{2}[-/]\d{2}$|^\d{2}[-/]\d{2}[-/]\d{4}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    const dateRegex = /^\d{4}[-/]\d{2}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
    const timestampRegex = /^\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}/;
    const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const unixTimestampRegex = /^1[3-9]\d{8,11}$/;
    const currencyRegex = /^[$€£¥]?\s*[\d,]+\.?\d*$/;
    const booleanValues = ['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'];

    let minNum = Infinity;
    let maxNum = -Infinity;

    for (const value of values) {
      const trimmed = value.trim().toLowerCase();

      if (!isNaN(Number(value)) && value.trim() !== '') {
        numberCount++;
        const num = Number(value);
        minNum = Math.min(minNum, num);
        maxNum = Math.max(maxNum, num);
        if (Number.isInteger(num)) integerCount++;
      }
      if (booleanValues.includes(trimmed)) booleanCount++;
      if (emailRegex.test(value)) emailCount++;
      if (urlRegex.test(value)) urlCount++;
      if (phoneRegex.test(value) && !emailRegex.test(value)) phoneCount++;
      if (timestampRegex.test(value) || isoTimestampRegex.test(value) || unixTimestampRegex.test(value)) {
        timestampCount++;
      } else if (dateRegex.test(value)) {
        dateCount++;
      }
      if (currencyRegex.test(value)) currencyCount++;
    }

    const total = values.length;
    const threshold = 0.8; // 80% match threshold

    // Priority order: more specific types first
    if (emailCount / total >= threshold) {
      return { type: 'email', confidence: emailCount / total };
    }
    if (urlCount / total >= threshold) {
      return { type: 'url', confidence: urlCount / total };
    }
    if (phoneCount / total >= threshold) {
      return { type: 'phone', confidence: phoneCount / total };
    }
    if (timestampCount / total >= threshold) {
      return { type: 'timestamp', confidence: timestampCount / total };
    }
    if (dateCount / total >= threshold) {
      return { type: 'date', confidence: dateCount / total };
    }
    if (currencyCount / total >= threshold && numberCount / total >= threshold) {
      return { type: 'currency', confidence: currencyCount / total };
    }
    if (booleanCount / total >= threshold) {
      return { type: 'boolean', confidence: booleanCount / total };
    }
    if (numberCount / total >= threshold) {
      // Distinguish integer from number (all values are whole numbers)
      if (integerCount === numberCount) {
        return {
          type: 'integer',
          confidence: numberCount / total,
          numericRange: { min: minNum, max: maxNum },
        };
      }
      return {
        type: 'number',
        confidence: numberCount / total,
        numericRange: { min: minNum, max: maxNum },
      };
    }

    return { type: 'string', confidence: 1 };
  }

  /**
   * Check if a field looks like a unique ID field
   */
  private looksLikeIdField(
    name: string,
    uniqueCount: number,
    nonEmptyCount: number,
    totalRows: number
  ): boolean {
    const nameLower = name.toLowerCase();

    // Check name patterns
    const idPatterns = ['id', 'key', 'code', 'number', 'num', 'ref', 'identifier', 'uuid', 'guid'];
    const hasIdPattern = idPatterns.some(
      (pattern) =>
        nameLower === pattern ||
        nameLower.endsWith('_id') ||
        nameLower.endsWith('id') ||
        nameLower.startsWith('id_') ||
        nameLower.includes('_id_') ||
        nameLower.includes(pattern)
    );

    // Check uniqueness - should be highly unique
    const uniquenessRatio = nonEmptyCount > 0 ? uniqueCount / nonEmptyCount : 0;
    const isHighlyUnique = uniquenessRatio >= 0.95;

    // Check completeness - ID field should have values in most rows
    const completenessRatio = totalRows > 0 ? nonEmptyCount / totalRows : 0;
    const isComplete = completenessRatio >= 0.95;

    return (hasIdPattern && isHighlyUnique) || (isHighlyUnique && isComplete && uniqueCount > 10);
  }

  /**
   * Find the best candidate for primary ID field
   */
  private findPrimaryIdCandidate(fields: DetectedField[]): string | undefined {
    // Sort by likelihood of being an ID field
    const candidates = fields
      .filter((f) => f.looksLikeId)
      .sort((a, b) => {
        // Prefer fields with "id" in the name
        const aHasId = a.name.toLowerCase().includes('id') ? 1 : 0;
        const bHasId = b.name.toLowerCase().includes('id') ? 1 : 0;
        if (aHasId !== bHasId) return bHasId - aHasId;

        // Prefer fields with higher uniqueness
        return b.uniqueValueCount - a.uniqueValueCount;
      });

    return candidates[0]?.name;
  }

  /**
   * Format a field name into a display label
   */
  private formatFieldLabel(name: string): string {
    return name
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Generate field mappings from detected fields
   */
  generateFieldMappingsFromDetectedFields(
    fields: DetectedField[],
    primaryIdField?: string
  ): void {
    const mappings: VolumeFieldMapping[] = fields.map((field) => ({
      sourceField: field.name,
      targetField: field.name, // Dynamic: same as source field
      isPrimaryId: field.name === primaryIdField,
      required: field.isRequired,
      detectedType: field.detectedType,
    }));

    this.updateFormField('fieldMappings', mappings);
  }

  /**
   * Reconstruct detected fields and parse result from saved field mappings
   * Used when opening an existing loader for editing
   */
  reconstructSchemaFromMappings(mappings: VolumeFieldMapping[]): void {
    if (!mappings || mappings.length === 0) {
      this.detectedFields.set([]);
      this.sampleParseResult.set(null);
      this.sampleFileName.set('');
      this.sampleFileContent.set('');
      return;
    }

    // Reconstruct detected fields from the saved mappings
    const fields: DetectedField[] = mappings.map((m) => ({
      name: m.sourceField,
      detectedType: m.detectedType || 'string',
      typeConfidence: 1,
      isRequired: m.required,
      uniqueValueCount: 0,
      nonEmptyCount: 0,
      sampleValues: [],
      looksLikeId: m.isPrimaryId,
      suggestedLabel: this.formatFieldLabel(m.sourceField),
    }));

    this.detectedFields.set(fields);

    // Create a synthetic parse result so step 5 validation passes
    this.sampleParseResult.set({
      success: true,
      detectedFields: fields,
      sampleData: [],
      totalRows: 0,
      failedRows: 0,
    });

    // Indicate this is from a saved configuration
    this.sampleFileName.set('(from saved configuration)');
    this.sampleFileContent.set('');
  }

  /**
   * Set the primary ID field
   */
  setPrimaryIdField(fieldName: string): void {
    this.selectedPrimaryIdField.set(fieldName);
    const mappings = this.formData().fieldMappings || [];

    // Update mappings to reflect new primary ID
    const updatedMappings = mappings.map((m) => ({
      ...m,
      isPrimaryId: m.sourceField === fieldName,
    }));

    this.updateFormField('fieldMappings', updatedMappings);
  }

  /**
   * Toggle whether a field should be included in the mapping
   */
  toggleFieldInclusion(fieldName: string, included: boolean): void {
    const mappings = this.formData().fieldMappings || [];

    if (included) {
      // Add the field if not present
      const field = this.detectedFields().find((f) => f.name === fieldName);
      if (field && !mappings.find((m) => m.sourceField === fieldName)) {
        mappings.push({
          sourceField: field.name,
          targetField: field.name,
          isPrimaryId: false,
          required: field.isRequired,
          detectedType: field.detectedType,
        });
      }
    } else {
      // Remove the field
      const index = mappings.findIndex((m) => m.sourceField === fieldName);
      if (index >= 0) {
        mappings.splice(index, 1);
      }
    }

    this.updateFormField('fieldMappings', [...mappings]);
  }

  /**
   * Check if a field is included in the current mappings
   */
  isFieldIncluded(fieldName: string): boolean {
    const mappings = this.formData().fieldMappings || [];
    return mappings.some((m) => m.sourceField === fieldName);
  }

  /**
   * Get the display name (targetField) for a field
   */
  getFieldDisplayName(fieldName: string): string {
    const mappings = this.formData().fieldMappings || [];
    const mapping = mappings.find((m) => m.sourceField === fieldName);
    return mapping?.targetField || fieldName;
  }

  /**
   * Update the display name for a field
   */
  updateFieldDisplayName(fieldName: string, displayName: string): void {
    const mappings = this.formData().fieldMappings || [];
    const mapping = mappings.find((m) => m.sourceField === fieldName);
    if (mapping) {
      mapping.targetField = displayName.trim() || fieldName;
      this.updateFormField('fieldMappings', [...mappings]);
    }
  }

  /**
   * Get the data type for a field
   */
  getFieldDataType(fieldName: string): DetectedFieldType | undefined {
    const mappings = this.formData().fieldMappings || [];
    const mapping = mappings.find((m) => m.sourceField === fieldName);
    return mapping?.detectedType;
  }

  /**
   * Update the data type for a field.
   * Keeps detectedFields() in sync so downstream steps (routing, etc.) reflect the override.
   */
  updateFieldDataType(fieldName: string, dataType: DetectedFieldType): void {
    const mappings = this.formData().fieldMappings || [];
    const mapping = mappings.find((m) => m.sourceField === fieldName);
    if (mapping) {
      mapping.detectedType = dataType;
      this.updateFormField('fieldMappings', [...mappings]);
    }

    // Sync detectedFields so the routing step dropdown shows the overridden type
    const fields = this.detectedFields();
    const field = fields.find((f) => f.name === fieldName);
    if (field) {
      field.detectedType = dataType;
      this.detectedFields.set([...fields]);
    }
  }

  /**
   * Get type confidence as a percentage string
   */
  getTypeConfidencePercent(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
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
            // Clear the content and auto-close after successful upload
            this.csvContent.set('');
            setTimeout(() => {
              this.closeUploadPanel();
              this.loadData();
            }, 1500);
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

  // ============ Inline Pipeline Creation ============

  /**
   * Create a pipeline inline within the wizard
   */
  createInlinePipeline(): void {
    const name = this.newPipelineName();
    if (!name?.trim()) return;

    this.pipelineService.createPipeline({
      name: name.trim(),
      description: this.newPipelineDescription() || undefined,
      allowedWorkTypes: [],
    }).subscribe({
      next: (pipeline) => {
        this.pipelines.set([...this.pipelines(), pipeline]);
        this.updatePipelineId(pipeline.id);
        this.showInlinePipelineCreator.set(false);
        this.newPipelineName.set('');
        this.newPipelineDescription.set('');
        this.successMessage.set(`Pipeline "${pipeline.name}" created`);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create pipeline');
      },
    });
  }

  // ============ Queue Setup (Step 8) ============

  /**
   * Load pipeline queues and routing rules
   */
  loadPipelineQueuesAndRules(): void {
    const pipelineId = this.getFormPipelineId();
    if (!pipelineId) return;

    this.pipelineService.getPipelineQueues(pipelineId).subscribe({
      next: (queues) => this.pipelineQueues.set(queues),
      error: () => this.pipelineQueues.set([]),
    });

    this.pipelineService.getRoutingRules(pipelineId).subscribe({
      next: (rules) => this.pipelineRoutingRules.set(rules),
      error: () => this.pipelineRoutingRules.set([]),
    });
  }

  /**
   * Create a queue within the selected pipeline
   */
  createQueue(): void {
    const pipelineId = this.getFormPipelineId();
    const name = this.newQueueName();
    if (!pipelineId || !name?.trim()) return;

    const skills = this.newQueueSkills()
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);

    this.pipelineService.createQueue(pipelineId, {
      name: name.trim(),
      description: this.newQueueDescription() || undefined,
      priority: this.newQueuePriority() || 5,
      requiredSkills: skills.length > 0 ? skills : undefined,
    }).subscribe({
      next: (queue) => {
        this.pipelineQueues.set([...this.pipelineQueues(), queue]);
        this.showAddQueueForm.set(false);
        this.newQueueName.set('');
        this.newQueueDescription.set('');
        this.newQueuePriority.set(5);
        this.newQueueSkills.set('');
        this.successMessage.set(`Queue "${queue.name}" created`);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create queue');
      },
    });
  }

  /**
   * Remove a queue from the pipeline
   */
  removeQueue(queueId: string): void {
    const pipelineId = this.getFormPipelineId();
    if (!pipelineId) return;

    this.pipelineService.deleteQueue(pipelineId, queueId).subscribe({
      next: () => {
        this.pipelineQueues.set(this.pipelineQueues().filter((q) => q.id !== queueId));
        this.successMessage.set('Queue removed');
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to remove queue');
      },
    });
  }

  /**
   * Get queue name by ID
   */
  getQueueName(queueId: string): string {
    const queue = this.pipelineQueues().find((q) => q.id === queueId);
    return queue?.name || queueId;
  }

  // ============ Routing Rules (Step 9) ============

  /**
   * Add a blank condition row to the rule builder.
   */
  addRuleCondition(): void {
    this.newRuleConditions.set([
      ...this.newRuleConditions(),
      { field: '', operator: 'equals' as RoutingOperator, value: '' },
    ]);
  }

  /**
   * Remove a condition row by index (keep at least one).
   */
  removeRuleCondition(index: number): void {
    const conditions = this.newRuleConditions();
    if (conditions.length <= 1) return;
    this.newRuleConditions.set(conditions.filter((_, i) => i !== index));
  }

  /**
   * Update a single condition's field/operator/value.
   */
  updateRuleCondition(index: number, key: 'field' | 'operator' | 'value', value: string): void {
    const conditions = [...this.newRuleConditions()];
    conditions[index] = { ...conditions[index], [key]: value };
    // Reset operator when field changes (new field may not support current operator)
    if (key === 'field') {
      const ops = this.getOperatorsForField(value);
      if (!ops.includes(conditions[index].operator as RoutingOperator)) {
        conditions[index].operator = ops[0] || 'equals';
      }
    }
    this.newRuleConditions.set(conditions);
  }

  /**
   * Create a routing rule within the selected pipeline
   * Field references are schema-driven — any field from the detected schema is valid.
   */
  createRoutingRule(): void {
    const pipelineId = this.getFormPipelineId();
    const name = this.newRuleName();
    const targetQueueId = this.newRuleTargetQueue();
    const rawConditions = this.newRuleConditions();

    // Validate — every condition must have a field selected
    const validConditions = rawConditions.filter((c) => c.field);
    if (!pipelineId || !name?.trim() || !targetQueueId || validConditions.length === 0) return;

    // Build RoutingCondition[] — split value for 'in'/'not_in' operators
    const conditions: Omit<RoutingCondition, 'id'>[] = validConditions.map((c) => {
      let conditionValue: string | string[] = c.value;
      if (c.operator === 'in' || c.operator === 'not_in') {
        conditionValue = c.value.split(',').map((v) => v.trim()).filter((v) => v);
      }
      return {
        id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        field: c.field,
        operator: c.operator as RoutingOperator,
        value: conditionValue,
      };
    });

    this.pipelineService.createRoutingRule(pipelineId, {
      name: name.trim(),
      conditions: conditions as RoutingCondition[],
      conditionLogic: this.newRuleConditionLogic(),
      targetQueueId,
    }).subscribe({
      next: (rule) => {
        this.pipelineRoutingRules.set([...this.pipelineRoutingRules(), rule]);
        this.showAddRuleForm.set(false);
        this.newRuleName.set('');
        this.newRuleConditions.set([{ field: '', operator: 'equals', value: '' }]);
        this.newRuleConditionLogic.set('AND');
        this.newRuleTargetQueue.set('');
        this.successMessage.set(`Routing rule "${rule.name}" created`);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create routing rule');
      },
    });
  }

  /**
   * Remove a routing rule from the pipeline
   */
  removeRoutingRule(ruleId: string): void {
    const pipelineId = this.getFormPipelineId();
    if (!pipelineId) return;

    this.pipelineService.deleteRoutingRule(pipelineId, ruleId).subscribe({
      next: () => {
        this.pipelineRoutingRules.set(this.pipelineRoutingRules().filter((r) => r.id !== ruleId));
        this.successMessage.set('Routing rule removed');
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to remove routing rule');
      },
    });
  }
}
