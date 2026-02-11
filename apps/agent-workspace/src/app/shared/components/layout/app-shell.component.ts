import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  sidebarOpen = signal(true);
  mobileMenuOpen = signal(false);
  currentPath = signal('');

  /** Whether the current route requests fullscreen mode (hides shell chrome) */
  fullscreen = signal(false);

  /** Breadcrumb data */
  breadcrumbs = signal<{ label: string; path: string }[]>([]);

  /** Current user display info */
  userName = computed(() => this.authService.currentUser?.displayName ?? '');
  userRole = computed(() => {
    const role = this.authService.currentRole;
    const labels: Record<string, string> = {
      AGENT: 'Agent',
      MANAGER: 'Manager',
      DESIGNER: 'Designer',
      ADMIN: 'Admin',
    };
    return role ? labels[role] ?? role : '';
  });

  /**
   * Navigation sections — organized by functional area, not role.
   * RBAC still controls visibility.
   */
  navSections = computed<NavSection[]>(() => {
    const sections: NavSection[] = [];

    // Home — always visible
    sections.push({
      title: 'Home',
      items: [
        { label: 'Dashboard', path: '/', icon: 'dashboard' },
      ],
    });

    // Workspace — only for roles with tasks:work permission
    if (this.authService.hasPermission('tasks:work')) {
      sections.push({
        title: 'Workspace',
        items: [
          { label: 'Agent Workspace', path: '/workspace', icon: 'workspace' },
        ],
      });
    }

    // Operations — Team Dashboard, Queue Monitor
    if (this.canAccessManager()) {
      sections.push({
        title: 'Operations',
        items: [
          { label: 'Team Dashboard', path: '/manager/team', icon: 'team' },
          { label: 'Queue Monitor', path: '/manager/queues', icon: 'queue' },
        ],
      });
    }

    // Configuration — Data Sources, Pipelines, Dispositions, Work States
    if (this.canAccessDesigner()) {
      sections.push({
        title: 'Configuration',
        items: [
          { label: 'Data Sources', path: '/admin/volume-loaders', icon: 'loader' },
          { label: 'Pipelines', path: '/admin/pipelines', icon: 'pipeline' },
          { label: 'Dispositions', path: '/admin/dispositions', icon: 'disposition' },
          { label: 'Work States', path: '/admin/work-states', icon: 'states' },
        ],
      });
    }

    // System — User Management
    if (this.canAccessAdmin()) {
      sections.push({
        title: 'System',
        items: [
          { label: 'User Management', path: '/admin/users', icon: 'users' },
        ],
      });
    }

    return sections;
  });

  ngOnInit(): void {
    // Track current route and resolve route data
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.currentPath.set(event.urlAfterRedirects);
        this.updateBreadcrumbs(event.urlAfterRedirects);
        this.resolveRouteData();
        this.mobileMenuOpen.set(false);
      });

    // Initialize
    this.currentPath.set(this.router.url);
    this.updateBreadcrumbs(this.router.url);
    this.resolveRouteData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Walk the activated route tree to find the deepest child route data
   * and check for fullscreen flag.
   */
  private resolveRouteData(): void {
    let child = this.route;
    while (child.firstChild) {
      child = child.firstChild;
    }
    const data = child.snapshot.data;
    this.fullscreen.set(!!data['fullscreen']);
  }

  private updateBreadcrumbs(url: string): void {
    const crumbs: { label: string; path: string }[] = [
      { label: 'Home', path: '/' },
    ];

    const segments = url.split('/').filter((s) => s);

    if (segments.length > 0) {
      const pathMap: Record<string, string> = {
        workspace: 'Workspace',
        manager: 'Operations',
        admin: 'Configuration',
        team: 'Team Dashboard',
        queues: 'Queue Monitor',
        pipelines: 'Pipelines',
        dispositions: 'Dispositions',
        'work-states': 'Work States',
        'volume-loaders': 'Data Sources',
        users: 'User Management',
      };

      let currentPath = '';
      for (const segment of segments) {
        currentPath += `/${segment}`;
        const label = pathMap[segment] || segment;
        crumbs.push({ label, path: currentPath });
      }
    }

    this.breadcrumbs.set(crumbs);
  }

  canAccessManager(): boolean {
    return this.authService.hasAnyRole(['MANAGER', 'ADMIN']);
  }

  canAccessDesigner(): boolean {
    return this.authService.hasAnyRole(['DESIGNER', 'ADMIN']);
  }

  canAccessAdmin(): boolean {
    return this.authService.hasRole('ADMIN');
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  isActive(path: string): boolean {
    const current = this.currentPath();
    if (path === '/') {
      return current === '/';
    }
    return current.startsWith(path);
  }

  goBack(): void {
    const crumbs = this.breadcrumbs();
    if (crumbs.length > 1) {
      this.router.navigate([crumbs[crumbs.length - 2].path]);
    } else {
      this.router.navigate(['/']);
    }
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
    this.closeMobileMenu();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
