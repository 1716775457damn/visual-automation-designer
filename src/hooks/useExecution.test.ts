import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecution } from './useExecution';

const mocks = vi.hoisted(() => ({
  onExecutionEvent: vi.fn(),
  executeFlow: vi.fn(),
  stepExecution: vi.fn(),
  stopExecution: vi.fn(),
  pauseExecution: vi.fn(),
  resumeExecution: vi.fn(),
  getExecutionStatus: vi.fn(),
}));

vi.mock('../tauri/execution', async () => {
  const actual = await vi.importActual<typeof import('../tauri/execution')>('../tauri/execution');

  return {
    ...actual,
    onExecutionEvent: mocks.onExecutionEvent,
    executeFlow: mocks.executeFlow,
    stepExecution: mocks.stepExecution,
    stopExecution: mocks.stopExecution,
    pauseExecution: mocks.pauseExecution,
    resumeExecution: mocks.resumeExecution,
    getExecutionStatus: mocks.getExecutionStatus,
  };
});

describe('useExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeFlow.mockResolvedValue(true);
    mocks.stepExecution.mockResolvedValue(true);
    mocks.stopExecution.mockResolvedValue(true);
    mocks.pauseExecution.mockResolvedValue(true);
    mocks.resumeExecution.mockResolvedValue(true);
    mocks.getExecutionStatus.mockResolvedValue({ status: 'idle', isActive: false });
  });

  it('surfaces async execution failure events to UI state', async () => {
    let listener: ((event: { type: string; timestamp: string; message: string; blockId?: string | null }) => void) | null = null;
    mocks.onExecutionEvent.mockImplementation(async (callback) => {
      listener = callback;
      return async () => undefined;
    });

    const { result } = renderHook(() => useExecution());

    await waitFor(() => {
      expect(mocks.onExecutionEvent).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      listener?.({
        type: 'executionFailed',
        message: 'Input backend unavailable',
        blockId: 'block-1',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.currentBlockId).toBe('block-1');
    expect(result.current.errorMessage).toBe('Input backend unavailable');
    expect(result.current.executionLog[result.current.executionLog.length - 1]).toMatchObject({
      type: 'execution_failed',
      error: 'Input backend unavailable',
      blockId: 'block-1',
    });
  });
});
