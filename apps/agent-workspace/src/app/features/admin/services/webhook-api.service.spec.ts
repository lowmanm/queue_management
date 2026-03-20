import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WebhookApiService } from './webhook-api.service';
import { WebhookEndpoint, WebhookDelivery } from '@nexus-queue/shared-models';

const mockEndpoint: WebhookEndpoint = {
  id: 'wh-1',
  name: 'Sales CRM Hook',
  pipelineId: 'p-1',
  token: 'abc123token',
  secret: 'secret-value',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  deliveryCount: 5,
};

const mockDelivery: WebhookDelivery = {
  id: 'd-1',
  webhookId: 'wh-1',
  receivedAt: '2026-01-01T01:00:00Z',
  payloadBytes: 256,
  status: 'QUEUED',
  processingMs: 42,
};

describe('WebhookApiService', () => {
  let service: WebhookApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WebhookApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WebhookApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('listEndpoints: calls GET /webhooks', () => {
    service.listEndpoints().subscribe((endpoints) => {
      expect(endpoints).toEqual([mockEndpoint]);
    });

    const req = httpTesting.expectOne((r) => r.url.includes('/webhooks') && r.method === 'GET');
    req.flush([mockEndpoint]);
  });

  it('listEndpoints: appends pipelineId param when provided', () => {
    service.listEndpoints('p-1').subscribe();

    const req = httpTesting.expectOne((r) => r.url.includes('/webhooks') && r.method === 'GET');
    expect(req.request.params.get('pipelineId')).toBe('p-1');
    req.flush([mockEndpoint]);
  });

  it('createEndpoint: calls POST /webhooks with body', () => {
    service.createEndpoint('p-1', 'My Hook').subscribe((ep) => {
      expect(ep).toEqual(mockEndpoint);
    });

    const req = httpTesting.expectOne((r) => r.url.includes('/webhooks') && r.method === 'POST');
    expect(req.request.body).toEqual({ pipelineId: 'p-1', name: 'My Hook' });
    req.flush(mockEndpoint);
  });

  it('deleteEndpoint: calls DELETE /webhooks/:id', () => {
    service.deleteEndpoint('wh-1').subscribe();

    const req = httpTesting.expectOne((r) => r.url.includes('/webhooks/wh-1') && r.method === 'DELETE');
    req.flush(null);
  });

  it('regenerateToken: calls POST /webhooks/:id/regenerate-token', () => {
    service.regenerateToken('wh-1').subscribe((ep) => {
      expect(ep).toEqual(mockEndpoint);
    });

    const req = httpTesting.expectOne(
      (r) => r.url.includes('/webhooks/wh-1/regenerate-token') && r.method === 'POST'
    );
    req.flush(mockEndpoint);
  });

  it('getDeliveries: calls GET /webhooks/:id/deliveries with pagination params', () => {
    service.getDeliveries('wh-1', 2, 25).subscribe((resp) => {
      expect(resp.items).toEqual([mockDelivery]);
      expect(resp.total).toBe(1);
    });

    const req = httpTesting.expectOne(
      (r) => r.url.includes('/webhooks/wh-1/deliveries') && r.method === 'GET'
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('25');
    req.flush({ items: [mockDelivery], total: 1 });
  });
});
