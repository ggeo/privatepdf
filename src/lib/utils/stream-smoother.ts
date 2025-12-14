/**
 * Stream Smoother
 * Takes chunky text streams and smooths them out for fluid UI updates.
 */

export type StreamSmootherCallback = (chunk: string) => void;

export function createStreamSmoother(
  callback: StreamSmootherCallback,
  // How many characters to send per animation frame
  chunkSize: number = 15,
) {
  let buffer: string[] = [];
  let isProcessing = false;
  let flushResolve: (() => void) | null = null;

  function add(chunk: string) {
    buffer.push(...chunk.split(''));
    if (!isProcessing) {
      isProcessing = true;
      requestAnimationFrame(processQueue);
    }
  }

  function processQueue() {
    if (buffer.length === 0) {
      isProcessing = false;
      if (flushResolve) {
        flushResolve();
        flushResolve = null;
      }
      return;
    }

    const chunk = buffer.splice(0, chunkSize).join('');
    callback(chunk);

    requestAnimationFrame(processQueue);
  }

  function flush(): Promise<void> {
    return new Promise((resolve) => {
      if (buffer.length === 0 && !isProcessing) {
        resolve();
      } else {
        flushResolve = resolve;
      }
    });
  }

  function cancel() {
    buffer = [];
    isProcessing = false;
    if (flushResolve) {
      flushResolve();
      flushResolve = null;
    }
  }

  function isFinished() {
    return buffer.length === 0 && !isProcessing;
  }

  return { add, flush, cancel, isFinished };
}
