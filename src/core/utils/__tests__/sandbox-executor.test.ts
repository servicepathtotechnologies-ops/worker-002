import { runInSandbox } from '../sandbox-executor';
import { Worker } from 'worker_threads';

// All jest.fn() calls inlined inside the factory — avoids TDZ ReferenceError
// from hoisted jest.mock. Instances are tracked on MockWorker._instances so
// tests can emit events on the most-recently-created worker.
jest.mock('worker_threads', () => {
  const instances: any[] = [];
  const MockWorker: any = jest.fn().mockImplementation(() => {
    const { EventEmitter } = require('events');
    const w = new EventEmitter();
    w.terminate = jest.fn().mockResolvedValue(undefined);
    instances.push(w);
    return w;
  });
  MockWorker._instances = instances;
  return { Worker: MockWorker };
});

function lastWorker(): any {
  const instances = (Worker as any)._instances as any[];
  return instances[instances.length - 1];
}

describe('runInSandbox', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    (Worker as any)._instances.length = 0;
    jest.clearAllMocks();
    jest.useFakeTimers();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleSpy.mockRestore();
  });

  it('resolves with the value from an ok message', async () => {
    const promise = runInSandbox({ code: '1+1', timeout: 1000 });
    lastWorker().emit('message', { t: 'ok', v: 42 });
    await expect(promise).resolves.toBe(42);
  });

  it('rejects with the message field from an err message', async () => {
    const promise = runInSandbox({ code: 'throw 1', timeout: 1000 });
    lastWorker().emit('message', { t: 'err', m: 'boom' });
    await expect(promise).rejects.toThrow('boom');
  });

  it('rejects with "Sandbox error" when err message has no m field', async () => {
    const promise = runInSandbox({ code: 'bad', timeout: 1000 });
    lastWorker().emit('message', { t: 'err' });
    await expect(promise).rejects.toThrow('Sandbox error');
  });

  it('forwards log messages to console.log with default label Sandbox', async () => {
    const promise = runInSandbox({ code: 'console.log(1)', timeout: 1000 });
    lastWorker().emit('message', { t: 'log', a: ['hello', 'world'] });
    lastWorker().emit('message', { t: 'ok', v: undefined });
    await promise;
    expect(consoleSpy).toHaveBeenCalledWith('[Sandbox]', 'hello', 'world');
  });

  it('uses a custom label in console.log forwarding', async () => {
    const promise = runInSandbox({ code: 'console.log(1)', timeout: 1000, label: 'JS Node' });
    lastWorker().emit('message', { t: 'log', a: ['data'] });
    lastWorker().emit('message', { t: 'ok', v: null });
    await promise;
    expect(consoleSpy).toHaveBeenCalledWith('[JS Node]', 'data');
  });

  it('terminates the worker after resolving', async () => {
    const promise = runInSandbox({ code: 'x', timeout: 1000 });
    const w = lastWorker();
    w.emit('message', { t: 'ok', v: 'done' });
    await promise;
    expect(w.terminate).toHaveBeenCalled();
  });

  it('terminates the worker after rejecting via an err message', async () => {
    const promise = runInSandbox({ code: 'bad', timeout: 1000 });
    const w = lastWorker();
    w.emit('message', { t: 'err', m: 'oops' });
    await promise.catch(() => {});
    expect(w.terminate).toHaveBeenCalled();
  });

  it('settled flag prevents double-resolve on duplicate ok messages', async () => {
    const promise = runInSandbox({ code: 'x', timeout: 1000 });
    const w = lastWorker();
    w.emit('message', { t: 'ok', v: 1 });
    w.emit('message', { t: 'ok', v: 2 });
    const result = await promise;
    expect(result).toBe(1);
  });

  it('rejects when the worker emits an error event', async () => {
    const promise = runInSandbox({ code: 'x', timeout: 1000 });
    lastWorker().emit('error', new Error('worker crash'));
    await expect(promise).rejects.toThrow('worker crash');
  });

  it('rejects with "Sandbox worker exited unexpectedly" on exit before settling', async () => {
    const promise = runInSandbox({ code: 'x', timeout: 1000 });
    lastWorker().emit('exit');
    await expect(promise).rejects.toThrow('Sandbox worker exited unexpectedly');
  });

  it('exit event after settlement is ignored by the settled flag', async () => {
    const promise = runInSandbox({ code: 'x', timeout: 1000 });
    const w = lastWorker();
    w.emit('message', { t: 'ok', v: 'result' });
    w.emit('exit');
    await expect(promise).resolves.toBe('result');
  });

  it('rejects after the hard timeout fires', async () => {
    const promise = runInSandbox({ code: 'inf', timeout: 100 });
    jest.advanceTimersByTime(2101); // 100 + 2000 grace + 1
    await expect(promise).rejects.toThrow('Script execution timed out after 100ms');
  });

  it('terminates the worker when the hard timeout fires', async () => {
    const promise = runInSandbox({ code: 'inf', timeout: 100 });
    const w = lastWorker();
    jest.advanceTimersByTime(2101);
    await promise.catch(() => {});
    expect(w.terminate).toHaveBeenCalled();
  });

  it('falls back vars to {} when non-serializable (circular reference)', async () => {
    const circular: any = {};
    circular.self = circular;
    const promise = runInSandbox({ code: 'x', timeout: 1000, vars: circular });
    lastWorker().emit('message', { t: 'ok', v: 'ok' });
    await expect(promise).resolves.toBe('ok');
  });

  it('falls back nodeOutputsSnapshot to {} when non-serializable', async () => {
    const circular: any = {};
    circular.self = circular;
    const promise = runInSandbox({ code: 'x', timeout: 1000, nodeOutputsSnapshot: circular });
    lastWorker().emit('message', { t: 'ok', v: 'ok' });
    await expect(promise).resolves.toBe('ok');
  });
});
