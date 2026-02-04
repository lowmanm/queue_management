import { Injectable } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';

@Injectable()
export class TasksService {
  /**
   * Returns the next available task.
   * Currently returns hardcoded data for the MVP phase.
   */
  getNextTask(): Task {
    return {
      id: '123',
      title: 'Test Order #55',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 1,
      status: 'ASSIGNED',
    };
  }
}
