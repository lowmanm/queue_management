import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RbacService } from '../services/rbac.service';
import {
  User,
  Team,
  Role,
  UserRole,
  Permission,
  CreateUserRequest,
  UpdateUserRequest,
  ALL_PERMISSIONS,
} from '@nexus-queue/shared-models';

/**
 * Controller for RBAC (Role-Based Access Control) operations.
 * Manages users, roles, permissions, and teams.
 */
@Controller('rbac')
export class RbacController {
  private readonly logger = new Logger(RbacController.name);

  constructor(private readonly rbacService: RbacService) {}

  // ===== User Endpoints =====

  /**
   * Get all users
   */
  @Get('users')
  getAllUsers(
    @Query('role') role?: UserRole,
    @Query('teamId') teamId?: string,
    @Query('active') active?: string
  ): User[] {
    let users = this.rbacService.getAllUsers();

    if (role) {
      users = users.filter((u) => u.role === role);
    }

    if (teamId) {
      users = users.filter((u) => u.teamId === teamId);
    }

    if (active !== undefined) {
      const isActive = active === 'true';
      users = users.filter((u) => u.active === isActive);
    }

    return users;
  }

  /**
   * Get user by ID
   */
  @Get('users/:id')
  getUserById(@Param('id') id: string): User {
    const user = this.rbacService.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user;
  }

  /**
   * Get current user's effective permissions
   */
  @Get('users/:id/permissions')
  getUserPermissions(@Param('id') id: string): Permission[] {
    const user = this.rbacService.getUserById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return this.rbacService.getEffectivePermissions(id);
  }

  /**
   * Create a new user
   */
  @Post('users')
  createUser(@Body() request: CreateUserRequest): User {
    try {
      return this.rbacService.createUser(request);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create user',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Update an existing user
   */
  @Put('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() request: UpdateUserRequest
  ): User {
    try {
      return this.rbacService.updateUser(id, request);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to update user',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Deactivate a user
   */
  @Delete('users/:id')
  deactivateUser(@Param('id') id: string): User {
    try {
      return this.rbacService.deactivateUser(id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to deactivate user',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Activate a user
   */
  @Post('users/:id/activate')
  activateUser(@Param('id') id: string): User {
    try {
      return this.rbacService.activateUser(id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to activate user',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ===== Role Endpoints =====

  /**
   * Get all roles
   */
  @Get('roles')
  getAllRoles(): Role[] {
    return this.rbacService.getAllRoles();
  }

  /**
   * Get role by ID
   */
  @Get('roles/:id')
  getRoleById(@Param('id') id: UserRole): Role {
    const role = this.rbacService.getRoleById(id);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    return role;
  }

  /**
   * Get permissions for a role
   */
  @Get('roles/:id/permissions')
  getRolePermissions(@Param('id') id: UserRole): Permission[] {
    const role = this.rbacService.getRoleById(id);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }
    return this.rbacService.getRolePermissions(id);
  }

  // ===== Permission Endpoints =====

  /**
   * Get all available permissions
   */
  @Get('permissions')
  getAllPermissions() {
    return ALL_PERMISSIONS;
  }

  /**
   * Check if user has specific permission
   */
  @Get('permissions/check')
  checkPermission(
    @Query('userId') userId: string,
    @Query('permission') permission: Permission
  ): { hasPermission: boolean } {
    if (!userId || !permission) {
      throw new HttpException(
        'userId and permission are required',
        HttpStatus.BAD_REQUEST
      );
    }

    const hasPermission = this.rbacService.userHasPermission(userId, permission);
    return { hasPermission };
  }

  // ===== Team Endpoints =====

  /**
   * Get all teams
   */
  @Get('teams')
  getAllTeams(): Team[] {
    return this.rbacService.getAllTeams();
  }

  /**
   * Get team by ID
   */
  @Get('teams/:id')
  getTeamById(@Param('id') id: string): Team {
    const team = this.rbacService.getTeamById(id);
    if (!team) {
      throw new HttpException('Team not found', HttpStatus.NOT_FOUND);
    }
    return team;
  }

  /**
   * Get team members
   */
  @Get('teams/:id/members')
  getTeamMembers(@Param('id') id: string): User[] {
    const team = this.rbacService.getTeamById(id);
    if (!team) {
      throw new HttpException('Team not found', HttpStatus.NOT_FOUND);
    }
    return this.rbacService.getUsersByTeam(id);
  }

  /**
   * Get team statistics
   */
  @Get('teams/:id/stats')
  getTeamStats(@Param('id') id: string) {
    const team = this.rbacService.getTeamById(id);
    if (!team) {
      throw new HttpException('Team not found', HttpStatus.NOT_FOUND);
    }
    return this.rbacService.getTeamStats(id);
  }

  /**
   * Create a new team
   */
  @Post('teams')
  createTeam(
    @Body()
    request: {
      name: string;
      description?: string;
      managerId?: string;
      queueIds?: string[];
    }
  ): Team {
    return this.rbacService.createTeam(
      request.name,
      request.description,
      request.managerId,
      request.queueIds
    );
  }

  /**
   * Update a team
   */
  @Put('teams/:id')
  updateTeam(
    @Param('id') id: string,
    @Body()
    request: Partial<Omit<Team, 'id' | 'createdAt' | 'updatedAt'>>
  ): Team {
    try {
      return this.rbacService.updateTeam(id, request);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to update team',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ===== Session Endpoints =====

  /**
   * Get all active sessions
   */
  @Get('sessions')
  getActiveSessions() {
    return this.rbacService.getActiveSessions();
  }

  /**
   * Get online agents
   */
  @Get('agents/online')
  getOnlineAgents(): User[] {
    return this.rbacService.getOnlineAgents();
  }

  // ===== Statistics Endpoints =====

  /**
   * Get user counts by role
   */
  @Get('stats/users')
  getUserStats() {
    return this.rbacService.getUserCountsByRole();
  }

  /**
   * Get full RBAC configuration for admin UI
   */
  @Get('config')
  getConfig() {
    return {
      users: this.rbacService.getAllUsers(),
      roles: this.rbacService.getAllRoles(),
      teams: this.rbacService.getAllTeams(),
      permissions: ALL_PERMISSIONS,
      sessions: this.rbacService.getActiveSessions(),
    };
  }
}
