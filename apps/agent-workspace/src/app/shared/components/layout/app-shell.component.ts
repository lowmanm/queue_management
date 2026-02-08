import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { UserRole } from '@nexus-queue/shared-models';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  permission?: string;
  roles: UserRole[];
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

  // Breadcrumb data
  breadcrumbs = signal<{ label: string; path: string }[]>([]);

  // Navigation sections
  navSections = computed<NavSection[]>(() => {
    const sections: NavSection[] = [];

    // Agent section - always show workspace
    sections.push({
      title: 'Workspace',
      items: [
        { label: 'Agent Workspace', path: '/', icon: 'workspace', roles: ['AGENT', 'MANAGER', 'DESIGNER', 'ADMIN'] },
      ],
    });

    // Manager section
    if (this.canAccessManager()) {
      sections.push({
        title: 'Manager',
        items: [
          { label: 'Team Dashboard', path: '/manager/team', icon: 'team', roles: ['MANAGER', 'ADMIN'] },
          { label: 'Queue Monitor', path: '/manager/queues', icon: 'queue', roles: ['MANAGER', 'ADMIN'] },
          { label: 'Queue Config', path: '/manager/queue-config', icon: 'config', roles: ['MANAGER', 'ADMIN'] },
        ],
      });
    }

    // Designer section
    if (this.canAccessDesigner()) {
      sections.push({
        title: 'Design',
        items: [
          { label: 'Task Sources', path: '/admin/task-sources', icon: 'source', roles: ['DESIGNER', 'ADMIN'] },
          { label: 'Dispositions', path: '/admin/dispositions', icon: 'disposition', roles: ['DESIGNER', 'ADMIN'] },
          { label: 'Logic Builder', path: '/admin/logic-builder', icon: 'logic', roles: ['DESIGNER', 'ADMIN'] },
          { label: 'Routing', path: '/admin/routing', icon: 'routing', roles: ['DESIGNER', 'ADMIN'] },
          { label: 'Work States', path: '/admin/work-states', icon: 'states', roles: ['DESIGNER', 'ADMIN'] },
          { label: 'Volume Loaders', path: '/admin/volume-loaders', icon: 'loader', roles: ['DESIGNER', 'ADMIN'] },
        ],
      });
    }

    // Admin section
    if (this.canAccessAdmin()) {
      sections.push({
        title: 'Administration',
        items: [
          { label: 'User Management', path: '/admin/users', icon: 'users', roles: ['ADMIN'] },
        ],
      });
    }

    return sections;
  });

  ngOnInit(): void {
    // Track current route
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.currentPath.set(event.urlAfterRedirects);
        this.updateBreadcrumbs(event.urlAfterRedirects);
        // Close mobile menu on navigation
        this.mobileMenuOpen.set(false);
      });

    // Initialize current path
    this.currentPath.set(this.router.url);
    this.updateBreadcrumbs(this.router.url);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateBreadcrumbs(url: string): void {
    const crumbs: { label: string; path: string }[] = [
      { label: 'Home', path: '/' },
    ];

    const segments = url.split('/').filter((s) => s);

    if (segments.length > 0) {
      const pathMap: Record<string, string> = {
        manager: 'Manager',
        admin: 'Admin',
        team: 'Team Dashboard',
        queues: 'Queue Monitor',
        'queue-config': 'Queue Config',
        'task-sources': 'Task Sources',
        dispositions: 'Dispositions',
        'logic-builder': 'Logic Builder',
        routing: 'Routing',
        'work-states': 'Work States',
        'volume-loaders': 'Volume Loaders',
        users: 'Users',
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
    // Navigate to previous breadcrumb or home
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
}
