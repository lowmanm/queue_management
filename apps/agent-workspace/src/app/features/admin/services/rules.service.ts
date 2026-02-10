import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import {
  RuleSet,
  RuleFieldConfig,
  RuleActionConfig,
  ConditionOperator,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';
import { LoggerService } from '../../../core/services';

const LOG_CONTEXT = 'RulesService';

export interface OperatorConfig {
  operator: ConditionOperator;
  label: string;
  description: string;
}

/**
 * Service for managing rules via the Rules API
 */
@Injectable({
  providedIn: 'root',
})
export class RulesService {
  private logger = inject(LoggerService);
  private http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/rules`;

  // Cache for configuration
  private fieldsSubject = new BehaviorSubject<RuleFieldConfig[]>([]);
  private actionsSubject = new BehaviorSubject<RuleActionConfig[]>([]);
  private operatorsSubject = new BehaviorSubject<OperatorConfig[]>([]);
  private ruleSetsSubject = new BehaviorSubject<RuleSet[]>([]);

  public fields$ = this.fieldsSubject.asObservable();
  public actions$ = this.actionsSubject.asObservable();
  public operators$ = this.operatorsSubject.asObservable();
  public ruleSets$ = this.ruleSetsSubject.asObservable();

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Load all configuration (fields, actions, operators)
   */
  loadConfiguration(): void {
    this.logger.info(LOG_CONTEXT, 'Loading rules configuration');

    this.getFieldConfigs().subscribe();
    this.getActionConfigs().subscribe();
    this.getOperatorConfigs().subscribe();
  }

  /**
   * Get available fields for conditions
   */
  getFieldConfigs(): Observable<RuleFieldConfig[]> {
    return this.http.get<RuleFieldConfig[]>(`${this.baseUrl}/config/fields`).pipe(
      tap((fields) => {
        this.fieldsSubject.next(fields);
        this.logger.debug(LOG_CONTEXT, 'Fields loaded', { count: fields.length });
      })
    );
  }

  /**
   * Get available actions
   */
  getActionConfigs(): Observable<RuleActionConfig[]> {
    return this.http.get<RuleActionConfig[]>(`${this.baseUrl}/config/actions`).pipe(
      tap((actions) => {
        this.actionsSubject.next(actions);
        this.logger.debug(LOG_CONTEXT, 'Actions loaded', { count: actions.length });
      })
    );
  }

  /**
   * Get available operators
   */
  getOperatorConfigs(): Observable<OperatorConfig[]> {
    return this.http.get<OperatorConfig[]>(`${this.baseUrl}/config/operators`).pipe(
      tap((operators) => {
        this.operatorsSubject.next(operators);
        this.logger.debug(LOG_CONTEXT, 'Operators loaded', { count: operators.length });
      })
    );
  }

  // ==========================================================================
  // RULE SETS
  // ==========================================================================

  /**
   * Get all rule sets
   */
  getRuleSets(): Observable<RuleSet[]> {
    return this.http.get<RuleSet[]>(`${this.baseUrl}/sets`).pipe(
      tap((ruleSets) => {
        this.ruleSetsSubject.next(ruleSets);
        this.logger.info(LOG_CONTEXT, 'Rule sets loaded', { count: ruleSets.length });
      })
    );
  }

  /**
   * Get a specific rule set
   */
  getRuleSet(id: string): Observable<RuleSet> {
    return this.http.get<RuleSet>(`${this.baseUrl}/sets/${id}`).pipe(
      tap((ruleSet) => {
        this.logger.debug(LOG_CONTEXT, 'Rule set loaded', { id, name: ruleSet.name });
      })
    );
  }

  /**
   * Create a new rule set
   */
  createRuleSet(ruleSet: RuleSet): Observable<RuleSet> {
    return this.http.post<RuleSet>(`${this.baseUrl}/sets`, ruleSet).pipe(
      tap((created) => {
        this.logger.info(LOG_CONTEXT, 'Rule set created', { id: created.id, name: created.name });
        // Update cache
        const current = this.ruleSetsSubject.value;
        this.ruleSetsSubject.next([...current, created]);
      })
    );
  }

  /**
   * Update an existing rule set
   */
  updateRuleSet(id: string, ruleSet: RuleSet): Observable<RuleSet> {
    return this.http.put<RuleSet>(`${this.baseUrl}/sets/${id}`, ruleSet).pipe(
      tap((updated) => {
        this.logger.info(LOG_CONTEXT, 'Rule set updated', { id, name: updated.name });
        // Update cache
        const current = this.ruleSetsSubject.value;
        const index = current.findIndex((rs) => rs.id === id);
        if (index >= 0) {
          current[index] = updated;
          this.ruleSetsSubject.next([...current]);
        }
      })
    );
  }

  /**
   * Delete a rule set
   */
  deleteRuleSet(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sets/${id}`).pipe(
      tap(() => {
        this.logger.info(LOG_CONTEXT, 'Rule set deleted', { id });
        // Update cache
        const current = this.ruleSetsSubject.value;
        this.ruleSetsSubject.next(current.filter((rs) => rs.id !== id));
      })
    );
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Get field config by field name
   */
  getFieldConfig(field: string): RuleFieldConfig | undefined {
    return this.fieldsSubject.value.find((f) => f.field === field);
  }

  /**
   * Get action config by type
   */
  getActionConfig(type: string): RuleActionConfig | undefined {
    return this.actionsSubject.value.find((a) => a.type === type);
  }

  /**
   * Get operator config
   */
  getOperatorConfig(operator: ConditionOperator): OperatorConfig | undefined {
    return this.operatorsSubject.value.find((o) => o.operator === operator);
  }
}
