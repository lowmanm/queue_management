import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    // If already authenticated, redirect to workspace
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/']);
    }
  }

  login(): void {
    // Mock login for now
    this.authService.login({
      id: 'agent-001',
      name: 'Agent_001',
    });
    this.router.navigate(['/']);
  }
}
