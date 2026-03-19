import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { RuleBuilderComponent } from './rule-builder.component';
import { RulesService } from '../../services/rules.service';
import { RuleSet } from '@nexus-queue/shared-models';

const now = new Date().toISOString();

const mockRuleSet: RuleSet = {
  id: 'rs-1',
  name: 'Test Rule Set',
  description: 'A test',
  enabled: true,
  rules: [],
  appliesTo: { workTypes: [], queues: [] },
  createdAt: now,
  updatedAt: now,
};

const mockRulesService = {
  ruleSets$: of([mockRuleSet]),
  fields$: of([]),
  operators$: of([]),
  actions$: of([]),
  loadConfiguration: () => undefined,
  getRuleSets: () => of([mockRuleSet]),
  getRuleSet: () => of(mockRuleSet),
  createRuleSet: (rs: RuleSet) => of({ ...rs, id: 'rs-new' }),
  updateRuleSet: (_id: string, rs: RuleSet) => of(rs),
  deleteRuleSet: () => of(undefined),
  testRuleSet: () =>
    of({
      taskBefore: {},
      taskAfter: {},
      rulesEvaluated: [],
      stoppedAt: undefined,
    }),
};

describe('RuleBuilderComponent', () => {
  let component: RuleBuilderComponent;
  let fixture: ComponentFixture<RuleBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuleBuilderComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: RulesService, useValue: mockRulesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RuleBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in list view', () => {
    expect(component.viewMode()).toBe('list');
  });

  it('should render rule sets table in list view', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.rule-sets-table')).toBeTruthy();
  });

  it('should display rule set names', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Test Rule Set');
  });

  it('should switch to edit view when clicking New Rule Set', () => {
    component.newRuleSet();
    expect(component.viewMode()).toBe('edit');
    expect(component.editingRuleSet()).toBeTruthy();
    expect(component.editingRuleSet()?.id).toBe('');
  });

  it('should switch to edit view when editRuleSet is called', () => {
    component.editRuleSet(mockRuleSet);
    expect(component.viewMode()).toBe('edit');
    expect(component.formName()).toBe('Test Rule Set');
  });

  it('should return to list view on cancelEdit', () => {
    component.newRuleSet();
    component.cancelEdit();
    expect(component.viewMode()).toBe('list');
    expect(component.editingRuleSet()).toBeNull();
  });

  it('should add a rule when addRule is called', () => {
    component.newRuleSet();
    expect(component.editingRuleSet()?.rules.length).toBe(0);
    component.addRule();
    expect(component.editingRuleSet()?.rules.length).toBe(1);
  });

  it('should delete a rule when deleteRule is called', () => {
    component.newRuleSet();
    component.addRule();
    const rule = component.editingRuleSet()!.rules[0];
    component.deleteRule(rule.id);
    expect(component.editingRuleSet()?.rules.length).toBe(0);
  });

  it('should duplicate a rule when duplicateRule is called', () => {
    component.newRuleSet();
    component.addRule();
    const rule = component.editingRuleSet()!.rules[0];
    component.duplicateRule(rule);
    expect(component.editingRuleSet()?.rules.length).toBe(2);
    expect(component.editingRuleSet()?.rules[1].name).toContain('copy');
  });

  it('should move rule up', () => {
    component.newRuleSet();
    component.addRule();
    component.addRule();
    const firstId = component.editingRuleSet()!.rules[0].id;
    const secondId = component.editingRuleSet()!.rules[1].id;
    component.moveRuleDown(0);
    expect(component.editingRuleSet()!.rules[0].id).toBe(secondId);
    expect(component.editingRuleSet()!.rules[1].id).toBe(firstId);
  });

  it('should open test dialog', () => {
    component.openTest(mockRuleSet);
    expect(component.testingRuleSet()).toEqual({ id: 'rs-1', name: 'Test Rule Set' });
  });

  it('should close test dialog', () => {
    component.openTest(mockRuleSet);
    component.closeTest();
    expect(component.testingRuleSet()).toBeNull();
  });

  it('should show error if saving without a name', () => {
    component.newRuleSet();
    component.updateFormName('');
    component.saveRuleSet();
    expect(component.errorMessage()).toBeTruthy();
  });

  it('should expand rule editor on toggleExpand', () => {
    component.newRuleSet();
    component.addRule();
    const ruleId = component.editingRuleSet()!.rules[0].id;
    component.toggleExpand(ruleId);
    expect(component.expandedRuleId()).toBe(ruleId);
    component.toggleExpand(ruleId);
    expect(component.expandedRuleId()).toBeNull();
  });
});
