import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RuleSetTestResponse } from '@nexus-queue/shared-models';
import { RulesService } from '../../../services/rules.service';

interface DiffEntry {
  key: string;
  before: string;
  after: string;
  changed: boolean;
}

@Component({
  selector: 'app-rule-set-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rule-set-test.component.html',
  styleUrls: ['./rule-set-test.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleSetTestComponent {
  @Input() ruleSetId!: string;
  @Input() ruleSetName = '';
  @Output() closed = new EventEmitter<void>();

  private rulesService = inject(RulesService);
  private cdr = inject(ChangeDetectorRef);

  sampleJson = signal('{\n  "workType": "",\n  "priority": 5,\n  "queue": ""\n}');
  jsonError = signal('');
  isLoading = signal(false);
  testResult = signal<RuleSetTestResponse | null>(null);
  testError = signal('');

  get diffEntries(): DiffEntry[] {
    const result = this.testResult();
    if (!result) return [];

    const before = result.taskBefore;
    const after = result.taskAfter;
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    return Array.from(allKeys).map((key) => ({
      key,
      before: JSON.stringify(before[key] ?? null),
      after: JSON.stringify(after[key] ?? null),
      changed: JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    }));
  }

  onJsonChange(value: string): void {
    this.sampleJson.set(value);
    this.validateJson(value);
  }

  private validateJson(value: string): void {
    if (!value.trim()) {
      this.jsonError.set('');
      return;
    }
    try {
      JSON.parse(value);
      this.jsonError.set('');
    } catch {
      this.jsonError.set('Invalid JSON — please fix before running the test.');
    }
  }

  runTest(): void {
    if (this.jsonError()) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(this.sampleJson()) as Record<string, unknown>;
    } catch {
      this.jsonError.set('Invalid JSON — please fix before running the test.');
      return;
    }

    this.isLoading.set(true);
    this.testResult.set(null);
    this.testError.set('');

    this.rulesService.testRuleSet(this.ruleSetId, parsed).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.testError.set('Test failed — could not reach the rule evaluation endpoint.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  close(): void {
    this.closed.emit();
  }

  formatJson(obj: Record<string, unknown>): string {
    return JSON.stringify(obj, null, 2);
  }
}
