const { dateTimeService } = require('../services');

// Inline types to avoid dependency issues
interface BaseTaskPayload {
  [key: string]: any;
}

interface TaskResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

interface JobInfo {
  id: string;
  task_identifier: string;
  payload: any;
  created_at: Date;
  run_at: Date;
  attempts: number;
  max_attempts: number;
}

interface TaskLogger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

interface TaskHelpers {
  job: JobInfo;
  logger: TaskLogger;
  addJob: (taskName: string, payload?: any, options?: any) => Promise<void>;
}

type TaskFunction<TPayload extends BaseTaskPayload = BaseTaskPayload, TResult = any> = (
  payload: TPayload,
  helpers: TaskHelpers
) => Promise<TResult>;

function assertPayload<T extends BaseTaskPayload>(
  payload: unknown,
  validator: (p: any) => p is T
): asserts payload is T {
  if (!validator(payload)) {
    throw new Error('Invalid payload structure');
  }
}

// Define payload interface for this specific task
interface HelloTaskPayload extends BaseTaskPayload {
  message?: string;
  userId?: string;
  timestamp?: number;
}

// Payload validator function
function isHelloTaskPayload(payload: any): payload is HelloTaskPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload.message === undefined || typeof payload.message === 'string') &&
    (payload.userId === undefined || typeof payload.userId === 'string') &&
    (payload.timestamp === undefined || typeof payload.timestamp === 'number')
  );
}

// Type-safe task implementation
const helloTask: TaskFunction<HelloTaskPayload, TaskResult> = async (payload, helpers) => {
  const { job, logger, addJob } = helpers;

  try {
    // Validate payload structure
    assertPayload(payload, isHelloTaskPayload);

    const startTime = dateTimeService.getCurrentTimestamp();
    logger.info(`Hello task started for job ${job.id} at ${dateTimeService.getCurrentTime()}`, {
      jobId: job.id,
      payload,
      attempts: job.attempts,
      startTime: dateTimeService.formatDate(startTime)
    });

    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));

    // Example of conditional logic based on payload
    if (payload.message) {
      logger.info(`Processing message: "${payload.message}"`);
    }

    if (payload.userId) {
      logger.info(`Processing for user: ${payload.userId}`);
    }

    // Example of adding a follow-up job using dateTime service for time comparison
    if (payload.timestamp) {
      if (dateTimeService.isOlderThan(payload.timestamp, 1)) {
        const timeDiff = dateTimeService.diff(dateTimeService.getCurrentTimestamp(), payload.timestamp, 'minutes');
        await addJob('cleanup', { relatedJobId: job.id });
        logger.info(`Scheduled cleanup job for old task (${timeDiff} minutes old)`);
      }
    }

    logger.info(`Hello task completed successfully for job ${job.id}`);

    const completedAt = dateTimeService.getCurrentTimestamp();
    const duration = dateTimeService.getDuration(startTime, completedAt);
    
    return {
      success: true,
      message: 'Hello task completed successfully',
      data: {
        processedMessage: payload.message || 'No message provided',
        processedAt: dateTimeService.formatDate(completedAt),
        startTime: dateTimeService.formatDate(startTime),
        duration: `${duration.asMilliseconds()}ms`,
        jobId: job.id
      }
    };

  } catch (error) {
    logger.error(`Hello task failed for job ${job.id}:`, error);
    
    return {
      success: false,
      message: 'Hello task failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Export using CommonJS for compatibility with graphile-worker
export = helloTask;