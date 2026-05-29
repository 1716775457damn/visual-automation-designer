import { describe, it, expect } from 'vitest';
import { executionEventToLogEntry } from './ExecutionLog';

describe('executionEventToLogEntry', () => {
  it('classifies execution failures as execution errors', () => {
    const entry = executionEventToLogEntry(
      {
        type: 'execution_failed',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        error: 'Input backend is unavailable',
      },
      0
    );

    expect(entry.type).toBe('error');
    expect(entry.message).toContain('[执行错误]');
    expect(entry.message).toContain('Input backend is unavailable');
  });

  it('labels frontend-originated failures distinctly from backend failures', () => {
    const frontendEntry = executionEventToLogEntry(
      {
        type: 'block_error',
        source: 'frontend',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        error: 'Execution failed before backend call',
      },
      2
    );

    const backendEntry = executionEventToLogEntry(
      {
        type: 'execution_failed',
        source: 'backend',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        error: 'Input backend is unavailable',
      },
      3
    );

    expect(frontendEntry.message).toContain('[前端]');
    expect(frontendEntry.message).toContain('[执行错误]');
    expect(backendEntry.message).toContain('[执行器]');
    expect(backendEntry.message).toContain('[执行错误]');
  });
});
