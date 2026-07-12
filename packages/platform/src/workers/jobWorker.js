export class JobWorker {
  #timer = null;
  #running = false;

  constructor({ jobs, handlers = {}, pollIntervalMs = 1000 }) {
    this.jobs = jobs;
    this.handlers = {
      "extract-text": async () => {},
      thumbnail: async () => {},
      summarize: async () => {},
      "index-search": async () => {},
      ...handlers
    };
    this.pollIntervalMs = pollIntervalMs;
  }

  start() {
    if (this.#timer) {
      return;
    }

    this.runNext().catch(() => {});
    this.#timer = setInterval(() => {
      this.runNext().catch(() => {});
    }, this.pollIntervalMs);
    this.#timer.unref?.();
  }

  stop() {
    if (!this.#timer) {
      return;
    }

    clearInterval(this.#timer);
    this.#timer = null;
  }

  async runNext() {
    if (this.#running) {
      return null;
    }

    this.#running = true;
    try {
      const [job] = await this.jobs.listByStatus("queued");
      if (!job) {
        return null;
      }

      await this.jobs.updateStatus(job.id, "running");
      try {
        await this.handlers[job.type](job);
        await this.jobs.updateStatus(job.id, "completed");
      } catch (error) {
        await this.jobs.updateStatus(job.id, "failed");
      }

      return this.jobs.getById(job.id);
    } finally {
      this.#running = false;
    }
  }
}
