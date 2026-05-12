import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlow } from './useFlow';

const mocks = vi.hoisted(() => ({
  createBlock: vi.fn(),
  createConnection: vi.fn(),
  deleteConnection: vi.fn(),
  canUndo: vi.fn(),
  canRedo: vi.fn(),
  listFlows: vi.fn(),
  saveFlow: vi.fn(),
}));

vi.mock('../tauri/flow', async () => {
  const actual = await vi.importActual<typeof import('../tauri/flow')>('../tauri/flow');

  return {
    ...actual,
    listFlows: mocks.listFlows,
    saveFlow: mocks.saveFlow,
    createBlock: mocks.createBlock,
    createConnection: mocks.createConnection,
    deleteConnection: mocks.deleteConnection,
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
    mocks.createConnection.mockImplementation(async (_flowId, source, target, sourceHandle) => ({
      id: `edge-${source}-${target}-${sourceHandle ?? 'default'}`,
      source,
      target,
      sourceHandle,
    }));
    mocks.deleteConnection.mockResolvedValue(true);
    mocks.saveFlow.mockResolvedValue(true);
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

  it('normalizes condition branches and loop children when saving', async () => {
    const { result } = renderHook(() => useFlow({
      initialFlow: {
        id: 'flow-1',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      initialNodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
            config: {
              type: 'condition',
              imageId: 'image-1',
              condition: 'image_exists',
              trueBranch: [],
              falseBranch: [],
            },
            executing: false,
          },
        },
        {
          id: 'loop-1',
          type: 'blockNode',
          position: { x: 10, y: 10 },
          data: {
            label: '循环',
            blockType: 'loop',
            blockCategory: 'control',
            config: { type: 'loop', count: 2 },
            executing: false,
          },
        },
        {
          id: 'true-1',
          type: 'blockNode',
          position: { x: 20, y: 20 },
          data: {
            label: '点击',
            blockType: 'click',
            blockCategory: 'action',
            config: { type: 'click', mode: { mode: 'coordinates', x: 0, y: 0 }, count: 1 },
            executing: false,
          },
        },
        {
          id: 'false-1',
          type: 'blockNode',
          position: { x: 30, y: 30 },
          data: {
            label: '等待时间',
            blockType: 'wait_time',
            blockCategory: 'action',
            config: { type: 'wait_time', durationMs: 1000 },
            executing: false,
          },
        },
        {
          id: 'loop-child-1',
          type: 'blockNode',
          position: { x: 40, y: 40 },
          data: {
            label: '输入文本',
            blockType: 'input_text',
            blockCategory: 'action',
            config: { type: 'input_text', text: 'hello', intervalMs: 20 },
            executing: false,
          },
        },
      ] as never,
      initialEdges: [
        { id: 'edge-true', source: 'condition-1', target: 'true-1', sourceHandle: 'true' },
        { id: 'edge-false', source: 'condition-1', target: 'false-1', sourceHandle: 'false' },
        { id: 'edge-loop', source: 'loop-1', target: 'loop-child-1' },
      ] as never,
    }));

    await act(async () => {
      await result.current.saveFlow();
    });

    expect(mocks.saveFlow).toHaveBeenCalledTimes(1);

    const savedFlow = mocks.saveFlow.mock.calls[0][0];
    expect(savedFlow.blocks['condition-1'].config).toMatchObject({
      type: 'condition',
      trueBranch: ['true-1'],
      falseBranch: ['false-1'],
    });
    expect(savedFlow.blocks['loop-1'].children).toEqual(['loop-child-1']);
    expect(savedFlow.entryBlock).toBe('condition-1');
    expect(result.current.nodes.find((node) => node.id === 'condition-1')?.data.isEntryPoint).toBe(true);
  });

  it('keeps an existing valid entry block when saving', async () => {
    const { result } = renderHook(() => useFlow({
      initialFlow: {
        id: 'flow-1',
        name: 'Test Flow',
        entryBlock: 'loop-1',
        blocks: {},
        connections: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      initialNodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
            config: { type: 'condition', imageId: 'image-1', condition: 'image_exists', trueBranch: [], falseBranch: [] },
            executing: false,
          },
        },
        {
          id: 'loop-1',
          type: 'blockNode',
          position: { x: 10, y: 10 },
          data: {
            label: '循环',
            blockType: 'loop',
            blockCategory: 'control',
            config: { type: 'loop', count: 2 },
            executing: false,
          },
        },
      ] as never,
      initialEdges: [] as never,
    }));

    await act(async () => {
      await result.current.saveFlow();
    });

    const savedFlow = mocks.saveFlow.mock.calls[mocks.saveFlow.mock.calls.length - 1]?.[0];
    expect(savedFlow.entryBlock).toBe('loop-1');
    expect(result.current.nodes.find((node) => node.id === 'loop-1')?.data.isEntryPoint).toBe(true);
  });

  it('synchronizes condition branches immediately when connections change', async () => {
    const { result } = renderHook(() => useFlow({
      initialFlow: {
        id: 'flow-1',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      initialNodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
            config: { type: 'condition', imageId: 'image-1', condition: 'image_exists', trueBranch: [], falseBranch: [] },
            executing: false,
          },
        },
      ] as never,
      initialEdges: [] as never,
    }));

    await act(async () => {
      await result.current.addConnection({ source: 'condition-1', target: 'true-1', sourceHandle: 'true' } as never);
      await result.current.addConnection({ source: 'condition-1', target: 'false-1', sourceHandle: 'false' } as never);
    });

    expect(result.current.nodes.find((node) => node.id === 'condition-1')?.data.config).toMatchObject({
      trueBranch: ['true-1'],
      falseBranch: ['false-1'],
    });

    const trueEdgeId = result.current.edges.find((edge) => edge.sourceHandle === 'true')?.id;
    expect(trueEdgeId).toBeTruthy();

    await act(async () => {
      await result.current.deleteConnection(trueEdgeId!);
    });

    expect(result.current.nodes.find((node) => node.id === 'condition-1')?.data.config).toMatchObject({
      trueBranch: [],
      falseBranch: ['false-1'],
    });
  });
});
