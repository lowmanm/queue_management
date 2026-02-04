import { Controller, Get, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from '@nexus-queue/shared-models';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /tasks/next
   * Returns the next available task from the queue.
   *
   * @param agentId - Optional agent ID requesting the task
   */
  @Get('next')
  getNextTask(@Query('agentId') agentId?: string): Task {
    return this.tasksService.getNextTask(agentId);
  }
}
