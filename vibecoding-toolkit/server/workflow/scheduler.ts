export interface Scheduler {
  schedule(executionId: string, options: ScheduleOptions): Promise<void>;

  scheduleAfter(
    executionId: string,
    delayMs: number,
    options: ScheduleOptions,
  ): Promise<void>;

  scheduleAt(
    executionId: string,
    wakeAtEpochMs: number,
    options: ScheduleOptions,
  ): Promise<void>;
}

export interface ScheduleOptions {
  authorization: string;
  runtimeContext?: unknown;
  retryCount?: number;
}
