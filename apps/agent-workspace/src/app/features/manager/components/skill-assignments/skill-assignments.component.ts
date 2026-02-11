import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, catchError } from 'rxjs';
import { SkillApiService } from '../../../admin/services/skill.service';
import {
  Skill,
  SkillCategory,
  AgentSkill,
  SkillProficiency,
  PROFICIENCY_LABELS,
  User,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../../environments/environment';

interface AgentSkillDisplay {
  agent: User;
  skills: AgentSkill[];
  expanded: boolean;
}

@Component({
  selector: 'app-skill-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './skill-assignments.component.html',
  styleUrls: ['./skill-assignments.component.scss'],
})
export class SkillAssignmentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly skillService = inject(SkillApiService);

  // Data
  allSkills = signal<Skill[]>([]);
  agents = signal<AgentSkillDisplay[]>([]);

  // UI State
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  searchTerm = signal('');
  filterCategory = signal<SkillCategory | ''>('');

  // Assignment modal
  showAssignModal = signal(false);
  assignTarget = signal<User | null>(null);
  assignTargetSkills = signal<AgentSkill[]>([]);
  selectedSkillId = signal('');
  selectedProficiency = signal<SkillProficiency>(3);

  readonly proficiencyLabels = PROFICIENCY_LABELS;
  readonly proficiencyLevels: SkillProficiency[] = [1, 2, 3, 4, 5];

  activeSkills = computed(() => this.allSkills().filter((s) => s.active));

  filteredAgents = computed(() => {
    let result = this.agents();
    const search = this.searchTerm().toLowerCase();
    if (search) {
      result = result.filter(
        (a) =>
          a.agent.displayName.toLowerCase().includes(search) ||
          a.agent.username.toLowerCase().includes(search)
      );
    }
    return result;
  });

  setProficiencyFromEvent(value: string): void {
    this.selectedProficiency.set(Number(value) as SkillProficiency);
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);

    forkJoin({
      skills: this.skillService.getAllSkills(),
      users: this.http.get<{ users: User[] }>(`${environment.apiUrl}/rbac/config`).pipe(
        catchError(() => of({ users: [] }))
      ),
    }).subscribe({
      next: ({ skills, users }) => {
        this.allSkills.set(skills);

        // Filter to agents only (those with AGENT role)
        const agentUsers = (users as { users: User[] }).users.filter(
          (u) => u.role === 'AGENT' && u.active
        );

        // Load skills for each agent
        this.loadAgentSkills(agentUsers);
      },
      error: () => {
        this.showError('Failed to load data');
        this.isLoading.set(false);
      },
    });
  }

  private loadAgentSkills(agentUsers: User[]): void {
    if (agentUsers.length === 0) {
      this.agents.set([]);
      this.isLoading.set(false);
      return;
    }

    const skillRequests = agentUsers.map((agent) =>
      this.skillService.getAgentSkills(agent.id).pipe(
        catchError(() => of([] as AgentSkill[]))
      )
    );

    forkJoin(skillRequests).subscribe({
      next: (skillResults) => {
        const displays: AgentSkillDisplay[] = agentUsers.map((agent, i) => ({
          agent,
          skills: skillResults[i],
          expanded: false,
        }));
        this.agents.set(displays);
        this.isLoading.set(false);
      },
      error: () => {
        this.agents.set(agentUsers.map((agent) => ({
          agent,
          skills: [],
          expanded: false,
        })));
        this.isLoading.set(false);
      },
    });
  }

  // ====== Agent skill display ======

  toggleAgent(agent: AgentSkillDisplay): void {
    this.agents.update((agents) =>
      agents.map((a) =>
        a.agent.id === agent.agent.id
          ? { ...a, expanded: !a.expanded }
          : a
      )
    );
  }

  getSkillName(skillId: string): string {
    const skill = this.allSkills().find((s) => s.id === skillId);
    return skill?.name || skillId;
  }

  getSkillCategory(skillId: string): SkillCategory | '' {
    const skill = this.allSkills().find((s) => s.id === skillId);
    return skill?.category || '';
  }

  getProficiencyLabel(level: SkillProficiency): string {
    return PROFICIENCY_LABELS[level] || `Level ${level}`;
  }

  getProficiencyClass(level: SkillProficiency): string {
    const classes: Record<SkillProficiency, string> = {
      1: 'prof-novice',
      2: 'prof-basic',
      3: 'prof-intermediate',
      4: 'prof-advanced',
      5: 'prof-expert',
    };
    return classes[level] || '';
  }

  // ====== Assignment modal ======

  openAssignModal(agent: AgentSkillDisplay): void {
    this.assignTarget.set(agent.agent);
    this.assignTargetSkills.set([...agent.skills]);
    this.selectedSkillId.set('');
    this.selectedProficiency.set(3);
    this.showAssignModal.set(true);
    this.clearMessages();
  }

  closeAssignModal(): void {
    this.showAssignModal.set(false);
    this.assignTarget.set(null);
  }

  getUnassignedSkills(): Skill[] {
    const assigned = new Set(this.assignTargetSkills().map((s) => s.skillId));
    return this.activeSkills().filter((s) => !assigned.has(s.id));
  }

  addSkillToAgent(): void {
    const agent = this.assignTarget();
    const skillId = this.selectedSkillId();
    const proficiency = this.selectedProficiency();

    if (!agent || !skillId) return;

    this.skillService.addAgentSkill(agent.id, skillId, proficiency).subscribe({
      next: (agentSkill) => {
        this.assignTargetSkills.update((skills) => [...skills, agentSkill]);
        this.updateAgentSkillsLocally(agent.id, this.assignTargetSkills());
        this.selectedSkillId.set('');
        this.selectedProficiency.set(3);
        this.showSuccess(`Skill assigned to ${agent.displayName}`);
      },
      error: () => this.showError('Failed to assign skill'),
    });
  }

  updateProficiency(agentSkill: AgentSkill, newLevel: SkillProficiency): void {
    const agent = this.assignTarget();
    if (!agent) return;

    this.skillService.addAgentSkill(agent.id, agentSkill.skillId, newLevel).subscribe({
      next: (updated) => {
        this.assignTargetSkills.update((skills) =>
          skills.map((s) => (s.skillId === updated.skillId ? updated : s))
        );
        this.updateAgentSkillsLocally(agent.id, this.assignTargetSkills());
        this.showSuccess(`Proficiency updated`);
      },
      error: () => this.showError('Failed to update proficiency'),
    });
  }

  removeSkillFromAgent(agentSkill: AgentSkill): void {
    const agent = this.assignTarget();
    if (!agent) return;

    this.skillService.removeAgentSkill(agent.id, agentSkill.skillId).subscribe({
      next: () => {
        this.assignTargetSkills.update((skills) =>
          skills.filter((s) => s.skillId !== agentSkill.skillId)
        );
        this.updateAgentSkillsLocally(agent.id, this.assignTargetSkills());
        this.showSuccess(`Skill removed from ${agent.displayName}`);
      },
      error: () => this.showError('Failed to remove skill'),
    });
  }

  private updateAgentSkillsLocally(agentId: string, skills: AgentSkill[]): void {
    this.agents.update((agents) =>
      agents.map((a) =>
        a.agent.id === agentId ? { ...a, skills: [...skills] } : a
      )
    );
  }

  // ====== Helpers ======

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  private showSuccess(message: string): void {
    this.successMessage.set(message);
    this.errorMessage.set('');
    setTimeout(() => this.successMessage.set(''), 4000);
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.successMessage.set('');
  }
}
