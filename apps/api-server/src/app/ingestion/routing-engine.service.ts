import { Injectable, Logger } from '@nestjs/common';
import {
  IngestedRecord,
  RoutingRule,
  Task,
  TaskAction,
} from '@nexus-queue/shared-models';

/**
 * Evaluates routing rules against ingested records to determine
 * work type, priority, queue, and payload URL for each record.
 *
 * Ships with sensible default rules for the POC work types
 * (ORDERS, RETURNS, CLAIMS). Falls back to a catch-all rule
 * so records are never silently dropped.
 */
@Injectable()
export class RoutingEngineService {
  private readonly logger = new Logger(RoutingEngineService.name);

  /** Active routing rules (configurable at runtime for POC) */
  private rules: RoutingRule[] = this.getDefaultRules();

  /**
   * Apply routing rules to a single record.
   * Returns the record with resolved fields populated, or null if no rule matched.
   */
  routeRecord(record: IngestedRecord): IngestedRecord {
    for (const rule of this.rules) {
      if (this.matches(record, rule)) {
        record.resolvedWorkType = rule.workType;
        record.resolvedPriority = rule.priority;
        record.resolvedQueue = rule.queue;
        record.executionStatus = 'ROUTED';
        return record;
      }
    }

    // No rule matched — mark as filtered, not silently dropped
    record.executionStatus = 'FILTERED';
    this.logger.debug(
      `Record ${record.id} (row ${record.rowNumber}) filtered: no routing rule matched`
    );
    return record;
  }

  /**
   * Convert a routed record into a Task for distribution.
   */
  recordToTask(record: IngestedRecord, taskId: string): Task {
    const now = new Date().toISOString();
    const rule = this.rules.find((r) => r.workType === record.resolvedWorkType);
    const payloadUrl = rule
      ? this.resolveTemplate(rule.payloadUrlTemplate, record.data)
      : 'https://www.wikipedia.org';

    const actions = this.getActionsForWorkType(record.resolvedWorkType || 'GENERAL');

    return {
      id: taskId,
      externalId: record.data['externalId'] || record.id,
      workType: record.resolvedWorkType || 'GENERAL',
      title: record.data['title'] || `Record #${record.rowNumber}`,
      description: record.data['description'] || undefined,
      payloadUrl,
      metadata: { ...record.data },
      priority: record.resolvedPriority ?? 5,
      skills: rule?.skills || [],
      queue: record.resolvedQueue,
      status: 'PENDING',
      createdAt: now,
      availableAt: now,
      reservationTimeout: 30,
      actions,
    };
  }

  /**
   * Get the current routing rules.
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Replace routing rules (for admin configuration).
   */
  setRules(rules: RoutingRule[]): void {
    this.rules = rules;
    this.logger.log(`Routing rules updated: ${rules.length} rules loaded`);
  }

  // --- Private ---

  private matches(record: IngestedRecord, rule: RoutingRule): boolean {
    const fieldValue = record.data[rule.field];
    if (fieldValue === undefined || fieldValue === null) return false;

    const normalizedValue = fieldValue.toUpperCase();
    const normalizedTarget = rule.value.toUpperCase();

    switch (rule.operator) {
      case 'equals':
        return normalizedValue === normalizedTarget;
      case 'contains':
        return normalizedValue.includes(normalizedTarget);
      case 'startsWith':
        return normalizedValue.startsWith(normalizedTarget);
      case 'regex':
        try {
          return new RegExp(rule.value, 'i').test(fieldValue);
        } catch {
          this.logger.warn(`Invalid regex in rule ${rule.id}: ${rule.value}`);
          return false;
        }
      default:
        return false;
    }
  }

  private resolveTemplate(
    template: string,
    data: Record<string, string>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return encodeURIComponent(data[key] || '');
    });
  }

  private getActionsForWorkType(workType: string): TaskAction[] {
    const base: TaskAction[] = [
      {
        id: 'complete',
        label: 'Complete',
        type: 'COMPLETE',
        icon: 'check',
        dispositionCode: 'RESOLVED',
        primary: true,
      },
      {
        id: 'transfer',
        label: 'Transfer',
        type: 'TRANSFER',
        icon: 'arrow-right',
      },
    ];

    if (workType === 'RETURNS') {
      return [
        {
          id: 'approve',
          label: 'Approve Return',
          type: 'COMPLETE',
          icon: 'check',
          dispositionCode: 'APPROVED',
          primary: true,
        },
        {
          id: 'deny',
          label: 'Deny Return',
          type: 'COMPLETE',
          icon: 'x',
          dispositionCode: 'DENIED',
        },
        {
          id: 'escalate',
          label: 'Escalate',
          type: 'TRANSFER',
          icon: 'arrow-up',
        },
      ];
    }

    if (workType === 'CLAIMS') {
      return [
        {
          id: 'approve',
          label: 'Approve Claim',
          type: 'COMPLETE',
          icon: 'check',
          dispositionCode: 'CLAIM_APPROVED',
          primary: true,
        },
        {
          id: 'deny',
          label: 'Deny Claim',
          type: 'COMPLETE',
          icon: 'x',
          dispositionCode: 'CLAIM_DENIED',
        },
        {
          id: 'investigate',
          label: 'Investigate',
          type: 'TRANSFER',
          icon: 'search',
        },
      ];
    }

    return base;
  }

  private getDefaultRules(): RoutingRule[] {
    return [
      {
        id: 'rule-orders',
        name: 'Orders',
        field: 'workType',
        operator: 'equals',
        value: 'ORDERS',
        workType: 'ORDERS',
        priority: 1,
        queue: 'orders-priority',
        skills: ['orders', 'fulfillment'],
        payloadUrlTemplate: 'https://www.wikipedia.org',
      },
      {
        id: 'rule-returns',
        name: 'Returns',
        field: 'workType',
        operator: 'equals',
        value: 'RETURNS',
        workType: 'RETURNS',
        priority: 2,
        queue: 'returns-standard',
        skills: ['returns', 'customer-service'],
        payloadUrlTemplate: 'https://www.wikipedia.org',
      },
      {
        id: 'rule-claims',
        name: 'Claims',
        field: 'workType',
        operator: 'equals',
        value: 'CLAIMS',
        workType: 'CLAIMS',
        priority: 3,
        queue: 'claims-review',
        skills: ['claims', 'investigation'],
        payloadUrlTemplate: 'https://www.wikipedia.org',
      },
      {
        // Catch-all: any record not matching above gets routed as GENERAL
        id: 'rule-catch-all',
        name: 'Catch-All',
        field: 'workType',
        operator: 'regex',
        value: '.*',
        workType: 'GENERAL',
        priority: 5,
        queue: 'general-queue',
        skills: [],
        payloadUrlTemplate: 'https://www.wikipedia.org',
      },
    ];
  }
}
