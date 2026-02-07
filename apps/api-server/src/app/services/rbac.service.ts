import { Injectable, Logger } from '@nestjs/common';
import {
  User,
  Team,
  UserRole,
  Permission,
  Role,
  CreateUserRequest,
  UpdateUserRequest,
  UserSession,
  DEFAULT_ROLES,
  getPermissionsForRole,
  getUserPermissions,
} from '@nexus-queue/shared-models';

/**
 * Service for managing Role-Based Access Control.
 * Handles users, roles, permissions, and sessions.
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  // In-memory storage (would be database in production)
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private roles: Role[] = [...DEFAULT_ROLES];

  constructor() {
    this.initializeDefaultData();
  }

  /**
   * Initialize with default users and teams
   */
  private initializeDefaultData(): void {
    const now = new Date().toISOString();

    // Create default teams
    const defaultTeams: Team[] = [
      {
        id: 'team-orders',
        name: 'Orders Team',
        description: 'Handles order processing and fulfillment',
        queueIds: ['queue-orders'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'team-returns',
        name: 'Returns Team',
        description: 'Handles return requests and refunds',
        queueIds: ['queue-returns'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'team-claims',
        name: 'Claims Team',
        description: 'Handles claims and disputes',
        queueIds: ['queue-claims'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaultTeams.forEach((team) => this.teams.set(team.id, team));

    // Create default users
    const defaultUsers: User[] = [
      {
        id: 'user-admin',
        username: 'admin',
        displayName: 'System Administrator',
        email: 'admin@nexusqueue.com',
        role: 'ADMIN',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-designer',
        username: 'designer',
        displayName: 'Queue Designer',
        email: 'designer@nexusqueue.com',
        role: 'DESIGNER',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-manager',
        username: 'manager',
        displayName: 'Team Manager',
        email: 'manager@nexusqueue.com',
        role: 'MANAGER',
        teamId: 'team-orders',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent1',
        username: 'agent1',
        displayName: 'Agent One',
        email: 'agent1@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-orders',
        skills: ['orders', 'general'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent2',
        username: 'agent2',
        displayName: 'Agent Two',
        email: 'agent2@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-returns',
        skills: ['returns', 'refunds'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent3',
        username: 'agent3',
        displayName: 'Agent Three',
        email: 'agent3@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-claims',
        skills: ['claims', 'disputes'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaultUsers.forEach((user) => this.users.set(user.id, user));
    this.logger.log(`Initialized ${defaultUsers.length} users and ${defaultTeams.length} teams`);
  }

  // ===== User Management =====

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }

  /**
   * Get users by role
   */
  getUsersByRole(role: UserRole): User[] {
    return this.getAllUsers().filter((u) => u.role === role);
  }

  /**
   * Get users by team
   */
  getUsersByTeam(teamId: string): User[] {
    return this.getAllUsers().filter((u) => u.teamId === teamId);
  }

  /**
   * Get user by ID
   */
  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Get user by username
   */
  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  /**
   * Create a new user
   */
  createUser(request: CreateUserRequest): User {
    // Check for duplicate username
    if (this.getUserByUsername(request.username)) {
      throw new Error(`Username '${request.username}' already exists`);
    }

    const now = new Date().toISOString();
    const user: User = {
      id: `user-${Date.now()}`,
      username: request.username,
      displayName: request.displayName,
      email: request.email,
      role: request.role,
      teamId: request.teamId,
      skills: request.skills || [],
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    this.logger.log(`Created user: ${user.username} (${user.role})`);
    return user;
  }

  /**
   * Update an existing user
   */
  updateUser(id: string, request: UpdateUserRequest): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }

    const updatedUser: User = {
      ...user,
      ...request,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(id, updatedUser);
    this.logger.log(`Updated user: ${updatedUser.username}`);
    return updatedUser;
  }

  /**
   * Deactivate a user (soft delete)
   */
  deactivateUser(id: string): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }

    const updatedUser: User = {
      ...user,
      active: false,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(id, updatedUser);
    this.logger.log(`Deactivated user: ${updatedUser.username}`);
    return updatedUser;
  }

  /**
   * Activate a user
   */
  activateUser(id: string): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }

    const updatedUser: User = {
      ...user,
      active: true,
      updatedAt: new Date().toISOString(),
    };

    this.users.set(id, updatedUser);
    this.logger.log(`Activated user: ${updatedUser.username}`);
    return updatedUser;
  }

  // ===== Permission Management =====

  /**
   * Get all available roles
   */
  getAllRoles(): Role[] {
    return this.roles;
  }

  /**
   * Get role by ID
   */
  getRoleById(id: UserRole): Role | undefined {
    return this.roles.find((r) => r.id === id);
  }

  /**
   * Get permissions for a role
   */
  getRolePermissions(role: UserRole): Permission[] {
    return getPermissionsForRole(role);
  }

  /**
   * Get effective permissions for a user (role + additional - denied)
   */
  getEffectivePermissions(userId: string): Permission[] {
    const user = this.users.get(userId);
    if (!user) {
      return [];
    }
    return getUserPermissions(user);
  }

  /**
   * Check if user has a specific permission
   */
  userHasPermission(userId: string, permission: Permission): boolean {
    const permissions = this.getEffectivePermissions(userId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  userHasAnyPermission(userId: string, permissions: Permission[]): boolean {
    const userPerms = this.getEffectivePermissions(userId);
    return permissions.some((p) => userPerms.includes(p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  userHasAllPermissions(userId: string, permissions: Permission[]): boolean {
    const userPerms = this.getEffectivePermissions(userId);
    return permissions.every((p) => userPerms.includes(p));
  }

  // ===== Team Management =====

  /**
   * Get all teams
   */
  getAllTeams(): Team[] {
    return Array.from(this.teams.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  /**
   * Get team by ID
   */
  getTeamById(id: string): Team | undefined {
    return this.teams.get(id);
  }

  /**
   * Create a team
   */
  createTeam(
    name: string,
    description?: string,
    managerId?: string,
    queueIds: string[] = []
  ): Team {
    const now = new Date().toISOString();
    const team: Team = {
      id: `team-${Date.now()}`,
      name,
      description,
      managerId,
      queueIds,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.teams.set(team.id, team);
    this.logger.log(`Created team: ${team.name}`);
    return team;
  }

  /**
   * Update a team
   */
  updateTeam(
    id: string,
    updates: Partial<Omit<Team, 'id' | 'createdAt' | 'updatedAt'>>
  ): Team {
    const team = this.teams.get(id);
    if (!team) {
      throw new Error(`Team not found: ${id}`);
    }

    const updatedTeam: Team = {
      ...team,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.teams.set(id, updatedTeam);
    this.logger.log(`Updated team: ${updatedTeam.name}`);
    return updatedTeam;
  }

  // ===== Session Management =====

  /**
   * Create or update a user session
   */
  upsertSession(userId: string, agentState: string): UserSession {
    const existing = this.getSessionByUserId(userId);
    const now = new Date().toISOString();

    if (existing) {
      const updated: UserSession = {
        ...existing,
        agentState,
        lastActivityAt: now,
      };
      this.sessions.set(existing.id, updated);
      return updated;
    }

    const session: UserSession = {
      id: `session-${Date.now()}`,
      userId,
      agentState,
      loginAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(session.id, session);
    this.logger.log(`Created session for user: ${userId}`);
    return session;
  }

  /**
   * Get session by user ID
   */
  getSessionByUserId(userId: string): UserSession | undefined {
    return Array.from(this.sessions.values()).find((s) => s.userId === userId);
  }

  /**
   * End a user session
   */
  endSession(userId: string): void {
    const session = this.getSessionByUserId(userId);
    if (session) {
      this.sessions.delete(session.id);
      this.logger.log(`Ended session for user: ${userId}`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): UserSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get online agents (users with active sessions)
   */
  getOnlineAgents(): User[] {
    const sessionUserIds = new Set(
      Array.from(this.sessions.values()).map((s) => s.userId)
    );
    return this.getAllUsers()
      .filter((u) => u.role === 'AGENT' && sessionUserIds.has(u.id));
  }

  // ===== Statistics =====

  /**
   * Get user counts by role
   */
  getUserCountsByRole(): Record<UserRole, number> {
    const counts: Record<UserRole, number> = {
      AGENT: 0,
      MANAGER: 0,
      DESIGNER: 0,
      ADMIN: 0,
    };

    this.users.forEach((user) => {
      if (user.active) {
        counts[user.role]++;
      }
    });

    return counts;
  }

  /**
   * Get team statistics
   */
  getTeamStats(teamId: string): {
    totalAgents: number;
    onlineAgents: number;
    managerId?: string;
  } {
    const teamUsers = this.getUsersByTeam(teamId);
    const onlineSessions = this.getActiveSessions();
    const onlineUserIds = new Set(onlineSessions.map((s) => s.userId));

    const team = this.getTeamById(teamId);

    return {
      totalAgents: teamUsers.filter((u) => u.role === 'AGENT').length,
      onlineAgents: teamUsers.filter(
        (u) => u.role === 'AGENT' && onlineUserIds.has(u.id)
      ).length,
      managerId: team?.managerId,
    };
  }
}
