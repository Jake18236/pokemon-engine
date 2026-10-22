import { Worker } from 'node:worker_threads';

/** A warm worker; cancellation discards the computation, never a committed battle state. */
export class EngineWorker {
  constructor() { this.nextId = 0; this.spawn(); }
  spawn() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url));
    this.worker.on('message', message => {
      if (this.pending?.id !== message.id) return;
      const pending = this.pending;
      this.pending = null;
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    });
    const worker = this.worker;
    worker.on('error', error => { if (this.worker === worker) { this.fail(error); this.failed = true; } });
    worker.on('exit', code => { if (this.worker === worker) { this.fail(new Error(`Engine worker exited (${code}). Retry the operation.`)); this.failed = true; } });
  }
  fail(error) {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
  }
  run(command) {
    if (this.pending) return Promise.reject(new Error('The engine is busy. Pause or wait for the current operation.'));
    if (this.failed) { this.failed = false; this.spawn(); }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.cancel('Worker time limit reached; lower the search budget.'); }, 180000);
      this.pending = { id, resolve, reject, timer };
      this.worker.postMessage({ id, command });
    });
  }
  async cancel(message = 'Analysis cancelled. The position is unchanged.') {
    this.fail(new Error(message));
    const previous = this.worker;
    this.worker = null;
    await previous?.terminate();
    this.spawn();
  }
  async close() { this.fail(new Error('Sandbox closed')); const worker = this.worker; this.worker = null; await worker?.terminate(); }
}
