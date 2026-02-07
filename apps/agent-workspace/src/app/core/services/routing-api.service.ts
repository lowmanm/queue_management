import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import {
  Skill,
  SkillCategory,
  AgentSkill,
  RoutingStrategy,
  AgentCapacity,
  RoutingConfigSummary,
  SkillProficiency,
} from '@nexus-queue/shared-models';

const API_BASE = 'http://localhost:3000/api/routing';

export interface SkillCategoryOption {
  id: SkillCategory;
  name: string;
}

export interface RoutingAlgorithmOption {
  id: string;
  name: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class RoutingApiService {
  private http = inject(HttpClient);

  // ==========================================================================
  // SKILLS
  // ==========================================================================

  getAllSkills(): Observable<Skill[]> {
    return this.http.get<Skill[]>(`${API_BASE}/skills`).pipe(
      catchError((err) => {
        console.error('Failed to fetch skills:', err);
        return of([]);
      })
    );
  }

  getSkillsByCategory(category: SkillCategory): Observable<Skill[]> {
    return this.http.get<Skill[]>(`${API_BASE}/skills`, { params: { category } }).pipe(
      catchError((err) => {
        console.error('Failed to fetch skills by category:', err);
        return of([]);
      })
    );
  }

  getSkill(id: string): Observable<Skill | null> {
    return this.http.get<Skill>(`${API_BASE}/skills/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  createSkill(data: { name: string; description?: string; category: SkillCategory }): Observable<Skill> {
    return this.http.post<Skill>(`${API_BASE}/skills`, data);
  }

  updateSkill(id: string, data: Partial<Skill>): Observable<Skill> {
    return this.http.put<Skill>(`${API_BASE}/skills/${id}`, data);
  }

  deleteSkill(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/skills/${id}`);
  }

  toggleSkill(id: string): Observable<Skill> {
    return this.http.post<Skill>(`${API_BASE}/skills/${id}/toggle`, {});
  }

  // ==========================================================================
  // AGENT SKILLS
  // ==========================================================================

  getAgentSkills(agentId: string): Observable<AgentSkill[]> {
    return this.http.get<AgentSkill[]>(`${API_BASE}/agents/${agentId}/skills`).pipe(
      catchError(() => of([]))
    );
  }

  setAgentSkills(agentId: string, skills: AgentSkill[]): Observable<{ success: boolean; count: number }> {
    return this.http.put<{ success: boolean; count: number }>(
      `${API_BASE}/agents/${agentId}/skills`,
      { skills }
    );
  }

  addAgentSkill(
    agentId: string,
    skillId: string,
    proficiency: SkillProficiency
  ): Observable<AgentSkill> {
    return this.http.post<AgentSkill>(`${API_BASE}/agents/${agentId}/skills`, {
      skillId,
      proficiency,
    });
  }

  removeAgentSkill(agentId: string, skillId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${API_BASE}/agents/${agentId}/skills/${skillId}`
    );
  }

  // ==========================================================================
  // STRATEGIES
  // ==========================================================================

  getAllStrategies(): Observable<RoutingStrategy[]> {
    return this.http.get<RoutingStrategy[]>(`${API_BASE}/strategies`).pipe(
      catchError((err) => {
        console.error('Failed to fetch strategies:', err);
        return of([]);
      })
    );
  }

  getStrategy(id: string): Observable<RoutingStrategy | null> {
    return this.http.get<RoutingStrategy>(`${API_BASE}/strategies/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  createStrategy(
    data: Omit<RoutingStrategy, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<RoutingStrategy> {
    return this.http.post<RoutingStrategy>(`${API_BASE}/strategies`, data);
  }

  updateStrategy(id: string, data: Partial<RoutingStrategy>): Observable<RoutingStrategy> {
    return this.http.put<RoutingStrategy>(`${API_BASE}/strategies/${id}`, data);
  }

  deleteStrategy(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/strategies/${id}`);
  }

  toggleStrategy(id: string): Observable<RoutingStrategy> {
    return this.http.post<RoutingStrategy>(`${API_BASE}/strategies/${id}/toggle`, {});
  }

  // ==========================================================================
  // CAPACITY & CONFIG
  // ==========================================================================

  getAllAgentCapacities(): Observable<AgentCapacity[]> {
    return this.http.get<AgentCapacity[]>(`${API_BASE}/capacity`).pipe(
      catchError(() => of([]))
    );
  }

  getAgentCapacity(agentId: string): Observable<AgentCapacity | null> {
    return this.http.get<AgentCapacity>(`${API_BASE}/capacity/${agentId}`).pipe(
      catchError(() => of(null))
    );
  }

  getConfigSummary(): Observable<RoutingConfigSummary> {
    return this.http.get<RoutingConfigSummary>(`${API_BASE}/summary`).pipe(
      catchError(() =>
        of({
          totalStrategies: 0,
          activeStrategies: 0,
          totalSkills: 0,
          activeSkills: 0,
          defaultAlgorithm: 'skill-weighted' as const,
          workloadBalancingEnabled: false,
        })
      )
    );
  }

  // ==========================================================================
  // OPTIONS
  // ==========================================================================

  getSkillCategories(): Observable<SkillCategoryOption[]> {
    return this.http.get<SkillCategoryOption[]>(`${API_BASE}/categories`).pipe(
      catchError(() =>
        of([
          { id: 'language' as SkillCategory, name: 'Language' },
          { id: 'product' as SkillCategory, name: 'Product Knowledge' },
          { id: 'technical' as SkillCategory, name: 'Technical' },
          { id: 'process' as SkillCategory, name: 'Process' },
          { id: 'certification' as SkillCategory, name: 'Certification' },
          { id: 'other' as SkillCategory, name: 'Other' },
        ])
      )
    );
  }

  getRoutingAlgorithms(): Observable<RoutingAlgorithmOption[]> {
    return this.http.get<RoutingAlgorithmOption[]>(`${API_BASE}/algorithms`).pipe(
      catchError(() =>
        of([
          { id: 'round-robin', name: 'Round Robin', description: 'Distribute tasks evenly' },
          { id: 'skill-weighted', name: 'Skill Weighted', description: 'Best skill match' },
          { id: 'least-busy', name: 'Least Busy', description: 'Fewest active tasks' },
          { id: 'most-idle', name: 'Most Idle', description: 'Idle the longest' },
        ])
      )
    );
  }
}
