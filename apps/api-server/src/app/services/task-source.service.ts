import { Injectable, Logger } from '@nestjs/common';
import {
  TaskSource,
  TaskSourceType,
  FieldMapping,
  PendingOrder,
  PendingOrderStatus,
  CsvParseResult,
  TaskFromSource,
  TaskQueueStats,
  TaskDefaults,
} from '@nexus-queue/shared-models';

@Injectable()
export class TaskSourceService {
  private readonly logger = new Logger(TaskSourceService.name);

  // In-memory storage (would be database in production)
  private sources: Map<string, TaskSource> = new Map();
  private pendingOrders: PendingOrder[] = [];
  private activeSourceId: string | null = null;

  constructor() {
    this.initializeDefaultSource();
  }

  /**
   * Initialize with a default CSV source configuration
   */
  private initializeDefaultSource(): void {
    const defaultSource: TaskSource = {
      id: 'default-csv',
      name: 'CSV Upload',
      type: 'CSV',
      enabled: true,
      urlTemplate: 'https://example.com/orders/{orderId}',
      fieldMappings: [
        { sourceField: 'OrderId', targetField: 'externalId', required: true },
        { sourceField: 'City', targetField: 'metadata' },
        { sourceField: 'State', targetField: 'metadata' },
        { sourceField: 'WorkType', targetField: 'workType' },
        { sourceField: 'Priority', targetField: 'priority', transform: 'number' },
      ],
      defaults: {
        workType: 'ORDER_REVIEW',
        priority: 5,
        queue: 'default',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sources.set(defaultSource.id, defaultSource);
    this.activeSourceId = defaultSource.id;
    this.logger.log('Initialized default CSV source configuration');
  }

  /**
   * Get all configured task sources
   */
  getAllSources(): TaskSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get a specific task source by ID
   */
  getSource(id: string): TaskSource | null {
    return this.sources.get(id) || null;
  }

  /**
   * Get the currently active source
   */
  getActiveSource(): TaskSource | null {
    return this.activeSourceId ? this.sources.get(this.activeSourceId) || null : null;
  }

  /**
   * Create or update a task source configuration
   */
  saveSource(source: Partial<TaskSource>): TaskSource {
    const now = new Date().toISOString();
    const existing = source.id ? this.sources.get(source.id) : null;

    const savedSource: TaskSource = {
      id: source.id || this.generateId(),
      name: source.name || 'Unnamed Source',
      type: source.type || 'CSV',
      enabled: source.enabled ?? true,
      urlTemplate: source.urlTemplate || '',
      fieldMappings: source.fieldMappings || [],
      defaults: source.defaults,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.sources.set(savedSource.id, savedSource);
    this.logger.log(`Saved task source: ${savedSource.name} (${savedSource.id})`);
    return savedSource;
  }

  /**
   * Set the active source for task distribution
   */
  setActiveSource(sourceId: string): boolean {
    if (this.sources.has(sourceId)) {
      this.activeSourceId = sourceId;
      this.logger.log(`Set active source: ${sourceId}`);
      return true;
    }
    return false;
  }

  /**
   * Parse CSV content and add orders to the pending queue
   */
  parseAndLoadCsv(csvContent: string, sourceId?: string): CsvParseResult {
    const source = sourceId ? this.getSource(sourceId) : this.getActiveSource();
    if (!source) {
      return {
        success: false,
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        headers: [],
        orders: [],
        error: 'No active task source configuration',
      };
    }

    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        return {
          success: false,
          totalRows: 0,
          successRows: 0,
          errorRows: 0,
          headers: [],
          orders: [],
          error: 'CSV must have at least a header row and one data row',
        };
      }

      const headers = this.parseCsvLine(lines[0]);
      const orders: PendingOrder[] = [];
      let successRows = 0;
      let errorRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = this.parseCsvLine(line);
        const rawData: Record<string, string> = {};

        headers.forEach((header, index) => {
          rawData[header] = values[index] || '';
        });

        try {
          const taskData = this.mapToTaskData(rawData, source);
          const order: PendingOrder = {
            rowIndex: i,
            rawData,
            taskData,
            status: 'PENDING',
            importedAt: new Date().toISOString(),
          };
          orders.push(order);
          successRows++;
        } catch (error) {
          const order: PendingOrder = {
            rowIndex: i,
            rawData,
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            importedAt: new Date().toISOString(),
          };
          orders.push(order);
          errorRows++;
        }
      }

      // Add to pending orders queue
      this.pendingOrders = [...orders.filter(o => o.status === 'PENDING'), ...this.pendingOrders.filter(o => o.status !== 'PENDING')];

      this.logger.log(`Parsed CSV: ${successRows} success, ${errorRows} errors, ${orders.length} total`);

      return {
        success: true,
        totalRows: lines.length - 1,
        successRows,
        errorRows,
        headers,
        orders,
      };
    } catch (error) {
      this.logger.error('Failed to parse CSV', error);
      return {
        success: false,
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        headers: [],
        orders: [],
        error: error instanceof Error ? error.message : 'Failed to parse CSV',
      };
    }
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Map raw CSV data to task data using field mappings
   */
  private mapToTaskData(rawData: Record<string, string>, source: TaskSource): TaskFromSource {
    const metadata: Record<string, string> = {};
    let externalId = '';
    let workType = source.defaults?.workType || 'GENERAL';
    let title = '';
    let description = '';
    let priority = source.defaults?.priority || 5;
    let queue = source.defaults?.queue;
    let skills = source.defaults?.skills;

    // Apply field mappings
    for (const mapping of source.fieldMappings) {
      const value = rawData[mapping.sourceField];
      if (value === undefined && mapping.required) {
        throw new Error(`Required field "${mapping.sourceField}" not found`);
      }
      if (value === undefined) continue;

      const transformedValue = this.applyTransform(value, mapping.transform);

      switch (mapping.targetField) {
        case 'externalId':
          externalId = String(transformedValue);
          break;
        case 'workType':
          workType = String(transformedValue);
          break;
        case 'title':
          title = String(transformedValue);
          break;
        case 'description':
          description = String(transformedValue);
          break;
        case 'priority':
          priority = typeof transformedValue === 'number' ? transformedValue : parseInt(String(transformedValue), 10) || 5;
          break;
        case 'queue':
          queue = String(transformedValue);
          break;
        case 'skills':
          skills = Array.isArray(transformedValue) ? transformedValue : [String(transformedValue)];
          break;
        case 'metadata':
          // Add to metadata with the source field name as key
          metadata[mapping.sourceField] = String(value);
          break;
      }
    }

    // Also add all raw data to metadata for URL template resolution
    Object.entries(rawData).forEach(([key, value]) => {
      if (!metadata[key]) {
        metadata[key] = value;
      }
    });

    // Generate title if not mapped
    if (!title) {
      title = externalId ? `Order ${externalId}` : `Task ${Date.now()}`;
    }

    // Build the payload URL from template
    const payloadUrl = this.buildUrl(source.urlTemplate, { ...metadata, externalId, orderId: externalId });

    return {
      externalId,
      workType,
      title,
      description,
      priority,
      queue,
      skills,
      payloadUrl,
      metadata,
    };
  }

  /**
   * Apply a transformation to a field value
   */
  private applyTransform(value: string, transform?: string): string | number | string[] {
    if (!transform) return value;

    switch (transform) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'number':
        return parseFloat(value) || 0;
      case 'split_comma':
        return value.split(',').map(s => s.trim());
      default:
        return value;
    }
  }

  /**
   * Build a URL from template and data
   */
  buildUrl(template: string, data: Record<string, string>): string {
    let url = template;

    // Replace {placeholder} with values
    const placeholders = template.match(/\{(\w+)\}/g) || [];
    for (const placeholder of placeholders) {
      const key = placeholder.slice(1, -1); // Remove braces
      const value = data[key] || data[key.toLowerCase()] || data[key.toUpperCase()] || '';
      url = url.replace(placeholder, encodeURIComponent(value));
    }

    return url;
  }

  /**
   * Get the next pending order and mark it as assigned
   */
  getNextPendingOrder(agentId: string): PendingOrder | null {
    const order = this.pendingOrders.find(o => o.status === 'PENDING');
    if (order) {
      order.status = 'ASSIGNED';
      order.assignedAt = new Date().toISOString();
      order.assignedAgentId = agentId;
      this.logger.log(`Assigned order ${order.rowIndex} to agent ${agentId}`);
    }
    return order || null;
  }

  /**
   * Mark an order as completed
   */
  completeOrder(rowIndex: number): boolean {
    const order = this.pendingOrders.find(o => o.rowIndex === rowIndex);
    if (order) {
      order.status = 'COMPLETED';
      this.logger.log(`Completed order ${rowIndex}`);
      return true;
    }
    return false;
  }

  /**
   * Release an assigned order back to pending
   */
  releaseOrder(rowIndex: number): boolean {
    const order = this.pendingOrders.find(o => o.rowIndex === rowIndex);
    if (order && order.status === 'ASSIGNED') {
      order.status = 'PENDING';
      order.assignedAt = undefined;
      order.assignedAgentId = undefined;
      this.logger.log(`Released order ${rowIndex} back to pending`);
      return true;
    }
    return false;
  }

  /**
   * Get all pending orders
   */
  getAllOrders(): PendingOrder[] {
    return this.pendingOrders;
  }

  /**
   * Get orders by status
   */
  getOrdersByStatus(status: PendingOrderStatus): PendingOrder[] {
    return this.pendingOrders.filter(o => o.status === status);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): TaskQueueStats {
    return {
      totalPending: this.pendingOrders.filter(o => o.status === 'PENDING').length,
      totalAssigned: this.pendingOrders.filter(o => o.status === 'ASSIGNED').length,
      totalCompleted: this.pendingOrders.filter(o => o.status === 'COMPLETED').length,
      totalErrors: this.pendingOrders.filter(o => o.status === 'ERROR').length,
      sourceId: this.activeSourceId || undefined,
    };
  }

  /**
   * Clear all pending orders
   */
  clearOrders(): void {
    this.pendingOrders = [];
    this.logger.log('Cleared all pending orders');
  }

  /**
   * Check if there are pending orders available
   */
  hasPendingOrders(): boolean {
    return this.pendingOrders.some(o => o.status === 'PENDING');
  }

  private generateId(): string {
    return `src-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
