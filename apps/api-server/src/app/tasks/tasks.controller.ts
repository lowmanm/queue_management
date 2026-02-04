import { Controller, Get } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from '@nexus-queue/shared-models';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /tasks/next
   * Returns the next available task from the queue.
   */
  @Get('next')
  getNextTask(): Task {
    return this.tasksService.getNextTask();
  }
}
