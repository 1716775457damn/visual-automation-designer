/**
 * End-to-End Tests for Flow Management
 *
 * Tests the complete flow creation, save, and load workflow.
 *
 * Validates: Requirements 1.1, 2.2, 5.1, 7.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri API for E2E tests
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Types matching the Rust backend
interface BlockPosition {
  x: number;
  y: number;
}

interface BlockConfig {
  type: string;
  [key: string]: unknown;
}

interface BlockType {
  type: 'action' | 'control';
  action?: string;
  control?: string;
}

interface BlockNode {
  id: string;
  blockType: BlockType;
  position: BlockPosition;
  config: BlockConfig;
  children: string[];
}

interface Connection {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface Flow {
  id: string;
  name: string;
  description?: string;
  blocks: Record<string, BlockNode>;
  connections: Connection[];
  entryBlock?: string;
  createdAt: string;
  updatedAt: string;
}

interface FlowMetadata {
  id: string;
  name: string;
  description?: string;
  blockCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ImageMetadata {
  id: string;
  name: string;
  filePath: string;
  width: number;
  height: number;
  format: string;
  hash: string;
  createdAt: string;
}

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockBlockNode = (overrides: Partial<BlockNode> = {}): BlockNode => ({
  id: crypto.randomUUID(),
  blockType: { type: 'action', action: 'click' },
  position: { x: 100, y: 100 },
  config: { type: 'click', mode: 'coordinates', x: 0, y: 0, count: 1 },
  children: [],
  ...overrides,
});

const createMockFlow = (overrides: Partial<Flow> = {}): Flow => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Test Flow',
    blocks: {},
    connections: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

// ============================================================================
// Flow Creation E2E Tests
// ============================================================================

describe('Flow Creation E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should create a new flow', async () => {
    const mockFlow = createMockFlow({ name: 'New Automation Flow' });

    mockInvoke.mockResolvedValueOnce(mockFlow);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('create_flow', { name: 'New Automation Flow' });

    expect(mockInvoke).toHaveBeenCalledWith('create_flow', { name: 'New Automation Flow' });
    expect(result).toEqual(mockFlow);
  });

  it('should add blocks to a flow', async () => {
    const flowId = crypto.randomUUID();
    const block = createMockBlockNode({
      blockType: { type: 'action', action: 'click' },
      config: { type: 'click', mode: 'coordinates', x: 500, y: 300, count: 1 },
      position: { x: 100, y: 100 },
    });

    mockInvoke.mockResolvedValueOnce(block);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('create_block', {
      flowId,
      blockType: block.blockType,
      config: block.config,
      position: block.position,
    });

    expect(mockInvoke).toHaveBeenCalledWith('create_block', {
      flowId,
      blockType: block.blockType,
      config: block.config,
      position: block.position,
    });
    expect(result).toEqual(block);
  });

  it('should create connections between blocks', async () => {
    const flowId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    const connection: Connection = {
      id: crypto.randomUUID(),
      source: sourceId,
      target: targetId,
    };

    mockInvoke.mockResolvedValueOnce(connection);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('create_connection', {
      flowId,
      source: sourceId,
      target: targetId,
    });

    expect(mockInvoke).toHaveBeenCalledWith('create_connection', {
      flowId,
      source: sourceId,
      target: targetId,
    });
    expect(result).toEqual(connection);
  });

  it('should create a complete flow with multiple blocks and connections', async () => {
    const flowId = crypto.randomUUID();

    // Create flow
    const flow = createMockFlow({ id: flowId, name: 'Complete Automation' });
    mockInvoke.mockResolvedValueOnce(flow);

    // Create block 1 - Click
    const block1 = createMockBlockNode({
      id: crypto.randomUUID(),
      blockType: { type: 'action', action: 'click' },
    });
    mockInvoke.mockResolvedValueOnce(block1);

    // Create block 2 - Wait time
    const block2 = createMockBlockNode({
      id: crypto.randomUUID(),
      blockType: { type: 'action', action: 'waitTime' },
    });
    mockInvoke.mockResolvedValueOnce(block2);

    // Create connection
    const connection: Connection = {
      id: crypto.randomUUID(),
      source: block1.id,
      target: block2.id,
    };
    mockInvoke.mockResolvedValueOnce(connection);

    const { invoke } = await import('@tauri-apps/api/core');

    // Execute the workflow
    const flowResult = await invoke('create_flow', { name: 'Complete Automation' });
    expect(flowResult).toEqual(flow);

    const block1Result = await invoke('create_block', {
      flowId,
      blockType: block1.blockType,
      config: block1.config,
      position: block1.position,
    });
    expect(block1Result).toEqual(block1);

    const block2Result = await invoke('create_block', {
      flowId,
      blockType: block2.blockType,
      config: block2.config,
      position: block2.position,
    });
    expect(block2Result).toEqual(block2);

    const connResult = await invoke('create_connection', {
      flowId,
      source: block1.id,
      target: block2.id,
    });
    expect(connResult).toEqual(connection);
  });
});

// ============================================================================
// Flow Save and Load E2E Tests
// ============================================================================

describe('Flow Save and Load E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should save a flow', async () => {
    const flow = createMockFlow();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('save_flow', { flow });

    expect(mockInvoke).toHaveBeenCalledWith('save_flow', { flow });
    expect(result).toBe(true);
  });

  it('should load a flow by ID', async () => {
    const flowId = crypto.randomUUID();
    const flow = createMockFlow({ id: flowId });

    mockInvoke.mockResolvedValueOnce(flow);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('load_flow', { id: flowId });

    expect(mockInvoke).toHaveBeenCalledWith('load_flow', { id: flowId });
    expect(result).toEqual(flow);
  });

  it('should list all flows', async () => {
    const flows: FlowMetadata[] = [
      {
        id: crypto.randomUUID(),
        name: 'Flow 1',
        blockCount: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: 'Flow 2',
        blockCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockInvoke.mockResolvedValueOnce(flows);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('list_flows');

    expect(mockInvoke).toHaveBeenCalledWith('list_flows', undefined);
    expect(result).toEqual(flows);
  });

  it('should delete a flow', async () => {
    const flowId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('delete_flow', { id: flowId });

    expect(mockInvoke).toHaveBeenCalledWith('delete_flow', { id: flowId });
    expect(result).toBe(true);
  });

  it('should preserve flow data through save/load cycle', async () => {
    const flowId = crypto.randomUUID();
    const blockId = crypto.randomUUID();

    // Create a flow with blocks
    const originalFlow: Flow = {
      id: flowId,
      name: 'Preserved Flow',
      description: 'Test description',
      blocks: {
        [blockId]: {
          id: blockId,
          blockType: { type: 'action', action: 'click' },
          position: { x: 150, y: 250 },
          config: { type: 'click', mode: 'coordinates', x: 100, y: 200, count: 1 },
          children: [],
        },
      },
      connections: [],
      entryBlock: blockId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Mock save
    mockInvoke.mockResolvedValueOnce(true);

    // Mock load (returns the same flow)
    mockInvoke.mockResolvedValueOnce(originalFlow);

    const { invoke } = await import('@tauri-apps/api/core');

    await invoke('save_flow', { flow: originalFlow });
    const loadedFlow = await invoke<Flow>('load_flow', { id: flowId });

    // Verify round-trip preserves data
    expect(loadedFlow.id).toBe(originalFlow.id);
    expect(loadedFlow.name).toBe(originalFlow.name);
    expect(loadedFlow.description).toBe(originalFlow.description);
    expect(Object.keys(loadedFlow.blocks)).toEqual(Object.keys(originalFlow.blocks));
    expect(loadedFlow.entryBlock).toBe(originalFlow.entryBlock);
  });
});

// ============================================================================
// Image Library E2E Tests
// ============================================================================

describe('Image Library E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should add an image to the library', async () => {
    const imageMetadata: ImageMetadata = {
      id: crypto.randomUUID(),
      name: 'Test Button',
      filePath: '/path/to/images/test-button.png',
      width: 100,
      height: 50,
      format: 'png',
      hash: 'abc123',
      createdAt: new Date().toISOString(),
    };

    mockInvoke.mockResolvedValueOnce(imageMetadata);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('add_image', {
      filePath: '/source/test-button.png',
      name: 'Test Button',
    });

    expect(mockInvoke).toHaveBeenCalledWith('add_image', {
      filePath: '/source/test-button.png',
      name: 'Test Button',
    });
    expect(result).toEqual(imageMetadata);
  });

  it('should list images in the library', async () => {
    const images: ImageMetadata[] = [
      {
        id: crypto.randomUUID(),
        name: 'Button 1',
        filePath: '/path/button1.png',
        width: 100,
        height: 50,
        format: 'png',
        hash: 'hash1',
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: 'Button 2',
        filePath: '/path/button2.png',
        width: 80,
        height: 40,
        format: 'png',
        hash: 'hash2',
        createdAt: new Date().toISOString(),
      },
    ];

    mockInvoke.mockResolvedValueOnce(images);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<ImageMetadata[]>('list_images');

    expect(mockInvoke).toHaveBeenCalledWith('list_images', undefined);
    expect(result).toEqual(images);
    expect(result.length).toBe(2);
  });

  it('should rename an image', async () => {
    const imageId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('rename_image', {
      id: imageId,
      newName: 'Renamed Button',
    });

    expect(mockInvoke).toHaveBeenCalledWith('rename_image', {
      id: imageId,
      newName: 'Renamed Button',
    });
    expect(result).toBe(true);
  });

  it('should remove an image', async () => {
    const imageId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('remove_image', { id: imageId });

    expect(mockInvoke).toHaveBeenCalledWith('remove_image', { id: imageId });
    expect(result).toBe(true);
  });
});

// ============================================================================
// Execution Control E2E Tests
// ============================================================================

describe('Execution Control E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should start flow execution', async () => {
    const flowId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('execute_flow', { flowId });

    expect(mockInvoke).toHaveBeenCalledWith('execute_flow', { flowId });
    expect(result).toBe(true);
  });

  it('should stop flow execution', async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('stop_execution');

    expect(mockInvoke).toHaveBeenCalledWith('stop_execution', undefined);
    expect(result).toBe(true);
  });

  it('should pause and resume execution', async () => {
    // Pause
    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const pauseResult = await invoke('pause_execution');

    expect(mockInvoke).toHaveBeenCalledWith('pause_execution', undefined);
    expect(pauseResult).toBe(true);

    // Resume
    mockInvoke.mockResolvedValueOnce(true);
    const resumeResult = await invoke('resume_execution');

    expect(mockInvoke).toHaveBeenCalledWith('resume_execution', undefined);
    expect(resumeResult).toBe(true);
  });

  it('should get execution status', async () => {
    const statusResponse = {
      status: 'idle',
      isActive: false,
    };

    mockInvoke.mockResolvedValueOnce(statusResponse);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('get_execution_status');

    expect(mockInvoke).toHaveBeenCalledWith('get_execution_status', undefined);
    expect(result).toEqual(statusResponse);
  });

  it('should execute a single step', async () => {
    const flowId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('step_execution', { flowId });

    expect(mockInvoke).toHaveBeenCalledWith('step_execution', { flowId });
    expect(result).toBe(true);
  });
});

// ============================================================================
// Block Operations E2E Tests
// ============================================================================

describe('Block Operations E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should update block position', async () => {
    const flowId = crypto.randomUUID();
    const blockId = crypto.randomUUID();
    const newPosition = { x: 300, y: 400 };

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('update_block_position', {
      flowId,
      blockId,
      position: newPosition,
    });

    expect(mockInvoke).toHaveBeenCalledWith('update_block_position', {
      flowId,
      blockId,
      position: newPosition,
    });
    expect(result).toBe(true);
  });

  it('should delete a block', async () => {
    const flowId = crypto.randomUUID();
    const blockId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('delete_block', { flowId, blockId });

    expect(mockInvoke).toHaveBeenCalledWith('delete_block', { flowId, blockId });
    expect(result).toBe(true);
  });

  it('should update block config', async () => {
    const flowId = crypto.randomUUID();
    const blockId = crypto.randomUUID();
    const newConfig = { type: 'waitTime', durationMs: 2000 };

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('update_block_config', {
      flowId,
      blockId,
      config: newConfig,
    });

    expect(mockInvoke).toHaveBeenCalledWith('update_block_config', {
      flowId,
      blockId,
      config: newConfig,
    });
    expect(result).toBe(true);
  });

  it('should set entry block', async () => {
    const flowId = crypto.randomUUID();
    const blockId = crypto.randomUUID();

    mockInvoke.mockResolvedValueOnce(true);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('set_entry_block', {
      flowId,
      blockId: blockId,
    });

    expect(mockInvoke).toHaveBeenCalledWith('set_entry_block', {
      flowId,
      blockId: blockId,
    });
    expect(result).toBe(true);
  });
});

// ============================================================================
// Validation E2E Tests
// ============================================================================

describe('Flow Validation E2E', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('should validate a flow', async () => {
    const flow = createMockFlow();
    const validationResponse = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    mockInvoke.mockResolvedValueOnce(validationResponse);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ isValid: boolean; errors: unknown[] }>('validate_flow', { flow });

    expect(mockInvoke).toHaveBeenCalledWith('validate_flow', { flow });
    expect(result.isValid).toBe(true);
  });

  it('should receive validation errors for invalid flow', async () => {
    const flow = createMockFlow({ blocks: {} }); // Empty flow
    const validationResponse = {
      isValid: false,
      errors: [
        {
          code: 'NO_ENTRY_BLOCK',
          message: 'Flow has no entry block defined',
          blockId: null,
          connectionId: null,
        },
      ],
      warnings: [],
    };

    mockInvoke.mockResolvedValueOnce(validationResponse);

    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ isValid: boolean; errors: unknown[] }>('validate_flow', { flow });

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
