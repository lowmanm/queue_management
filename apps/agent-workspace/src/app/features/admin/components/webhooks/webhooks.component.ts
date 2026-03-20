import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookStatus,
  Pipeline,
} from '@nexus-queue/shared-models';
import { WebhookApiService } from '../../services/webhook-api.service';
import { PipelineApiService } from '../../services/pipeline.service';
import { environment } from '../../../../../environments/environment';

/**
 * WebhooksComponent — Designer/Admin view for managing inbound webhook endpoints.
 *
 * Shows all endpoints, allows creating/deleting/toggling/regenerating tokens,
 * and displays the delivery log for a selected endpoint.
 *
 * Route: /admin/webhooks (designerGuard)
 */
@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './webhooks.component.html',
  styleUrls: ['./webhooks.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhooksComponent implements OnInit, OnDestroy {
  private readonly webhookApi = inject(WebhookApiService);
  private readonly pipelineApi = inject(PipelineApiService);
  private readonly destroy$ = new Subject<void>();

  readonly apiUrl = environment.apiUrl;

  // ── Endpoint List ────────────────────────────────────────────
  endpoints = signal<WebhookEndpoint[]>([]);
  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // ── Delivery Log ─────────────────────────────────────────────
  selectedEndpointId = signal<string | null>(null);
  deliveries = signal<WebhookDelivery[]>([]);
  deliveryTotal = signal(0);
  deliveryPage = signal(1);
  readonly deliveryLimit = 20;

  // ── Create Form ───────────────────────────────────────────────
  creating = signal(false);
  newName = signal('');
  selectedPipelineId = signal('');
  pipelines = signal<Pipeline[]>([]);

  // ── Secret Reveal ─────────────────────────────────────────────
  revealedSecret = signal<string | null>(null);

  // ── Computed Helpers ──────────────────────────────────────────
  get selectedEndpoint(): WebhookEndpoint | undefined {
    return this.endpoints().find((e) => e.id === this.selectedEndpointId());
  }

  get hasNextDeliveryPage(): boolean {
    return this.deliveryPage() * this.deliveryLimit < this.deliveryTotal();
  }

  get hasPrevDeliveryPage(): boolean {
    return this.deliveryPage() > 1;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadEndpoints();
    this.loadPipelines();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data Loading ──────────────────────────────────────────────

  loadEndpoints(): void {
    this.loading.set(true);
    this.webhookApi
      .listEndpoints()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (endpoints) => {
          this.endpoints.set(endpoints);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Failed to load webhook endpoints');
          this.loading.set(false);
        },
      });
  }

  loadPipelines(): void {
    this.pipelineApi
      .getAllPipelines()
      .pipe(takeUntil(this.destroy$))
      .subscribe((pipelines) => this.pipelines.set(pipelines));
  }

  loadDeliveries(page: number): void {
    const id = this.selectedEndpointId();
    if (!id) return;

    this.webhookApi
      .getDeliveries(id, page, this.deliveryLimit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resp) => {
          this.deliveries.set(resp.items);
          this.deliveryTotal.set(resp.total);
          this.deliveryPage.set(page);
        },
        error: () => this.errorMessage.set('Failed to load delivery log'),
      });
  }

  // ── Actions ───────────────────────────────────────────────────

  createEndpoint(): void {
    const name = this.newName().trim();
    const pipelineId = this.selectedPipelineId();
    if (!name || !pipelineId) {
      this.errorMessage.set('Name and pipeline are required');
      return;
    }

    this.webhookApi
      .createEndpoint(pipelineId, name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ep) => {
          this.endpoints.update((list) => [...list, ep]);
          this.revealedSecret.set(ep.secret);
          this.creating.set(false);
          this.newName.set('');
          this.selectedPipelineId.set('');
          this.successMessage.set('Webhook endpoint created');
        },
        error: () => this.errorMessage.set('Failed to create webhook endpoint'),
      });
  }

  deleteEndpoint(ep: WebhookEndpoint): void {
    if (!confirm(`Delete webhook endpoint "${ep.name}"? This cannot be undone.`)) return;

    this.webhookApi
      .deleteEndpoint(ep.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.endpoints.update((list) => list.filter((e) => e.id !== ep.id));
          if (this.selectedEndpointId() === ep.id) {
            this.selectedEndpointId.set(null);
            this.deliveries.set([]);
          }
          this.successMessage.set('Endpoint deleted');
        },
        error: () => this.errorMessage.set('Failed to delete endpoint'),
      });
  }

  toggleStatus(ep: WebhookEndpoint): void {
    const newStatus: WebhookStatus = ep.status === 'active' ? 'inactive' : 'active';
    this.webhookApi
      .toggleStatus(ep.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.endpoints.update((list) =>
            list.map((e) => (e.id === updated.id ? updated : e))
          );
        },
        error: () => this.errorMessage.set('Failed to update endpoint status'),
      });
  }

  regenerateToken(ep: WebhookEndpoint): void {
    if (
      !confirm(
        `Regenerate token for "${ep.name}"? The old token will stop working immediately.`
      )
    )
      return;

    this.webhookApi
      .regenerateToken(ep.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.endpoints.update((list) =>
            list.map((e) => (e.id === updated.id ? updated : e))
          );
          this.revealedSecret.set(updated.secret);
        },
        error: () => this.errorMessage.set('Failed to regenerate token'),
      });
  }

  selectEndpoint(id: string): void {
    this.selectedEndpointId.set(id);
    this.deliveries.set([]);
    this.deliveryTotal.set(0);
    this.deliveryPage.set(1);
    this.loadDeliveries(1);
  }

  copyUrl(ep: WebhookEndpoint): void {
    const url = `${this.apiUrl}/webhooks/${ep.token}`;
    navigator.clipboard.writeText(url).catch(() => {
      this.errorMessage.set('Could not copy to clipboard');
    });
  }

  copySecret(): void {
    const secret = this.revealedSecret();
    if (!secret) return;
    navigator.clipboard.writeText(secret).catch(() => {
      this.errorMessage.set('Could not copy to clipboard');
    });
  }

  dismissSecret(): void {
    this.revealedSecret.set(null);
  }

  showCreateForm(): void {
    this.creating.set(true);
    this.clearMessages();
  }

  cancelCreate(): void {
    this.creating.set(false);
    this.newName.set('');
    this.selectedPipelineId.set('');
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  getPipelineName(pipelineId: string): string {
    return this.pipelines().find((p) => p.id === pipelineId)?.name ?? pipelineId;
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
