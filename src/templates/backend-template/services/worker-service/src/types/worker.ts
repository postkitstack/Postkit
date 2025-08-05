/**
 * Graphile Worker TypeScript Type Definitions
 * Use these interfaces for type-safe task development
 */

// Base task payload interface - extend this for specific tasks
export interface BaseTaskPayload {
  [key: string]: any;
}

// Job information provided by graphile-worker
export interface JobInfo {
  id: string;
  task_identifier: string;
  payload: any;
  created_at: Date;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  last_error?: string;
}

// Logger interface provided by graphile-worker
export interface TaskLogger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

// Task helpers provided by graphile-worker
export interface TaskHelpers {
  job: JobInfo;
  logger: TaskLogger;
  query: (sql: string, values?: any[]) => Promise<any>;
  addJob: (taskName: string, payload?: any, options?: any) => Promise<void>;
  withPgClient: (callback: (client: any) => Promise<any>) => Promise<any>;
}

// Generic task function type
export type TaskFunction<TPayload extends BaseTaskPayload = BaseTaskPayload, TResult = any> = (
  payload: TPayload,
  helpers: TaskHelpers
) => Promise<TResult>;

// Type assertion utility for payload validation
export function assertPayload<T extends BaseTaskPayload>(
  payload: unknown,
  validator: (p: any) => p is T
): asserts payload is T {
  if (!validator(payload)) {
    throw new Error('Invalid payload structure');
  }
}

// Common task result interface
export interface TaskResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// Declare global namespace for task type registration
declare global {
  namespace GraphileWorker {
    interface Tasks {
      // Add your task types here, e.g.:
      // hello: { message?: string };
      // sendEmail: { to: string; subject: string; body: string };
    }
  }
}