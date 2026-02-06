import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RuleEngineService } from '../services/rule-engine.service';
import {
  RuleSet,
  Rule,
  RuleFieldConfig,
  RuleActionConfig,
  ConditionOperator,
} from '@nexus-queue/shared-models';

/**
 * REST API for managing rules and rule sets
 */
@Controller('rules')
export class RulesController {
  private readonly logger = new Logger(RulesController.name);

  constructor(private readonly ruleEngine: RuleEngineService) {}

  // ==========================================================================
  // RULE SETS
  // ==========================================================================

  /**
   * GET /rules/sets
   * Get all rule sets
   */
  @Get('sets')
  getAllRuleSets(): RuleSet[] {
    return this.ruleEngine.getAllRuleSets();
  }

  /**
   * GET /rules/sets/:id
   * Get a specific rule set
   */
  @Get('sets/:id')
  getRuleSet(@Param('id') id: string): RuleSet | null {
    const ruleSet = this.ruleEngine.getRuleSet(id);
    return ruleSet || null;
  }

  /**
   * POST /rules/sets
   * Create a new rule set
   */
  @Post('sets')
  createRuleSet(@Body() ruleSet: RuleSet): RuleSet {
    this.logger.log(`Creating rule set: ${ruleSet.name}`);
    return this.ruleEngine.saveRuleSet(ruleSet);
  }

  /**
   * PUT /rules/sets/:id
   * Update an existing rule set
   */
  @Put('sets/:id')
  updateRuleSet(
    @Param('id') id: string,
    @Body() ruleSet: RuleSet
  ): RuleSet {
    this.logger.log(`Updating rule set: ${id}`);
    return this.ruleEngine.saveRuleSet({ ...ruleSet, id });
  }

  /**
   * DELETE /rules/sets/:id
   * Delete a rule set
   */
  @Delete('sets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRuleSet(@Param('id') id: string): void {
    this.logger.log(`Deleting rule set: ${id}`);
    this.ruleEngine.deleteRuleSet(id);
  }

  // ==========================================================================
  // CONFIGURATION (for UI)
  // ==========================================================================

  /**
   * GET /rules/config/fields
   * Get available fields for conditions
   */
  @Get('config/fields')
  getFieldConfigs(): RuleFieldConfig[] {
    const stringOperators: ConditionOperator[] = [
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'is_empty',
      'is_not_empty',
      'matches_regex',
    ];

    const numberOperators: ConditionOperator[] = [
      'equals',
      'not_equals',
      'greater_than',
      'less_than',
      'greater_or_equal',
      'less_or_equal',
    ];

    const selectOperators: ConditionOperator[] = [
      'equals',
      'not_equals',
      'in',
      'not_in',
    ];

    return [
      {
        field: 'workType',
        label: 'Work Type',
        description: 'The category of work (ORDERS, RETURNS, CLAIMS, etc.)',
        valueType: 'select',
        options: [
          { value: 'ORDERS', label: 'Orders' },
          { value: 'RETURNS', label: 'Returns' },
          { value: 'CLAIMS', label: 'Claims' },
          { value: 'SUPPORT', label: 'Support' },
        ],
        operators: selectOperators,
      },
      {
        field: 'priority',
        label: 'Priority',
        description: 'Task priority (0-10, lower = higher priority)',
        valueType: 'number',
        operators: numberOperators,
      },
      {
        field: 'queue',
        label: 'Queue',
        description: 'The queue/team assignment',
        valueType: 'string',
        operators: stringOperators,
      },
      {
        field: 'status',
        label: 'Status',
        description: 'Current task status',
        valueType: 'select',
        options: [
          { value: 'PENDING', label: 'Pending' },
          { value: 'RESERVED', label: 'Reserved' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'WRAP_UP', label: 'Wrap Up' },
          { value: 'COMPLETED', label: 'Completed' },
        ],
        operators: selectOperators,
      },
      {
        field: 'title',
        label: 'Title',
        description: 'Task title text',
        valueType: 'string',
        operators: stringOperators,
      },
      {
        field: 'externalId',
        label: 'External ID',
        description: 'Reference ID from source system',
        valueType: 'string',
        operators: stringOperators,
      },
      {
        field: 'skills',
        label: 'Required Skills',
        description: 'Skills required to work this task',
        valueType: 'multiselect',
        options: [
          { value: 'orders-basic', label: 'Orders - Basic' },
          { value: 'orders-advanced', label: 'Orders - Advanced' },
          { value: 'returns-handling', label: 'Returns Handling' },
          { value: 'claims-handling', label: 'Claims Handling' },
          { value: 'escalation', label: 'Escalation' },
        ],
        operators: ['in', 'not_in', 'is_empty', 'is_not_empty'],
      },
    ];
  }

  /**
   * GET /rules/config/actions
   * Get available actions
   */
  @Get('config/actions')
  getActionConfigs(): RuleActionConfig[] {
    return [
      {
        type: 'set_priority',
        label: 'Set Priority',
        description: 'Set task priority to a specific value (0-10)',
        valueType: 'number',
      },
      {
        type: 'adjust_priority',
        label: 'Adjust Priority',
        description: 'Increase or decrease priority (negative = higher priority)',
        valueType: 'number',
      },
      {
        type: 'set_queue',
        label: 'Set Queue',
        description: 'Assign task to a specific queue',
        valueType: 'select',
        options: [
          { value: 'general', label: 'General Queue' },
          { value: 'orders-team', label: 'Orders Team' },
          { value: 'returns-team', label: 'Returns Team' },
          { value: 'claims-specialists', label: 'Claims Specialists' },
          { value: 'escalation-team', label: 'Escalation Team' },
        ],
      },
      {
        type: 'add_skill',
        label: 'Add Required Skill',
        description: 'Add a skill requirement to the task',
        valueType: 'select',
        options: [
          { value: 'orders-basic', label: 'Orders - Basic' },
          { value: 'orders-advanced', label: 'Orders - Advanced' },
          { value: 'returns-handling', label: 'Returns Handling' },
          { value: 'claims-handling', label: 'Claims Handling' },
          { value: 'escalation', label: 'Escalation' },
        ],
      },
      {
        type: 'remove_skill',
        label: 'Remove Required Skill',
        description: 'Remove a skill requirement from the task',
        valueType: 'select',
        options: [
          { value: 'orders-basic', label: 'Orders - Basic' },
          { value: 'orders-advanced', label: 'Orders - Advanced' },
          { value: 'returns-handling', label: 'Returns Handling' },
          { value: 'claims-handling', label: 'Claims Handling' },
          { value: 'escalation', label: 'Escalation' },
        ],
      },
      {
        type: 'set_timeout',
        label: 'Set Reservation Timeout',
        description: 'Set how long an agent has to accept (seconds)',
        valueType: 'number',
      },
      {
        type: 'set_metadata',
        label: 'Set Metadata',
        description: 'Set a custom metadata field',
        valueType: 'string',
        requiresField: true,
      },
      {
        type: 'stop_processing',
        label: 'Stop Processing',
        description: 'Stop evaluating further rules',
        valueType: 'boolean',
      },
    ];
  }

  /**
   * GET /rules/config/operators
   * Get available operators with descriptions
   */
  @Get('config/operators')
  getOperatorConfigs(): { operator: ConditionOperator; label: string; description: string }[] {
    return [
      { operator: 'equals', label: 'Equals', description: 'Value matches exactly' },
      { operator: 'not_equals', label: 'Not Equals', description: 'Value does not match' },
      { operator: 'greater_than', label: 'Greater Than', description: 'Value is greater than' },
      { operator: 'less_than', label: 'Less Than', description: 'Value is less than' },
      { operator: 'greater_or_equal', label: 'Greater or Equal', description: 'Value is greater than or equal to' },
      { operator: 'less_or_equal', label: 'Less or Equal', description: 'Value is less than or equal to' },
      { operator: 'contains', label: 'Contains', description: 'Text contains substring' },
      { operator: 'not_contains', label: 'Does Not Contain', description: 'Text does not contain substring' },
      { operator: 'starts_with', label: 'Starts With', description: 'Text starts with value' },
      { operator: 'ends_with', label: 'Ends With', description: 'Text ends with value' },
      { operator: 'in', label: 'In List', description: 'Value is in the list' },
      { operator: 'not_in', label: 'Not In List', description: 'Value is not in the list' },
      { operator: 'is_empty', label: 'Is Empty', description: 'Value is empty or not set' },
      { operator: 'is_not_empty', label: 'Is Not Empty', description: 'Value is set and not empty' },
      { operator: 'matches_regex', label: 'Matches Pattern', description: 'Value matches regex pattern' },
    ];
  }
}
