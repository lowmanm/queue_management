import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkillApiService } from '../../services/skill.service';
import {
  Skill,
  SkillCategory,
  PROFICIENCY_LABELS,
} from '@nexus-queue/shared-models';

@Component({
  selector: 'app-skills',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.scss'],
})
export class SkillsComponent implements OnInit {
  private readonly skillService = inject(SkillApiService);

  // Data
  skills = signal<Skill[]>([]);
  categories = signal<{ id: SkillCategory; name: string }[]>([]);

  // UI State
  isLoading = signal(false);
  showEditor = signal(false);
  editingSkill = signal<Skill | null>(null);
  errorMessage = signal('');
  successMessage = signal('');

  // Filter
  filterCategory = signal<SkillCategory | ''>('');
  filterActive = signal<'' | 'true' | 'false'>('');
  searchTerm = signal('');

  // Form state
  formData = signal<{
    name: string;
    description: string;
    category: SkillCategory;
  }>({
    name: '',
    description: '',
    category: 'process',
  });

  // Proficiency labels for display
  readonly proficiencyLabels = PROFICIENCY_LABELS;

  // Category display info
  readonly categoryIcons: Record<SkillCategory, string> = {
    language: 'translate',
    product: 'inventory',
    technical: 'build',
    process: 'account_tree',
    certification: 'verified',
    other: 'label',
  };

  // Computed views
  filteredSkills = computed(() => {
    let result = this.skills();

    const cat = this.filterCategory();
    if (cat) {
      result = result.filter((s) => s.category === cat);
    }

    const active = this.filterActive();
    if (active !== '') {
      const isActive = active === 'true';
      result = result.filter((s) => s.active === isActive);
    }

    const search = this.searchTerm().toLowerCase();
    if (search) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.description?.toLowerCase().includes(search) ||
          s.id.toLowerCase().includes(search)
      );
    }

    return result;
  });

  skillsByCategory = computed(() => {
    const grouped: Record<string, Skill[]> = {};
    for (const skill of this.filteredSkills()) {
      if (!grouped[skill.category]) {
        grouped[skill.category] = [];
      }
      grouped[skill.category].push(skill);
    }
    return Object.entries(grouped).map(([category, skills]) => ({
      category: category as SkillCategory,
      skills,
    }));
  });

  activeSkillCount = computed(() => this.skills().filter((s) => s.active).length);
  totalSkillCount = computed(() => this.skills().length);

  ngOnInit(): void {
    this.loadSkills();
    this.loadCategories();
  }

  loadSkills(): void {
    this.isLoading.set(true);
    this.skillService.getAllSkills().subscribe({
      next: (skills) => {
        this.skills.set(skills);
        this.isLoading.set(false);
      },
      error: () => {
        this.showError('Failed to load skills');
        this.isLoading.set(false);
      },
    });
  }

  loadCategories(): void {
    this.skillService.getCategories().subscribe({
      next: (categories) => this.categories.set(categories),
    });
  }

  // ====== Editor ======

  openNewEditor(): void {
    this.editingSkill.set(null);
    this.formData.set({
      name: '',
      description: '',
      category: 'process',
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  openEditEditor(skill: Skill): void {
    this.editingSkill.set(skill);
    this.formData.set({
      name: skill.name,
      description: skill.description || '',
      category: skill.category,
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingSkill.set(null);
  }

  saveSkill(): void {
    const data = this.formData();

    if (!data.name.trim()) {
      this.showError('Skill name is required');
      return;
    }

    const editing = this.editingSkill();
    if (editing) {
      this.skillService.updateSkill(editing.id, {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        category: data.category,
      }).subscribe({
        next: (updated) => {
          this.skills.update((skills) =>
            skills.map((s) => (s.id === updated.id ? updated : s))
          );
          this.closeEditor();
          this.showSuccess(`Skill "${updated.name}" updated`);
        },
        error: () => this.showError('Failed to update skill'),
      });
    } else {
      this.skillService.createSkill({
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        category: data.category,
      }).subscribe({
        next: (created) => {
          this.skills.update((skills) => [...skills, created]);
          this.closeEditor();
          this.showSuccess(`Skill "${created.name}" created`);
        },
        error: () => this.showError('Failed to create skill'),
      });
    }
  }

  // ====== Actions ======

  toggleSkillActive(skill: Skill): void {
    this.skillService.toggleSkill(skill.id).subscribe({
      next: (updated) => {
        this.skills.update((skills) =>
          skills.map((s) => (s.id === updated.id ? updated : s))
        );
        this.showSuccess(
          `Skill "${updated.name}" ${updated.active ? 'activated' : 'deactivated'}`
        );
      },
      error: () => this.showError('Failed to toggle skill'),
    });
  }

  deleteSkill(skill: Skill): void {
    if (!confirm(`Are you sure you want to delete "${skill.name}"? This will also remove it from all agent assignments.`)) {
      return;
    }

    this.skillService.deleteSkill(skill.id).subscribe({
      next: () => {
        this.skills.update((skills) => skills.filter((s) => s.id !== skill.id));
        this.showSuccess(`Skill "${skill.name}" deleted`);
      },
      error: () => this.showError('Failed to delete skill'),
    });
  }

  // ====== Form helpers ======

  updateFormField(field: 'name' | 'description' | 'category', value: string): void {
    const current = this.formData();
    this.formData.set({ ...current, [field]: value });
  }

  // ====== Helpers ======

  getCategoryName(category: SkillCategory): string {
    const cat = this.categories().find((c) => c.id === category);
    return cat?.name || category;
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  clearFilters(): void {
    this.filterCategory.set('');
    this.filterActive.set('');
    this.searchTerm.set('');
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
