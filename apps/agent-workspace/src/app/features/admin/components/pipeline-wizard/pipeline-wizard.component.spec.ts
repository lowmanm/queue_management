import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { PipelineWizardComponent } from './pipeline-wizard.component';
import { PipelineApiService } from '../../services/pipeline.service';
import { SkillApiService } from '../../services/skill.service';

const mockPipelineApi = {
  createPipeline: () => of({ id: 'p1', name: 'Test', enabled: false }),
  createQueue: () => of({ id: 'q1', name: 'Queue 1', pipelineId: 'p1' }),
  createRoutingRule: () => of({ id: 'r1', name: 'Rule 1', pipelineId: 'p1' }),
  enablePipeline: () => of({ id: 'p1', name: 'Test', enabled: true }),
  validatePipeline: () => of({ valid: true, errors: [], warnings: [] }),
  getAllPipelines: () => of([{ id: 'p-other', name: 'Other Pipeline' }]),
};

const mockSkillApi = {
  getAllSkills: () => of([]),
};

describe('PipelineWizardComponent', () => {
  let component: PipelineWizardComponent;
  let fixture: ComponentFixture<PipelineWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineWizardComponent, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: PipelineApiService, useValue: mockPipelineApi },
        { provide: SkillApiService, useValue: mockSkillApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PipelineWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start on step 1', () => {
    expect(component.currentStep()).toBe(1);
  });

  it('should render step 1 form fields', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#pipeline-name')).toBeTruthy();
    expect(compiled.querySelector('#pipeline-description')).toBeTruthy();
  });

  it('should not advance from step 1 when name is empty', () => {
    component.step1Form.get('name')?.setValue('');
    component.next();
    expect(component.currentStep()).toBe(1);
    expect(component.errorMessage()).toBeTruthy();
  });

  it('should advance from step 1 when name is valid', () => {
    component.step1Form.get('name')?.setValue('My Pipeline');
    component.next();
    expect(component.currentStep()).toBe(2);
    expect(component.errorMessage()).toBe('');
  });

  it('should go back from step 2 to step 1', () => {
    component.step1Form.get('name')?.setValue('My Pipeline');
    component.next(); // go to step 2
    component.back(); // go back to step 1
    expect(component.currentStep()).toBe(1);
  });

  it('should not go back from step 1', () => {
    component.back();
    expect(component.currentStep()).toBe(1);
  });

  it('should add and remove schema fields', () => {
    component.addSchemaField();
    expect(component.schemaFields.length).toBe(1);
    component.removeSchemaField(0);
    expect(component.schemaFields.length).toBe(0);
  });

  it('should add and remove routing rules', () => {
    component.addRoutingRule();
    expect(component.routingRules.length).toBe(1);
    component.removeRoutingRule(0);
    expect(component.routingRules.length).toBe(0);
  });

  it('should add and remove queues', () => {
    component.addQueue();
    expect(component.wizardQueues.length).toBe(1);
    component.removeQueue(0);
    expect(component.wizardQueues.length).toBe(0);
  });

  it('should show step 7 (Review) content after navigating through all steps', () => {
    // Step 1
    component.step1Form.get('name')?.setValue('Pipeline X');
    component.next();
    // Step 2 - skip
    component.next();
    // Step 3 - skip
    component.next();
    // Step 4 - add a queue first (required)
    component.addQueue();
    component.getQueueForm(0).patchValue({ label: 'Q1', name: 'Queue One', priority: 1 });
    component.next();
    // Step 5
    component.next();
    // Step 6 (Callbacks) - skip (both empty = valid)
    component.next();
    // Should be on step 7 (Review)
    expect(component.currentStep()).toBe(7);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Review');
  });

  it('Callbacks step: valid when both URL and events are empty', () => {
    component.step6Form.get('callbackUrl')?.setValue('');
    component.step6Form.patchValue({ callbackEvents: [] });
    expect(component.callbacksStepValid()).toBe(true);
  });

  it('Callbacks step: invalid when URL is set but no events are selected', () => {
    component.step6Form.get('callbackUrl')?.setValue('https://example.com/hook');
    component.step6Form.patchValue({ callbackEvents: [] });
    expect(component.callbacksStepValid()).toBe(false);
  });

  it('Callbacks step: valid when both URL and at least one event are set', () => {
    component.step6Form.get('callbackUrl')?.setValue('https://example.com/hook');
    component.toggleCallbackEvent('task.completed');
    expect(component.callbacksStepValid()).toBe(true);
  });

  it('Routing step: routingActionType defaults to "queue" on new rule', () => {
    component.addRoutingRule();
    expect(component.getRuleForm(0).get('routingActionType')?.value).toBe('queue');
    expect(component.getRoutingActionType(0)).toBe('queue');
  });

  it('Routing step: switching to "pipeline" action type exposes targetPipelineId field', () => {
    component.addRoutingRule();
    component.getRuleForm(0).patchValue({ routingActionType: 'pipeline', targetPipelineId: 'p-other' });
    expect(component.getRoutingActionType(0)).toBe('pipeline');
    expect(component.getRuleForm(0).get('targetPipelineId')?.value).toBe('p-other');
  });

  it('Routing step: validation fails when action is "pipeline" but targetPipelineId not set', () => {
    component.addRoutingRule();
    component.getRuleForm(0).patchValue({ name: 'My Rule', routingActionType: 'pipeline', targetPipelineId: null });
    const errors = component.validateStep(3);
    expect(errors.some((e) => e.includes('target pipeline'))).toBe(true);
  });
});
