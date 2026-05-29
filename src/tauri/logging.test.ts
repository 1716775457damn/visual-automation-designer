import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

import { logRuntimeIssue } from './logging';

describe('tauri logging bridge', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('forwards runtime issues to the tauri logging command', async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await logRuntimeIssue({
      source: 'useFlow.addNode',
      message: 'invalid args config',
      details: 'stack trace',
    });

    expect(mockInvoke).toHaveBeenCalledWith('log_runtime_issue', {
      payload: {
        source: 'useFlow.addNode',
        message: 'invalid args config',
        details: 'stack trace',
      },
    });
  });
});
