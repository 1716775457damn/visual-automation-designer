/**
 * Tests for Tauri Flow Module
 * 
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri invoke function
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

// Import after mocking
import {
  createFlow,
  saveFlow,
  loadFlow,
  listFlows,
  deleteFlow,
  validateFlow,
  createBlock,
  updateBlockPosition,
  updateBlockConfig,
  deleteBlock,
  setEntryBlock,
  createConnection,
  deleteConnection,
  canUndoFlow,
  canRedoFlow,
  undoFlow,
  redoFlow,
  type Flow,
  type BlockNode,
  type BlockType,
  type BlockConfig,
  type BlockPosition,
} from './flow';

describe('Flow Tauri Commands', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('Flow Management Commands', () => {
    it('should create a new flow', async () => {
      const mockFlow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockInvoke.mockResolvedValueOnce(mockFlow);

      const result = await createFlow('Test Flow');

      expect(mockInvoke).toHaveBeenCalledWith('create_flow', { name: 'Test Flow' });
      expect(result).toEqual(mockFlow);
    });

    it('should save a flow', async () => {
      const flow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {
          'block-1': {
            id: 'block-1',
            blockType: { type: 'action', action: 'wait_image' },
            position: { x: 100, y: 100 },
            config: { type: 'wait_image', imageId: 'image-1', timeoutMs: 5000 },
            children: [],
          },
        },
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockInvoke.mockResolvedValueOnce(true);

      const result = await saveFlow(flow);

      expect(mockInvoke).toHaveBeenCalledWith('save_flow', {
        flow: {
          ...flow,
          blocks: {
            'block-1': {
              ...flow.blocks['block-1'],
              config: {
                type: 'wait_image',
                image_id: 'image-1',
                timeout_ms: 5000,
              },
            },
          },
        },
      });
      expect(result).toBe(true);
    });

    it('should load a flow by ID', async () => {
      const mockFlow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockInvoke.mockResolvedValueOnce(mockFlow);

      const result = await loadFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('load_flow', { id: 'test-flow-id' });
      expect(result).toEqual(mockFlow);
    });

    it('should list all flows', async () => {
      const mockFlows = [
        {
          id: 'flow-1',
          name: 'Flow 1',
          blockCount: 3,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'flow-2',
          name: 'Flow 2',
          blockCount: 5,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockInvoke.mockResolvedValueOnce(mockFlows);

      const result = await listFlows();

      expect(mockInvoke).toHaveBeenCalledWith('list_flows', undefined);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Flow 1');
      expect(result[1].name).toBe('Flow 2');
    });

    it('should delete a flow', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await deleteFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('delete_flow', { id: 'test-flow-id' });
      expect(result).toBe(true);
    });

    it('should validate a flow', async () => {
      const mockValidationResponse = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      mockInvoke.mockResolvedValueOnce(mockValidationResponse);

      const flow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {
          'block-1': {
            id: 'block-1',
            blockType: { type: 'control', control: 'condition' },
            position: { x: 100, y: 100 },
            config: {
              type: 'condition',
              imageId: 'image-1',
              condition: 'image_exists',
              trueBranch: ['block-2'],
              falseBranch: ['block-3'],
            },
            children: [],
          },
        },
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const result = await validateFlow(flow);

      expect(mockInvoke).toHaveBeenCalledWith('validate_flow', {
        flow: {
          ...flow,
          blocks: {
            'block-1': {
              ...flow.blocks['block-1'],
              config: {
                type: 'condition',
                image_id: 'image-1',
                condition: 'image_exists',
                true_branch: ['block-2'],
                false_branch: ['block-3'],
              },
            },
          },
        },
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('Block Operation Commands', () => {
    const blockType: BlockType = { type: 'action', action: 'click' };
    const config: BlockConfig = { type: 'click', mode: { mode: 'coordinates', x: 100, y: 200 }, count: 1 };
    const position: BlockPosition = { x: 100, y: 200 };

    it('should create a block', async () => {
      const mockBlock: BlockNode = {
        id: 'test-block-id',
        blockType,
        position,
        config,
        children: [],
      };

      mockInvoke.mockResolvedValueOnce(mockBlock);

      const result = await createBlock('test-flow-id', blockType, config, position);

      expect(mockInvoke).toHaveBeenCalledWith('create_block', {
        flowId: 'test-flow-id',
        blockType,
        config,
        position,
      });
      expect(result.id).toBe('test-block-id');
    });

    it('should update block position', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await updateBlockPosition('test-flow-id', 'test-block-id', { x: 150, y: 250 });

      expect(mockInvoke).toHaveBeenCalledWith('update_block_position', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
        position: { x: 150, y: 250 },
      });
      expect(result).toBe(true);
    });

    it('should update block config', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const newConfig: BlockConfig = { type: 'click', mode: { mode: 'coordinates', x: 200, y: 300 }, count: 2 };
      const result = await updateBlockConfig('test-flow-id', 'test-block-id', newConfig);

      expect(mockInvoke).toHaveBeenCalledWith('update_block_config', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
        config: newConfig,
      });
      expect(result).toBe(true);
    });

    it('should serialize wait image config for tauri commands', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const newConfig: BlockConfig = { type: 'wait_image', imageId: 'image-1', timeoutMs: 2500 };
      await updateBlockConfig('test-flow-id', 'test-block-id', newConfig);

      expect(mockInvoke).toHaveBeenCalledWith('update_block_config', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
        config: {
          type: 'wait_image',
          image_id: 'image-1',
          timeout_ms: 2500,
        },
      });
    });

    it('should serialize condition config for tauri commands', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const newConfig: BlockConfig = {
        type: 'condition',
        imageId: 'image-1',
        condition: 'image_exists',
        trueBranch: ['block-a'],
        falseBranch: ['block-b'],
      };
      await updateBlockConfig('test-flow-id', 'test-block-id', newConfig);

      expect(mockInvoke).toHaveBeenCalledWith('update_block_config', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
        config: {
          type: 'condition',
          image_id: 'image-1',
          condition: 'image_exists',
          true_branch: ['block-a'],
          false_branch: ['block-b'],
        },
      });
    });

    it('should delete a block', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await deleteBlock('test-flow-id', 'test-block-id');

      expect(mockInvoke).toHaveBeenCalledWith('delete_block', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
      });
      expect(result).toBe(true);
    });

    it('should set entry block', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await setEntryBlock('test-flow-id', 'test-block-id');

      expect(mockInvoke).toHaveBeenCalledWith('set_entry_block', {
        flowId: 'test-flow-id',
        blockId: 'test-block-id',
      });
      expect(result).toBe(true);
    });

    it('should clear entry block', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await setEntryBlock('test-flow-id', null);

      expect(mockInvoke).toHaveBeenCalledWith('set_entry_block', {
        flowId: 'test-flow-id',
        blockId: null,
      });
      expect(result).toBe(true);
    });
  });

  describe('Connection Operation Commands', () => {
    it('should create a connection', async () => {
      const mockConnection = {
        id: 'test-connection-id',
        source: 'block-1',
        target: 'block-2',
      };

      mockInvoke.mockResolvedValueOnce(mockConnection);

      const result = await createConnection('test-flow-id', 'block-1', 'block-2');

      expect(mockInvoke).toHaveBeenCalledWith('create_connection', {
        flowId: 'test-flow-id',
        source: 'block-1',
        target: 'block-2',
        sourceHandle: undefined,
      });
      expect(result.id).toBe('test-connection-id');
    });

    it('should create a connection with handle', async () => {
      const mockConnection = {
        id: 'test-connection-id',
        source: 'block-1',
        target: 'block-2',
        sourceHandle: 'true',
      };

      mockInvoke.mockResolvedValueOnce(mockConnection);

      const result = await createConnection('test-flow-id', 'block-1', 'block-2', 'true');

      expect(mockInvoke).toHaveBeenCalledWith('create_connection', {
        flowId: 'test-flow-id',
        source: 'block-1',
        target: 'block-2',
        sourceHandle: 'true',
      });
      expect(result.sourceHandle).toBe('true');
    });

    it('should delete a connection', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await deleteConnection('test-flow-id', 'test-connection-id');

      expect(mockInvoke).toHaveBeenCalledWith('delete_connection', {
        flowId: 'test-flow-id',
        connectionId: 'test-connection-id',
      });
      expect(result).toBe(true);
    });
  });

  describe('Undo/Redo Commands', () => {
    it('should check if undo is available', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await canUndoFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('can_undo', { flowId: 'test-flow-id' });
      expect(result).toBe(true);
    });

    it('should check if redo is available', async () => {
      mockInvoke.mockResolvedValueOnce(false);

      const result = await canRedoFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('can_redo', { flowId: 'test-flow-id' });
      expect(result).toBe(false);
    });

    it('should undo and return flow', async () => {
      const mockFlow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockInvoke.mockResolvedValueOnce(mockFlow);

      const result = await undoFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('undo', { flowId: 'test-flow-id' });
      expect(result).toEqual(mockFlow);
    });

    it('should undo and return null if no undo available', async () => {
      mockInvoke.mockResolvedValueOnce(null);

      const result = await undoFlow('test-flow-id');

      expect(result).toBeNull();
    });

    it('should redo and return flow', async () => {
      const mockFlow: Flow = {
        id: 'test-flow-id',
        name: 'Test Flow',
        blocks: {},
        connections: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockInvoke.mockResolvedValueOnce(mockFlow);

      const result = await redoFlow('test-flow-id');

      expect(mockInvoke).toHaveBeenCalledWith('redo', { flowId: 'test-flow-id' });
      expect(result).toEqual(mockFlow);
    });
  });
});
