import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlow } from './useFlow';

const mocks = vi.hoisted(() => ({
  createBlock: vi.fn(),
  canUndo: vi.fn(),
  canRedo: vi.fn(),
  listFlows: vi.fn(),
}));

vi.mock('../tauri/flow', async () => {
  const actual = await vi.importActual<typeof import('../tauri/flow')>('../tauri/flow');

  return {
    ...actual,
    listFlows: mocks.listFlows,
    createBlock: mocks.createBlock,
    canUndoFlow: mocks.canUndo,
    canRedoFlow: mocks.canRedo,
  };
});

describe('useFlow undo/redo state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFlows.mockResolvedValue([]);
    mocks.createBlock.mockResolvedValue({
      id: 'node-1',
      blockType: { type: 'action', action: 'click' },
      position: { x: 120, y: 80 },
      config: { type: 'click', mode: { mode: 'coordinates', x: 0, y: 0 }, count: 1 },
      children: [],
    });
    mocks.canUndo.mockResolvedValue(true);
    mocks.canRedo.mockResolvedValue(false);
  });

  it('refreshes canUndo and canRedo after adding a node', async () => {
    const { result } = renderHook(() => useFlow({
      initialFlow: {
        id: 'flow-1',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    }));

    await act(async () => {
      await result.current.addNode('click', 'action', { x: 120, y: 80 });
    });

    await waitFor(() => {
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    expect(mocks.canUndo).toHaveBeenCalledWith('flow-1');
    expect(mocks.canRedo).toHaveBeenCalledWith('flow-1');
  });
});
