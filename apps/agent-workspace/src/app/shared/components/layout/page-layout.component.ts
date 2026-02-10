import { Component, Input, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';

@Component({
  selector: 'app-page-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-layout">
      <!-- Page Header -->
      <header class="page-header">
        <div class="header-left">
          <button class="back-btn" (click)="goBack()" title="Go Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span class="back-text">Back</span>
          </button>

          <!-- Breadcrumbs -->
          <nav class="breadcrumbs" *ngIf="breadcrumbs.length > 0">
            @for (crumb of breadcrumbs; track crumb.path; let isLast = $last) {
              @if (!isLast) {
                <a class="breadcrumb-link" [routerLink]="crumb.path">{{ crumb.label }}</a>
                <span class="breadcrumb-separator">/</span>
              } @else {
                <span class="breadcrumb-current">{{ crumb.label }}</span>
              }
            }
          </nav>
        </div>

        <div class="header-right">
          <ng-content select="[slot=actions]"></ng-content>
        </div>
      </header>

      <!-- Page Title -->
      @if (title) {
        <div class="page-title-section">
          <h1 class="page-title">{{ title }}</h1>
          @if (subtitle) {
            <p class="page-subtitle">{{ subtitle }}</p>
          }
        </div>
      }

      <!-- Page Content -->
      <div class="page-body">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    @use 'styles/variables' as *;

    .page-layout {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: $spacing-4 $spacing-6;
      background-color: $color-white;
      border-bottom: 1px solid $color-gray-200;
      flex-shrink: 0;

      @media (max-width: $breakpoint-md) {
        padding: $spacing-3 $spacing-4;
      }
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: $spacing-4;
      min-width: 0;
      flex: 1;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: $spacing-3;
      flex-shrink: 0;
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      padding: $spacing-2 $spacing-3;
      background-color: $color-gray-100;
      border: 1px solid $color-gray-200;
      border-radius: $border-radius-md;
      color: $color-gray-700;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      cursor: pointer;
      transition: all $transition-fast;

      &:hover {
        background-color: $color-gray-200;
        color: $color-gray-900;
      }

      svg {
        flex-shrink: 0;
      }

      .back-text {
        @media (max-width: $breakpoint-sm) {
          display: none;
        }
      }
    }

    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: $spacing-2;
      font-size: $font-size-sm;
      min-width: 0;
      overflow: hidden;

      @media (max-width: $breakpoint-md) {
        display: none;
      }
    }

    .breadcrumb-link {
      color: $color-gray-500;
      text-decoration: none;
      white-space: nowrap;
      transition: color $transition-fast;

      &:hover {
        color: $color-primary;
      }
    }

    .breadcrumb-separator {
      color: $color-gray-400;
    }

    .breadcrumb-current {
      color: $color-gray-900;
      font-weight: $font-weight-medium;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .page-title-section {
      padding: $spacing-6;
      padding-bottom: 0;
      flex-shrink: 0;

      @media (max-width: $breakpoint-md) {
        padding: $spacing-4;
        padding-bottom: 0;
      }
    }

    .page-title {
      margin: 0;
      font-size: $font-size-2xl;
      font-weight: $font-weight-bold;
      color: $color-gray-900;

      @media (max-width: $breakpoint-md) {
        font-size: $font-size-xl;
      }
    }

    .page-subtitle {
      margin: $spacing-2 0 0 0;
      font-size: $font-size-base;
      color: $color-gray-600;
    }

    .page-body {
      flex: 1;
      padding: $spacing-6;
      overflow-y: auto;

      @media (max-width: $breakpoint-md) {
        padding: $spacing-4;
      }
    }
  `]
})
export class PageLayoutComponent implements OnInit, OnDestroy {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() showBreadcrumbs = true;

  private router = inject(Router);
  private location = inject(Location);
  private destroy$ = new Subject<void>();

  breadcrumbs: { label: string; path: string }[] = [];

  ngOnInit(): void {
    this.updateBreadcrumbs(this.router.url);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.updateBreadcrumbs(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateBreadcrumbs(url: string): void {
    if (!this.showBreadcrumbs) {
      this.breadcrumbs = [];
      return;
    }

    const crumbs: { label: string; path: string }[] = [
      { label: 'Home', path: '/' },
    ];

    const segments = url.split('/').filter((s) => s);
    const pathMap: Record<string, string> = {
      manager: 'Manager',
      admin: 'Admin',
      team: 'Team Dashboard',
      queues: 'Queue Monitor',
      pipelines: 'Pipelines',
      dispositions: 'Dispositions',
      'work-states': 'Work States',
      'volume-loaders': 'Data Sources',
      users: 'Users',
    };

    let currentPath = '';
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const label = pathMap[segment] || segment;
      crumbs.push({ label, path: currentPath });
    }

    this.breadcrumbs = crumbs;
  }

  goBack(): void {
    // Check if we can go back in history
    if (window.history.length > 1) {
      this.location.back();
    } else {
      // Fallback to home
      this.router.navigate(['/']);
    }
  }
}
