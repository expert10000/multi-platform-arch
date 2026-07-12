export class InMemoryWorkerQueue {
  #jobs = [];

  async enqueue(job) {
    this.#jobs.push(job);
    return job;
  }

  async drain() {
    const jobs = [...this.#jobs];
    this.#jobs = [];
    return jobs;
  }

  async pending() {
    return [...this.#jobs];
  }
}
