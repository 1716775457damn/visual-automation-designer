/**
 * Flow Tauri Commands Module
 * 
 * Provides TypeScript types and command wrappers for flow operations
 * emitted from the Rust backend for flow management.
 * 
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2
 */

import { invoke } from '@tauri-apps/api/core';

const DEV_FLOW_STORAGE_KEY = 'vad-dev-flow-store';

interface DevFlowStore {
  flows: Record<string, Flow>;
  undoStacks: Record<string, Flow[]>;
  redoStacks: Record<string, Flow[]>;
}

function isBrowserFlowMockEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (import.meta.env.MODE === 'test') {
    return false;
  }

  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !tauriWindow.__TAURI__ && !tauriWindow.__TAURI_INTERNALS__;
}

function createEmptyDevStore(): DevFlowStore {
  return {
    flows: {},
    undoStacks: {},
    redoStacks: {},
  };
}

function readDevStore(): DevFlowStore {
  if (!isBrowserFlowMockEnabled()) {
    return createEmptyDevStore();
  }

  const raw = window.localStorage.getItem(DEV_FLOW_STORAGE_KEY);
  if (!raw) {
    return createEmptyDevStore();
  }

  try {
    return JSON.parse(raw) as DevFlowStore;
  } catch {
    return createEmptyDevStore();
  }
}

function writeDevStore(store: DevFlowStore): void {
  if (!isBrowserFlowMockEnabled()) {
    return;
  }

  window.localStorage.setItem(DEV_FLOW_STORAGE_KEY, JSON.stringify(store));
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneFlow(flow: Flow): Flow {
  return JSON.parse(JSON.stringify(flow)) as Flow;
}

function pushFlowHistory(store: DevFlowStore, flowId: string, flow: Flow): void {
  store.undoStacks[flowId] ??= [];
  store.redoStacks[flowId] ??= [];
  store.undoStacks[flowId].push(cloneFlow(flow));
  store.redoStacks[flowId] = [];
}

function saveDevFlow(store: DevFlowStore, flow: Flow): Flow {
  const savedFlow = {
    ...cloneFlow(flow),
    updatedAt: new Date().toISOString(),
  };
  store.flows[savedFlow.id] = savedFlow;
  writeDevStore(store);
  return savedFlow;
}

// ============================================================================
// Flow Types (matching Rust backend)
// ============================================================================

/** Block ID type */
export type BlockId = string;

/** Flow ID type */
export type FlowId = string;

/** Connection ID type */
export type ConnectionId = string;

/** Image ID type */
export type ImageId = string;

/**
 * Action block types
 */
export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text';

/**
 * Control block types
 */
export type ControlType = 'loop' | 'loop_infinite' | 'condition';

/**
 * Block type classification
 */
export type BlockType =
  | { type: 'action'; action: ActionType }
  | { type: 'control'; control: ControlType };

/**
 * Position on the canvas
 */
export interface BlockPosition {
  x: number;
  y: number;
}

/**
 * Click mode configuration
 */
export type ClickMode =
  | { mode: 'coordinates'; x: number; y: number }
  | { mode: 'image'; imageId?: ImageId };

/**
 * Condition operator
 */
export type ConditionOp = 'image_exists' | 'image_not_exists';

/**
 * Block configuration
 */
export type BlockConfig =
  | {
      type: 'click';
      mode: ClickMode;
      count: number;
    }
  | {
      type: 'wait_image';
      imageId?: ImageId;
      timeoutMs?: number;
    }
  | {
      type: 'wait_time';
      durationMs: number;
    }
  | {
      type: 'input_text';
      text: string;
      intervalMs?: number;
    }
  | {
      type: 'loop';
      count: number;
    }
  | {
      type: 'loop_infinite';
    }
  | {
      type: 'condition';
      imageId?: ImageId;
      condition: ConditionOp;
      trueBranch: BlockId[];
      falseBranch: BlockId[];
    };

/**
 * Block node in the flow
 */
export interface BlockNode {
  id: BlockId;
  blockType: BlockType;
  position: BlockPosition;
  config: BlockConfig;
  children: BlockId[];
}

/**
 * Connection between two blocks
 */
export interface Connection {
  id: ConnectionId;
  source: BlockId;
  target: BlockId;
  sourceHandle?: string;
}

/**
 * Complete flow definition
 */
export interface Flow {
  id: FlowId;
  name: string;
  description?: string;
  blocks: Record<BlockId, BlockNode>;
  connections: Connection[];
  entryBlock?: BlockId;
  createdAt: string;
  updatedAt: string;
}

/**
 * Flow metadata for list display
 */
export interface FlowMetadata {
  id: FlowId;
  name: string;
  description?: string;
  blockCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validation error response
 */
export interface ValidationErrorResponse {
  code: string;
  message: string;
  blockId?: string;
  connectionId?: string;
}

/**
 * Validation response
 */
export interface ValidationResponse {
  isValid: boolean;
  errors: ValidationErrorResponse[];
  warnings: ValidationErrorResponse[];
}

type TauriBlockConfigPayload =
  | {
      type: 'click';
      mode:
        | { mode: 'coordinates'; x: number; y: number }
        | { mode: 'image'; image_id?: string };
      count: number;
    }
  | {
      type: 'waitImage';
      image_id?: string;
      timeout_ms?: number;
    }
  | {
      type: 'waitTime';
      duration_ms: number;
    }
  | {
      type: 'inputText';
      text: string;
      interval_ms?: number;
    }
  | {
      type: 'loop';
      count: number;
    }
  | {
      type: 'loopInfinite';
    }
  | {
      type: 'condition';
      image_id?: string;
      condition: ConditionOp;
      true_branch: BlockId[];
      false_branch: BlockId[];
    };

function toTauriBlockConfig(config: BlockConfig): TauriBlockConfigPayload {
  switch (config.type) {
    case 'click':
      return {
        type: 'click',
        mode: config.mode.mode === 'image'
          ? { mode: 'image', image_id: config.mode.imageId }
          : config.mode,
        count: config.count,
      };
    case 'wait_image':
      return {
        type: 'waitImage',
        image_id: config.imageId,
        timeout_ms: config.timeoutMs,
      };
    case 'wait_time':
      return {
        type: 'waitTime',
        duration_ms: config.durationMs,
      };
    case 'input_text':
      return {
        type: 'inputText',
        text: config.text,
        interval_ms: config.intervalMs,
      };
    case 'loop':
      return {
        type: 'loop',
        count: config.count,
      };
    case 'loop_infinite':
      return {
        type: 'loopInfinite',
      };
    case 'condition':
      return {
        type: 'condition',
        image_id: config.imageId,
        condition: config.condition,
        true_branch: config.trueBranch,
        false_branch: config.falseBranch,
      };
  }
}

function toTauriFlowPayload(flow: Flow): Flow {
  return {
    ...flow,
    blocks: Object.fromEntries(
      Object.entries(flow.blocks).map(([blockId, block]) => [
        blockId,
        {
          ...block,
          config: toTauriBlockConfig(block.config),
        },
      ])
    ),
  } as Flow;
}

// ============================================================================
// Flow Management Commands
// ============================================================================

/**
 * Create a new flow with the given name
 * @param name Name for the new flow
 * @returns The created flow
 */
export async function createFlow(name: string): Promise<Flow> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const now = new Date().toISOString();
    const flow: Flow = {
      id: createId(),
      name,
      blocks: {},
      connections: [],
      createdAt: now,
      updatedAt: now,
    };

    store.flows[flow.id] = flow;
    store.undoStacks[flow.id] = [];
    store.redoStacks[flow.id] = [];
    writeDevStore(store);
    return flow;
  }

  return invoke<Flow>('create_flow', { name });
}

/**
 * Save a flow to disk
 * @param flow The flow to save
 * @returns true if saved successfully
 */
export async function saveFlow(flow: Flow): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    saveDevFlow(store, flow);
    return true;
  }

  return invoke<boolean>('save_flow', { flow: toTauriFlowPayload(flow) });
}

/**
 * Load a flow by ID
 * @param id The flow ID
 * @returns The loaded flow
 */
export async function loadFlow(id: string): Promise<Flow> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[id];
    if (!flow) {
      throw new Error('流程不存在');
    }
    return cloneFlow(flow);
  }

  return invoke<Flow>('load_flow', { id });
}

/**
 * List all flows (metadata only)
 * @returns A list of flow metadata
 */
export async function listFlows(): Promise<FlowMetadata[]> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    return Object.values(store.flows)
      .map((flow) => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        blockCount: Object.keys(flow.blocks).length,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return invoke<FlowMetadata[]>('list_flows');
}

/**
 * Delete a flow by ID
 * @param id The flow ID
 * @returns true if deleted successfully
 */
export async function deleteFlow(id: string): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    delete store.flows[id];
    delete store.undoStacks[id];
    delete store.redoStacks[id];
    writeDevStore(store);
    return true;
  }

  return invoke<boolean>('delete_flow', { id });
}

/**
 * Validate a flow
 * @param flow The flow to validate
 * @returns Validation response with errors and warnings
 */
export async function validateFlow(flow: Flow): Promise<ValidationResponse> {
  if (isBrowserFlowMockEnabled()) {
    return {
      isValid: true,
      errors: [],
      warnings: flow.entryBlock ? [] : [{ code: 'NO_ENTRY', message: '未设置入口节点' }],
    };
  }

  return invoke<ValidationResponse>('validate_flow', { flow: toTauriFlowPayload(flow) });
}

// ============================================================================
// Block Operation Commands
// ============================================================================

/**
 * Create a new block in a flow
 * @param flowId The flow ID
 * @param blockType The block type
 * @param config The block configuration
 * @param position The canvas position
 * @returns The created block node
 */
export async function createBlock(
  flowId: string,
  blockType: BlockType,
  config: BlockConfig,
  position: BlockPosition
): Promise<BlockNode> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow) {
      throw new Error('流程不存在');
    }

    pushFlowHistory(store, flowId, flow);

    const block: BlockNode = {
      id: createId(),
      blockType,
      position,
      config,
      children: [],
    };

    const nextFlow = cloneFlow(flow);
    nextFlow.blocks[block.id] = block;
    if (!nextFlow.entryBlock) {
      nextFlow.entryBlock = block.id;
    }

    saveDevFlow(store, nextFlow);
    return block;
  }

  return invoke<BlockNode>('create_block', { flowId, blockType, config: toTauriBlockConfig(config), position });
}

/**
 * Update a block's position
 * @param flowId The flow ID
 * @param blockId The block ID
 * @param position The new position
 * @returns true if updated successfully
 */
export async function updateBlockPosition(
  flowId: string,
  blockId: string,
  position: BlockPosition
): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow || !flow.blocks[blockId]) {
      throw new Error('节点不存在');
    }

    pushFlowHistory(store, flowId, flow);
    const nextFlow = cloneFlow(flow);
    nextFlow.blocks[blockId].position = position;
    saveDevFlow(store, nextFlow);
    return true;
  }

  return invoke<boolean>('update_block_position', { flowId, blockId, position });
}

/**
 * Update a block's configuration
 * @param flowId The flow ID
 * @param blockId The block ID
 * @param config The new configuration
 * @returns true if updated successfully
 */
export async function updateBlockConfig(
  flowId: string,
  blockId: string,
  config: BlockConfig
): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow || !flow.blocks[blockId]) {
      throw new Error('节点不存在');
    }

    pushFlowHistory(store, flowId, flow);
    const nextFlow = cloneFlow(flow);
    nextFlow.blocks[blockId].config = config;
    saveDevFlow(store, nextFlow);
    return true;
  }

  return invoke<boolean>('update_block_config', { flowId, blockId, config: toTauriBlockConfig(config) });
}

/**
 * Delete a block from a flow
 * @param flowId The flow ID
 * @param blockId The block ID
 * @returns true if deleted successfully
 */
export async function deleteBlock(
  flowId: string,
  blockId: string
): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow || !flow.blocks[blockId]) {
      throw new Error('节点不存在');
    }

    pushFlowHistory(store, flowId, flow);
    const nextFlow = cloneFlow(flow);
    delete nextFlow.blocks[blockId];
    nextFlow.connections = nextFlow.connections.filter((connection) => connection.source !== blockId && connection.target !== blockId);
    if (nextFlow.entryBlock === blockId) {
      nextFlow.entryBlock = Object.keys(nextFlow.blocks)[0];
    }
    saveDevFlow(store, nextFlow);
    return true;
  }

  return invoke<boolean>('delete_block', { flowId, blockId });
}

/**
 * Set the entry block for a flow
 * @param flowId The flow ID
 * @param blockId The block ID to set as entry (or null to clear)
 * @returns true if updated successfully
 */
export async function setEntryBlock(
  flowId: string,
  blockId: string | null
): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow) {
      throw new Error('流程不存在');
    }

    pushFlowHistory(store, flowId, flow);
    const nextFlow = cloneFlow(flow);
    nextFlow.entryBlock = blockId ?? undefined;
    saveDevFlow(store, nextFlow);
    return true;
  }

  return invoke<boolean>('set_entry_block', { flowId, blockId });
}

// ============================================================================
// Connection Operation Commands
// ============================================================================

/**
 * Create a connection between two blocks
 * @param flowId The flow ID
 * @param source Source block ID
 * @param target Target block ID
 * @param sourceHandle Optional source handle (for conditional branches)
 * @returns The created connection
 */
export async function createConnection(
  flowId: string,
  source: string,
  target: string,
  sourceHandle?: string
): Promise<Connection> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow) {
      throw new Error('流程不存在');
    }

    pushFlowHistory(store, flowId, flow);

    const connection: Connection = {
      id: createId(),
      source,
      target,
      sourceHandle,
    };

    const nextFlow = cloneFlow(flow);
    nextFlow.connections.push(connection);
    if (nextFlow.blocks[source] && !nextFlow.blocks[source].children.includes(target)) {
      nextFlow.blocks[source].children.push(target);
    }
    saveDevFlow(store, nextFlow);
    return connection;
  }

  return invoke<Connection>('create_connection', { flowId, source, target, sourceHandle });
}

/**
 * Delete a connection from a flow
 * @param flowId The flow ID
 * @param connectionId The connection ID
 * @returns true if deleted successfully
 */
export async function deleteConnection(
  flowId: string,
  connectionId: string
): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const flow = store.flows[flowId];
    if (!flow) {
      throw new Error('流程不存在');
    }

    pushFlowHistory(store, flowId, flow);
    const nextFlow = cloneFlow(flow);
    const removed = nextFlow.connections.find((connection) => connection.id === connectionId);
    nextFlow.connections = nextFlow.connections.filter((connection) => connection.id !== connectionId);
    if (removed && nextFlow.blocks[removed.source]) {
      nextFlow.blocks[removed.source].children = nextFlow.blocks[removed.source].children.filter((childId) => childId !== removed.target);
    }
    saveDevFlow(store, nextFlow);
    return true;
  }

  return invoke<boolean>('delete_connection', { flowId, connectionId });
}

// ============================================================================
// Undo/Redo Commands
// ============================================================================

/**
 * Check if undo is available for a flow
 * @param flowId The flow ID
 * @returns true if undo is available
 */
export async function canUndoFlow(flowId: string): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    return (store.undoStacks[flowId]?.length ?? 0) > 0;
  }

  return invoke<boolean>('can_undo', { flowId });
}

/**
 * Check if redo is available for a flow
 * @param flowId The flow ID
 * @returns true if redo is available
 */
export async function canRedoFlow(flowId: string): Promise<boolean> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    return (store.redoStacks[flowId]?.length ?? 0) > 0;
  }

  return invoke<boolean>('can_redo', { flowId });
}

/**
 * Undo the last operation for a flow
 * @param flowId The flow ID
 * @returns The flow after undo, or null if no undo available
 */
export async function undoFlow(flowId: string): Promise<Flow | null> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const undoStack = store.undoStacks[flowId] ?? [];
    const current = store.flows[flowId];
    if (undoStack.length === 0 || !current) {
      return null;
    }

    const previous = undoStack.pop();
    store.redoStacks[flowId] ??= [];
    store.redoStacks[flowId].push(cloneFlow(current));
    if (!previous) {
      return null;
    }

    store.flows[flowId] = previous;
    writeDevStore(store);
    return cloneFlow(previous);
  }

  return invoke<Flow | null>('undo', { flowId });
}

/**
 * Redo the last undone operation for a flow
 * @param flowId The flow ID
 * @returns The flow after redo, or null if no redo available
 */
export async function redoFlow(flowId: string): Promise<Flow | null> {
  if (isBrowserFlowMockEnabled()) {
    const store = readDevStore();
    const redoStack = store.redoStacks[flowId] ?? [];
    const current = store.flows[flowId];
    if (redoStack.length === 0 || !current) {
      return null;
    }

    const next = redoStack.pop();
    store.undoStacks[flowId] ??= [];
    store.undoStacks[flowId].push(cloneFlow(current));
    if (!next) {
      return null;
    }

    store.flows[flowId] = next;
    writeDevStore(store);
    return cloneFlow(next);
  }

  return invoke<Flow | null>('redo', { flowId });
}
