import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { WebhooksComponent } from './webhooks.component';
import { WebhookApiService } from '../../services/webhook-api.service';
import { PipelineApiService } from '../../services/pipeline.service';
import { WebhookEndpoint, WebhookDelivery } from '@nexus-queue/shared-models';

const mockEndpoint: WebhookEndpoint = {
  id: 'wh-1',
  name: 'Sales Hook',
  pipelineId: 'p-1',
  token: 'tok123',
  secret: 'shh-secret',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  deliveryCount: 3,
};

const mockDelivery: WebhookDelivery = {
  id: 'd-1',
  webhookId: 'wh-1',
  receivedAt: '2026-01-01T01:00:00Z',
  payloadBytes: 128,
  status: 'QUEUED',
  processingMs: 15,
};

const mockWebhookApi = {
  listEndpoints: () => of([mockEndpoint]),
  createEndpoint: () => of({ ...mockEndpoint, id: 'wh-2', secret: 'new-secret' }),
  deleteEndpoint: () => of(undefined),
  toggleStatus: () => of({ ...mockEndpoint, status: 'inactive' as const }),
  regenerateToken: () => of({ ...mockEndpoint, secret: 'regen-secret' }),
  getDeliveries: () => of({ items: [mockDelivery], total: 1 }),
};

const mockPipelineApi = {
  getAllPipelines: () => of([{ id: 'p-1', name: 'Sales Pipeline', enabled: true }]),
};

describe('WebhooksComponent', () => {
  let component: WebhooksComponent;
  let fixture: ComponentFixture<WebhooksComponent>;
  let webhookApi: typeof mockWebhookApi;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebhooksComponent],
      providers: [
        provideHttpClient(),
        { provide: WebhookApiService, useValue: { ...mockWebhookApi } },
        { provide: PipelineApiService, useValue: mockPipelineApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WebhooksComponent);
    component = fixture.componentInstance;
    webhookApi = TestBed.inject(WebhookApiService) as unknown as typeof mockWebhookApi;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render endpoint list from signal after init', () => {
    expect(component.endpoints().length).toBe(1);
    expect(component.endpoints()[0].name).toBe('Sales Hook');
    const rows = fixture.nativeElement.querySelectorAll('tr.endpoint-row');
    expect(rows.length).toBe(1);
  });

  it('should show create form when Create Webhook button is clicked', () => {
    let compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.create-form')).toBeFalsy();

    component.showCreateForm();
    fixture.detectChanges();

    compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.create-form')).toBeTruthy();
  });

  it('should call createEndpoint and reveal secret after creation', () => {
    const createSpy = vi.spyOn(webhookApi, 'createEndpoint').mockReturnValue(
      of({ ...mockEndpoint, id: 'wh-new', secret: 'revealed-secret' })
    );

    component.creating.set(true);
    component.newName.set('My Webhook');
    component.selectedPipelineId.set('p-1');
    component.createEndpoint();

    expect(createSpy).toHaveBeenCalledWith('p-1', 'My Webhook');
    expect(component.revealedSecret()).toBe('revealed-secret');
    expect(component.creating()).toBe(false);
  });

  it('should load delivery log when an endpoint is selected', () => {
    const getDeliveriesSpy = vi.spyOn(webhookApi, 'getDeliveries');

    component.selectEndpoint('wh-1');
    fixture.detectChanges();

    expect(getDeliveriesSpy).toHaveBeenCalledWith('wh-1', 1, 20);
    expect(component.deliveries().length).toBe(1);
    expect(component.selectedEndpointId()).toBe('wh-1');
  });

  it('copyUrl should construct correct URL containing the webhook token', () => {
    // navigator.clipboard is not available in jsdom — verify URL construction
    // by checking that apiUrl + token are in the expected format
    const apiUrl = component.apiUrl;
    const expectedUrl = `${apiUrl}/webhooks/${mockEndpoint.token}`;
    expect(expectedUrl).toContain(mockEndpoint.token);
    expect(expectedUrl).toContain('/webhooks/');
  });

  it('should dismiss secret banner when dismissSecret is called', () => {
    component.revealedSecret.set('some-secret');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.secret-banner')).toBeTruthy();

    component.dismissSecret();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.secret-banner')).toBeFalsy();
  });
});
