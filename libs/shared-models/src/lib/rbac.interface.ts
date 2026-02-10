/**
 * Role-Based Access Control (RBAC) Interfaces
 *
 * Defines the permission and role structure for the queue management system.
 * Roles: Agent, Manager, Designer, Admin
 */

/**
 * System roles with hierarchical permissions
 */
export type UserRole = 'AGENT' | 'MANAGER' | 'DESIGNER' | 'ADMIN';

/**
 * Permission categories organized by feature area
 */
export type PermissionCategory =
  | 'TASKS'        // Task-related permissions
  | 'QUEUES'       // Queue management
  | 'AGENTS'       // Agent management
  | 'STATISTICS'   // Stats and reporting
  | 'DESIGN'       // Designer features
  | 'ADMIN';       // Administrative functions

/**
 * Individual permission identifiers
 */
export type Permission =
  // Task permissions
  | 'tasks:work'              // Work assigned tasks
  | 'tasks:view_own'          // View own task history
  | 'tasks:view_all'          // View all tasks in system
  | 'tasks:reassign'          // Reassign tasks to other agents
  | 'tasks:priority_override' // Override task priority

  // Queue permissions
  | 'queues:view'             // View queue information
  | 'queues:manage'           // Create/edit/delete queues
  | 'queues:jump'             // Jump into queue to work tasks

  // Agent permissions
  | 'agents:view_own'         // View own profile/stats
  | 'agents:view_team'        // View team members' stats
  | 'agents:view_all'         // View all agents
  | 'agents:manage'           // Create/edit/delete agents
  | 'agents:force_state'      // Force agent state changes

  // Statistics permissions
  | 'stats:own'               // View own statistics
  | 'stats:team'              // View team statistics
  | 'stats:queue'             // View queue statistics
  | 'stats:system'            // View system-wide statistics
  | 'stats:export'            // Export statistics data

  // Design permissions
  | 'design:dispositions'     // Manage dispositions
  | 'design:workflows'        // Manage workflows
  | 'design:rules'            // Manage routing rules
  | 'design:pipelines'        // Manage pipelines
  | 'design:volume_loaders'   // Manage data sources / volume loaders

  // Admin permissions
  | 'admin:users'             // Manage users and roles
  | 'admin:settings'          // Manage system settings
  | 'admin:audit'             // View audit logs
  | 'admin:health'            // View system health
  | 'admin:integrations';     // Manage integrations

/**
 * Permission definition with metadata
 */
export interface PermissionDefinition {
  /** Permission identifier */
  id: Permission;

  /** Display name */
  name: string;

  /** Description of what this permission allows */
  description: string;

  /** Category for grouping */
  category: PermissionCategory;
}

/**
 * Role definition with assigned permissions
 */
export interface Role {
  /** Role identifier */
  id: UserRole;

  /** Display name */
  name: string;

  /** Description of the role */
  description: string;

  /** Permissions assigned to this role */
  permissions: Permission[];

  /** Whether this is a system role (cannot be deleted) */
  isSystem: boolean;

  /** Display order */
  order: number;

  /** Color for UI display */
  color?: string;
}

/**
 * User profile with role and permissions
 */
export interface User {
  /** Unique identifier */
  id: string;

  /** Username for login */
  username: string;

  /** Display name */
  displayName: string;

  /** Email address */
  email?: string;

  /** Assigned role */
  role: UserRole;

  /** Additional permissions beyond role (optional) */
  additionalPermissions?: Permission[];

  /** Permissions explicitly denied (optional) */
  deniedPermissions?: Permission[];

  /** Team/group assignment */
  teamId?: string;

  /** Skills for routing */
  skills?: string[];

  /** Whether user is active */
  active: boolean;

  /** Last login timestamp */
  lastLoginAt?: string;

  /** Account creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Team/group definition
 */
export interface Team {
  /** Unique identifier */
  id: string;

  /** Team name */
  name: string;

  /** Description */
  description?: string;

  /** Manager user ID */
  managerId?: string;

  /** Queue IDs this team works */
  queueIds: string[];

  /** Whether team is active */
  active: boolean;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create a new user
 */
export interface CreateUserRequest {
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  teamId?: string;
  skills?: string[];
  password?: string;
}

/**
 * Request to update a user
 */
export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  role?: UserRole;
  teamId?: string;
  skills?: string[];
  active?: boolean;
  additionalPermissions?: Permission[];
  deniedPermissions?: Permission[];
}

/**
 * Authentication response
 */
export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
  permissions: Permission[];
}

/**
 * Session information
 */
export interface UserSession {
  /** Session ID */
  id: string;

  /** User ID */
  userId: string;

  /** Current agent state */
  agentState: string;

  /** Login timestamp */
  loginAt: string;

  /** Last activity timestamp */
  lastActivityAt: string;

  /** Session metadata */
  metadata?: Record<string, string>;
}

/**
 * Default role configurations with permissions
 */
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'AGENT',
    name: 'Agent',
    description: 'Frontline worker who handles tasks from queues',
    isSystem: true,
    order: 1,
    color: '#4caf50',
    permissions: [
      'tasks:work',
      'tasks:view_own',
      'agents:view_own',
      'stats:own',
    ],
  },
  {
    id: 'MANAGER',
    name: 'Manager',
    description: 'Team supervisor with visibility into team performance',
    isSystem: true,
    order: 2,
    color: '#2196f3',
    permissions: [
      'tasks:work',
      'tasks:view_own',
      'tasks:view_all',
      'tasks:reassign',
      'queues:view',
      'queues:jump',
      'agents:view_own',
      'agents:view_team',
      'agents:force_state',
      'stats:own',
      'stats:team',
      'stats:queue',
    ],
  },
  {
    id: 'DESIGNER',
    name: 'Designer',
    description: 'Configures system workflows, rules, and dispositions',
    isSystem: true,
    order: 3,
    color: '#9c27b0',
    permissions: [
      'tasks:view_all',
      'queues:view',
      'queues:manage',
      'agents:view_all',
      'stats:queue',
      'stats:system',
      'design:dispositions',
      'design:workflows',
      'design:rules',
      'design:pipelines',
      'design:volume_loaders',
    ],
  },
  {
    id: 'ADMIN',
    name: 'Administrator',
    description: 'Full system access for administration and monitoring',
    isSystem: true,
    order: 4,
    color: '#f44336',
    permissions: [
      // All permissions
      'tasks:work',
      'tasks:view_own',
      'tasks:view_all',
      'tasks:reassign',
      'tasks:priority_override',
      'queues:view',
      'queues:manage',
      'queues:jump',
      'agents:view_own',
      'agents:view_team',
      'agents:view_all',
      'agents:manage',
      'agents:force_state',
      'stats:own',
      'stats:team',
      'stats:queue',
      'stats:system',
      'stats:export',
      'design:dispositions',
      'design:workflows',
      'design:rules',
      'design:pipelines',
      'design:volume_loaders',
      'admin:users',
      'admin:settings',
      'admin:audit',
      'admin:health',
      'admin:integrations',
    ],
  },
];

/**
 * All available permissions with metadata
 */
export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Task permissions
  {
    id: 'tasks:work',
    name: 'Work Tasks',
    description: 'Accept and complete assigned tasks',
    category: 'TASKS',
  },
  {
    id: 'tasks:view_own',
    name: 'View Own Tasks',
    description: 'View own task history and current assignments',
    category: 'TASKS',
  },
  {
    id: 'tasks:view_all',
    name: 'View All Tasks',
    description: 'View all tasks in the system',
    category: 'TASKS',
  },
  {
    id: 'tasks:reassign',
    name: 'Reassign Tasks',
    description: 'Reassign tasks to other agents',
    category: 'TASKS',
  },
  {
    id: 'tasks:priority_override',
    name: 'Override Priority',
    description: 'Override task priority settings',
    category: 'TASKS',
  },

  // Queue permissions
  {
    id: 'queues:view',
    name: 'View Queues',
    description: 'View queue information and statistics',
    category: 'QUEUES',
  },
  {
    id: 'queues:manage',
    name: 'Manage Queues',
    description: 'Create, edit, and delete queues',
    category: 'QUEUES',
  },
  {
    id: 'queues:jump',
    name: 'Queue Jump',
    description: 'Jump into a queue to work tasks directly',
    category: 'QUEUES',
  },

  // Agent permissions
  {
    id: 'agents:view_own',
    name: 'View Own Profile',
    description: 'View own agent profile and statistics',
    category: 'AGENTS',
  },
  {
    id: 'agents:view_team',
    name: 'View Team',
    description: 'View team members and their statistics',
    category: 'AGENTS',
  },
  {
    id: 'agents:view_all',
    name: 'View All Agents',
    description: 'View all agents in the system',
    category: 'AGENTS',
  },
  {
    id: 'agents:manage',
    name: 'Manage Agents',
    description: 'Create, edit, and deactivate agent accounts',
    category: 'AGENTS',
  },
  {
    id: 'agents:force_state',
    name: 'Force Agent State',
    description: 'Force change an agent\'s state (e.g., logout)',
    category: 'AGENTS',
  },

  // Statistics permissions
  {
    id: 'stats:own',
    name: 'Own Statistics',
    description: 'View personal performance statistics',
    category: 'STATISTICS',
  },
  {
    id: 'stats:team',
    name: 'Team Statistics',
    description: 'View team performance statistics',
    category: 'STATISTICS',
  },
  {
    id: 'stats:queue',
    name: 'Queue Statistics',
    description: 'View queue performance statistics',
    category: 'STATISTICS',
  },
  {
    id: 'stats:system',
    name: 'System Statistics',
    description: 'View system-wide statistics and metrics',
    category: 'STATISTICS',
  },
  {
    id: 'stats:export',
    name: 'Export Statistics',
    description: 'Export statistics data to files',
    category: 'STATISTICS',
  },

  // Design permissions
  {
    id: 'design:dispositions',
    name: 'Manage Dispositions',
    description: 'Create and configure disposition codes',
    category: 'DESIGN',
  },
  {
    id: 'design:workflows',
    name: 'Manage Workflows',
    description: 'Create and configure task workflows',
    category: 'DESIGN',
  },
  {
    id: 'design:rules',
    name: 'Manage Rules',
    description: 'Create and configure routing rules',
    category: 'DESIGN',
  },
  {
    id: 'design:pipelines',
    name: 'Manage Pipelines',
    description: 'Create and configure task pipelines',
    category: 'DESIGN',
  },
  {
    id: 'design:volume_loaders',
    name: 'Manage Data Sources',
    description: 'Configure volume loaders and data ingestion',
    category: 'DESIGN',
  },

  // Admin permissions
  {
    id: 'admin:users',
    name: 'Manage Users',
    description: 'Create, edit, and manage user accounts',
    category: 'ADMIN',
  },
  {
    id: 'admin:settings',
    name: 'System Settings',
    description: 'Manage system configuration settings',
    category: 'ADMIN',
  },
  {
    id: 'admin:audit',
    name: 'Audit Logs',
    description: 'View system audit logs',
    category: 'ADMIN',
  },
  {
    id: 'admin:health',
    name: 'System Health',
    description: 'View system health and monitoring data',
    category: 'ADMIN',
  },
  {
    id: 'admin:integrations',
    name: 'Integrations',
    description: 'Manage external system integrations',
    category: 'ADMIN',
  },
];

/**
 * Helper to get permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  const roleConfig = DEFAULT_ROLES.find((r) => r.id === role);
  return roleConfig?.permissions || [];
}

/**
 * Helper to check if a role has a specific permission
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Helper to get effective permissions for a user
 */
export function getUserPermissions(user: User): Permission[] {
  const rolePermissions = getPermissionsForRole(user.role);
  const additional = user.additionalPermissions || [];
  const denied = user.deniedPermissions || [];

  // Combine role + additional, then remove denied
  const combined = [...new Set([...rolePermissions, ...additional])];
  return combined.filter((p) => !denied.includes(p));
}
