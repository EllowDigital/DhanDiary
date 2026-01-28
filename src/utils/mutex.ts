/**
 * A simple Mutex for synchronizing async operations.
 * GUARANTEES exclusive execution of code blocks.
 */
export class Mutex {
  private _queue: {
    resolve: (release: () => void) => void;
    reject: (err: unknown) => void;
    timer?: any;
  }[] = [];
  private _isLocked = false;

  constructor(private timeoutMs = 45000) {}

  isLocked() {
    return this._isLocked;
  }

  /**
   * Acquire the lock. Returns a release function.
   * Throws if timeout is reached.
   */
  acquire(): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let released = false;

      const release = () => {
        if (released) return;
        released = true;
        this._dispatch();
      };

      if (!this._isLocked) {
        this._isLocked = true;
        resolve(release);
        return;
      }

      // Enqueue
      const handle = {
        resolve,
        reject,
        timer: undefined as any,
      };

      if (this.timeoutMs > 0) {
        handle.timer = setTimeout(() => {
          // Remove from queue
          this._queue = this._queue.filter((h) => h !== handle);
          reject(new Error('Mutex lock timeout'));
        }, this.timeoutMs);
      }

      this._queue.push(handle);
    });
  }

  /**
   * Run an exclusive task.
   * Handles acquire/release automatically, even on error.
   */
  async runExclusive<T>(callback: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await callback();
    } finally {
      release();
    }
  }

  private _dispatch() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        this._isLocked = true;
        let released = false;
        next.resolve(() => {
          if (released) return;
          released = true;
          this._dispatch();
        });
      }
    } else {
      this._isLocked = false;
    }
  }
}
