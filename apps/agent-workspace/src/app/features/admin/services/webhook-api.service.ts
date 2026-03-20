import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookStatus,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';

const API_BASE = `${environment.apiUrl}/webhooks`;

@Injectable({
  providedIn: 'root',
})
export class WebhookApiService {
  private readonly http = inject(HttpClient);

  /**
   * List all webhook endpoints, optionally filtered by pipeline.
   */
  listEndpoints(pipelineId?: string): Observable<WebhookEndpoint[]> {
    const params = pipelineId ? { params: { pipelineId } } : {};
    return this.http.get<WebhookEndpoint[]>(API_BASE, params);
  }

  /**
   * Create a new webhook endpoint for the given pipeline.
   */
  createEndpoint(pipelineId: string, name: string): Observable<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(API_BASE, { pipelineId, name });
  }

  /**
   * Delete a webhook endpoint by ID.
   */
  deleteEndpoint(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/${id}`);
  }

  /**
   * Toggle a webhook endpoint's active/inactive status.
   */
  toggleStatus(id: string, status: WebhookStatus): Observable<WebhookEndpoint> {
    return this.http.patch<WebhookEndpoint>(`${API_BASE}/${id}/status`, { status });
  }

  /**
   * Regenerate the token and secret for a webhook endpoint.
   * Returns the updated endpoint with the new secret (shown once only).
   */
  regenerateToken(id: string): Observable<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(`${API_BASE}/${id}/regenerate-token`, {});
  }

  /**
   * Get paginated delivery log for a webhook endpoint.
   */
  getDeliveries(
    id: string,
    page: number,
    limit: number
  ): Observable<{ items: WebhookDelivery[]; total: number }> {
    return this.http.get<{ items: WebhookDelivery[]; total: number }>(
      `${API_BASE}/${id}/deliveries`,
      { params: { page: page.toString(), limit: limit.toString() } }
    );
  }
}
