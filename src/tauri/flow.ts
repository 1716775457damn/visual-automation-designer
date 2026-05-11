/**
 * Flow Tauri Commands Module
 * 
 * Provides TypeScript types and command wrappers for flow operations
 * emitted from the Rust backend for flow management.
 * 
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2
 */

import { invoke } from '@tauri-apps/api/core';

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
  | { mode: 'image'; imageId: ImageId };

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
      imageId: ImageId;
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
      imageId: ImageId;
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

// ============================================================================
// Flow Management Commands
// ============================================================================

/**
 * Create a new flow with the given name
 * @param name Name for the new flow
 * @returns The created flow
 */
export async function createFlow(name: string): Promise<Flow> {
  return invoke<Flow>('create_flow', { name });
}

/**
 * Save a flow to disk
 * @param flow The flow to save
 * @returns true if saved successfully
 */
export async function saveFlow(flow: Flow): Promise<boolean> {
  return invoke<boolean>('save_flow', { flow });
}

/**
 * Load a flow by ID
 * @param id The flow ID
 * @returns The loaded flow
 */
export async function loadFlow(id: string): Promise<Flow> {
  return invoke<Flow>('load_flow', { id });
}

/**
 * List all flows (metadata only)
 * @returns A list of flow metadata
 */
export async function listFlows(): Promise<FlowMetadata[]> {
  return invoke<FlowMetadata[]>('list_flows');
}

/**
 * Delete a flow by ID
 * @param id The flow ID
 * @returns true if deleted successfully
 */
export async function deleteFlow(id: string): Promise<boolean> {
  return invoke<boolean>('delete_flow', { id });
}

/**
 * Validate a flow
 * @param flow The flow to validate
 * @returns Validation response with errors and warnings
 */
export async function validateFlow(flow: Flow): Promise<ValidationResponse> {
  return invoke<ValidationResponse>('validate_flow', { flow });
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
  return invoke<BlockNode>('create_block', { flowId, blockType, config, position });
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
  return invoke<boolean>('update_block_config', { flowId, blockId, config });
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
  return invoke<boolean>('can_undo', { flowId });
}

/**
 * Check if redo is available for a flow
 * @param flowId The flow ID
 * @returns true if redo is available
 */
export async function canRedoFlow(flowId: string): Promise<boolean> {
  return invoke<boolean>('can_redo', { flowId });
}

/**
 * Undo the last operation for a flow
 * @param flowId The flow ID
 * @returns The flow after undo, or null if no undo available
 */
export async function undoFlow(flowId: string): Promise<Flow | null> {
  return invoke<Flow | null>('undo', { flowId });
}

/**
 * Redo the last undone operation for a flow
 * @param flowId The flow ID
 * @returns The flow after redo, or null if no redo available
 */
export async function redoFlow(flowId: string): Promise<Flow | null> {
  return invoke<Flow | null>('redo', { flowId });
}
