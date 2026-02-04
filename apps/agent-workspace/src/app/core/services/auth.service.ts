import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Agent {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentAgentSubject = new BehaviorSubject<Agent | null>(null);
  public currentAgent$: Observable<Agent | null> =
    this.currentAgentSubject.asObservable();

  constructor() {
    this.initializeAuth();
  }

  private initializeAuth(): void {
    // Auto-login in development mode
    if (!environment.production) {
      this.autoLoginDev();
    }
  }

  private autoLoginDev(): void {
    const devAgent: Agent = {
      id: 'test-agent-01',
      name: 'Test_Agent_01',
    };
    this.currentAgentSubject.next(devAgent);
  }

  get currentAgent(): Agent | null {
    return this.currentAgentSubject.value;
  }

  get isAuthenticated(): boolean {
    return this.currentAgentSubject.value !== null;
  }

  login(agent: Agent): void {
    this.currentAgentSubject.next(agent);
  }

  logout(): void {
    this.currentAgentSubject.next(null);
  }
}
