import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import {
  Rule,
  RuleCondition,
  RuleAction,
  RuleFieldConfig,
  RuleActionConfig,
  ConditionOperator,
  RuleActionType,
} from '@nexus-queue/shared-models';
import { OperatorConfig } from '../../../services/rules.service';

@Component({
  selector: 'app-rule-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './rule-editor.component.html',
  styleUrls: ['./rule-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleEditorComponent implements OnInit, OnChanges {
  @Input() rule!: Rule;
  @Input() availableFields: RuleFieldConfig[] = [];
  @Input() availableOperators: OperatorConfig[] = [];
  @Input() availableActions: RuleActionConfig[] = [];
  @Output() ruleChanged = new EventEmitter<Rule>();

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  form!: FormGroup;

  // Operators that don't need a value input
  readonly noValueOperators: ConditionOperator[] = ['is_empty', 'is_not_empty'];
  // Operators that use array (comma-separated tags)
  readonly arrayOperators: ConditionOperator[] = ['in', 'not_in'];
  // Action types with no value input
  readonly noValueActions: RuleActionType[] = ['stop_processing'];
  // Action types that use a metadata key+value pair
  readonly metadataActions: RuleActionType[] = ['set_metadata'];
  // Action types that use a number input
  readonly numberActions: RuleActionType[] = ['set_priority', 'adjust_priority', 'set_timeout'];

  ngOnInit(): void {
    this.buildForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rule'] && !changes['rule'].firstChange) {
      this.buildForm();
    }
  }

  private buildForm(): void {
    const conditionGroup = this.rule.conditionGroup;

    this.form = this.fb.group({
      logic: [conditionGroup.operator],
      conditions: this.fb.array(
        conditionGroup.conditions.map((c) => this.buildConditionGroup(c))
      ),
      actions: this.fb.array(
        this.rule.actions.map((a) => this.buildActionGroup(a))
      ),
    });

    this.form.valueChanges.subscribe(() => {
      this.emitChange();
      this.cdr.markForCheck();
    });
  }

  private buildConditionGroup(condition?: Partial<RuleCondition>): FormGroup {
    return this.fb.group({
      id: [condition?.id ?? `cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`],
      field: [condition?.field ?? '', Validators.required],
      operator: [condition?.operator ?? 'equals'],
      value: [condition?.value ?? ''],
    });
  }

  private buildActionGroup(action?: Partial<RuleAction>): FormGroup {
    return this.fb.group({
      id: [action?.id ?? `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`],
      type: [action?.type ?? 'set_priority'],
      value: [action?.value ?? ''],
      field: [action?.field ?? ''],
    });
  }

  get conditions(): FormArray {
    return this.form.get('conditions') as FormArray;
  }

  get actions(): FormArray {
    return this.form.get('actions') as FormArray;
  }

  addCondition(): void {
    this.conditions.push(this.buildConditionGroup());
    this.cdr.markForCheck();
  }

  removeCondition(index: number): void {
    this.conditions.removeAt(index);
    this.cdr.markForCheck();
  }

  addAction(): void {
    this.actions.push(this.buildActionGroup());
    this.cdr.markForCheck();
  }

  removeAction(index: number): void {
    this.actions.removeAt(index);
    this.cdr.markForCheck();
  }

  moveActionUp(index: number): void {
    if (index <= 0) return;
    const current = this.actions.at(index).value as Record<string, unknown>;
    const prev = this.actions.at(index - 1).value as Record<string, unknown>;
    this.actions.at(index).patchValue(prev);
    this.actions.at(index - 1).patchValue(current);
    this.cdr.markForCheck();
  }

  moveActionDown(index: number): void {
    if (index >= this.actions.length - 1) return;
    const current = this.actions.at(index).value as Record<string, unknown>;
    const next = this.actions.at(index + 1).value as Record<string, unknown>;
    this.actions.at(index).patchValue(next);
    this.actions.at(index + 1).patchValue(current);
    this.cdr.markForCheck();
  }

  /** Return operators filtered by the selected field's allowed operators */
  getOperatorsForField(fieldName: string): OperatorConfig[] {
    const fieldConfig = this.availableFields.find((f) => f.field === fieldName);
    if (!fieldConfig) return this.availableOperators;
    return this.availableOperators.filter((op) =>
      fieldConfig.operators.includes(op.operator)
    );
  }

  /** Check if operator needs a value input */
  operatorNeedsValue(operator: string): boolean {
    return !this.noValueOperators.includes(operator as ConditionOperator);
  }

  /** Check if operator uses array input */
  operatorIsArray(operator: string): boolean {
    return this.arrayOperators.includes(operator as ConditionOperator);
  }

  /** Check if action type uses no value input */
  actionHasNoValue(type: string): boolean {
    return this.noValueActions.includes(type as RuleActionType);
  }

  /** Check if action type uses metadata key+value */
  actionIsMetadata(type: string): boolean {
    return this.metadataActions.includes(type as RuleActionType);
  }

  /** Check if action type uses number input */
  actionIsNumber(type: string): boolean {
    return this.numberActions.includes(type as RuleActionType);
  }

  /** Get label for action type */
  getActionLabel(type: string): string {
    const config = this.availableActions.find((a) => a.type === type);
    return config?.label ?? type;
  }

  /** Get label for field */
  getFieldLabel(field: string): string {
    const config = this.availableFields.find((f) => f.field === field);
    return config?.label ?? field;
  }

  private emitChange(): void {
    const value = this.form.value as {
      logic: 'AND' | 'OR';
      conditions: { id: string; field: string; operator: ConditionOperator; value: string | number | boolean | string[] }[];
      actions: { id: string; type: RuleActionType; value: string | number | boolean; field: string }[];
    };

    const updatedRule: Rule = {
      ...this.rule,
      conditionGroup: {
        ...this.rule.conditionGroup,
        operator: value.logic,
        conditions: value.conditions.map((c) => ({
          id: c.id,
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      },
      actions: value.actions.map((a) => ({
        id: a.id,
        type: a.type,
        value: a.value,
        field: a.field || undefined,
      })),
    };

    this.ruleChanged.emit(updatedRule);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
