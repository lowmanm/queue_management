import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import {
  Skill,
  SkillCategory,
  AgentSkill,
  SkillProficiency,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';

const API_BASE = `${environment.apiUrl}/routing`;

@Injectable({
  providedIn: 'root',
})
export class SkillApiService {
  private http = inject(HttpClient);

  // ==========================================================================
  // SKILL CRUD (Admin/Designer)
  // ==========================================================================

  /**
   * Get all skills, optionally filtered by category
   */
  getAllSkills(category?: SkillCategory): Observable<Skill[]> {
    const params = category ? { params: { category } } : {};
    return this.http.get<Skill[]>(`${API_BASE}/skills`, params).pipe(
      catchError((err) => {
        console.error('Failed to fetch skills:', err);
        return of([]);
      })
    );
  }

  /**
   * Get a specific skill by ID
   */
  getSkill(id: string): Observable<Skill | null> {
    return this.http.get<Skill>(`${API_BASE}/skills/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Create a new skill
   */
  createSkill(data: { name: string; description?: string; category: SkillCategory }): Observable<Skill> {
    return this.http.post<Skill>(`${API_BASE}/skills`, data);
  }

  /**
   * Update an existing skill
   */
  updateSkill(id: string, data: Partial<Skill>): Observable<Skill> {
    return this.http.put<Skill>(`${API_BASE}/skills/${id}`, data);
  }

  /**
   * Soft-delete (deactivate) a skill
   */
  deleteSkill(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/skills/${id}`);
  }

  /**
   * Toggle skill active status
   */
  toggleSkill(id: string): Observable<Skill> {
    return this.http.post<Skill>(`${API_BASE}/skills/${id}/toggle`, {});
  }

  // ==========================================================================
  // SKILL CATEGORIES
  // ==========================================================================

  /**
   * Get all skill categories
   */
  getCategories(): Observable<{ id: SkillCategory; name: string }[]> {
    return this.http.get<{ id: SkillCategory; name: string }[]>(`${API_BASE}/categories`).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================================
  // AGENT SKILL MANAGEMENT (Manager)
  // ==========================================================================

  /**
   * Get skills assigned to a specific agent
   */
  getAgentSkills(agentId: string): Observable<AgentSkill[]> {
    return this.http.get<AgentSkill[]>(`${API_BASE}/agents/${agentId}/skills`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Set all skills for an agent (replace)
   */
  setAgentSkills(agentId: string, skills: AgentSkill[]): Observable<{ success: boolean; count: number }> {
    return this.http.put<{ success: boolean; count: number }>(
      `${API_BASE}/agents/${agentId}/skills`,
      { skills }
    );
  }

  /**
   * Add a single skill to an agent
   */
  addAgentSkill(agentId: string, skillId: string, proficiency: SkillProficiency): Observable<AgentSkill> {
    return this.http.post<AgentSkill>(`${API_BASE}/agents/${agentId}/skills`, {
      skillId,
      proficiency,
    });
  }

  /**
   * Remove a skill from an agent
   */
  removeAgentSkill(agentId: string, skillId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/agents/${agentId}/skills/${skillId}`);
  }
}
