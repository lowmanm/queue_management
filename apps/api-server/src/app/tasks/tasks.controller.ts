import { Controller, Get, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from '@nexus-queue/shared-models';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /tasks/next
   * Returns the next available task from the queue.
   * Returns null with a message when no tasks are available.
   *
   * @param agentId - Optional agent ID requesting the task
   */
  @Get('next')
  getNextTask(
    @Query('agentId') agentId?: string
  ): Task | { message: string } {
    const task = this.tasksService.getNextTask(agentId);
    if (task) {
      return task;
    }
    return {
      message:
        'No tasks available. Upload and execute a CSV file via the admin panel to populate the queue.',
    };
  }
}
