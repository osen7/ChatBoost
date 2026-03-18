type Task = () => void;

export class Scheduler {
  private measureQueue: Task[] = [];
  private mutateQueue: Task[] = [];
  private idleQueue: Task[] = [];
  private measurePending = false;
  private mutatePending = false;
  private idlePending = false;

  scheduleMeasure(task: Task): void {
    this.measureQueue.push(task);
    if (this.measurePending) {
      return;
    }

    this.measurePending = true;
    requestAnimationFrame(() => {
      this.measurePending = false;
      const queue = this.measureQueue.splice(0, this.measureQueue.length);
      for (const t of queue) {
        t();
      }
    });
  }

  scheduleMutate(task: Task): void {
    this.mutateQueue.push(task);
    if (this.mutatePending) {
      return;
    }

    this.mutatePending = true;
    requestAnimationFrame(() => {
      this.mutatePending = false;
      const queue = this.mutateQueue.splice(0, this.mutateQueue.length);
      for (const t of queue) {
        t();
      }
    });
  }

  scheduleIdle(task: Task): void {
    this.idleQueue.push(task);
    if (this.idlePending) {
      return;
    }

    this.idlePending = true;
    const run = () => {
      this.idlePending = false;
      const queue = this.idleQueue.splice(0, this.idleQueue.length);
      for (const t of queue) {
        t();
      }
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1000 });
      return;
    }
    setTimeout(run, 250);
  }
}
