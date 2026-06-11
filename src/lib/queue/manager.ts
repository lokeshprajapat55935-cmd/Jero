import logger from '@/lib/logger';

export interface Job {
  id: string;
  name: string;
  payload: any;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

export type JobHandler = (payload: any) => Promise<void>;

/**
 * Standard in-process job queue manager.
 * Ready to be connected to BullMQ / PG-Boss in production scale.
 */
class LocalJobQueueManager {
  private handlers = new Map<string, JobHandler>();

  registerHandler(jobName: string, handler: JobHandler) {
    this.handlers.set(jobName, handler);
  }

  async enqueue(jobName: string, payload: any): Promise<Job> {
    const job: Job = {
      id: Math.random().toString(36).substring(7),
      name: jobName,
      payload,
      status: 'pending',
    };

    // Execute asynchronously (in-process fallback)
    setTimeout(async () => {
      const handler = this.handlers.get(jobName);
      if (!handler) {
        logger.error(`No handler registered for job: ${jobName}`);
        job.status = 'failed';
        job.error = 'No handler found';
        return;
      }

      try {
        await handler(payload);
        job.status = 'completed';
      } catch (err: any) {
        logger.error(`Job ${jobName} execution failed:`, err);
        job.status = 'failed';
        job.error = err?.message || 'Job failure';
      }
    }, 0);

    return job;
  }
}

// Global queue manager singleton instance
let manager: LocalJobQueueManager;

export function getQueueManager() {
  if (!manager) {
    manager = new LocalJobQueueManager();
  }
  return manager;
}
