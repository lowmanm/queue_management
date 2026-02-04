/**
 * Represents a task in the queue management system.
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;

  /** Human-readable title of the task */
  title: string;

  /** URL to load in the iframe for task execution */
  payloadUrl: string;

  /** Priority level (lower number = higher priority) */
  priority: number;

  /** Current status of the task */
  status: TaskStatus;
}

/** Possible status values for a task */
export type TaskStatus = 'PENDING' | 'ASSIGNED' | 'COMPLETED';
