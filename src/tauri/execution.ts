/**
 * Execution Event Types and Listeners
 * 
 * Provides TypeScript types and event listeners for execution events
 * emitted from the Rust backend during flow execution.
 * 
 * Validates: Requirements 5.2
 */

import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { loadFlow, type Flow } from './flow';

type ExecutionCallback = (event: ExecutionEvent) => void;

const browserExecutionListeners = new Set<ExecutionCallback>();
let browserExecutionStatus: ExecutionStatusResponse = {
  status: 'idle',
  isActive: false,
};

function isBrowserExecutionMockEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (import.meta.env.MODE === 'test') {
    return false;
  }

  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !tauriWindow.__TAURI__ && !tauriWindow.__TAURI_INTERNALS__;
}

function emitBrowserExecutionEvent(event: ExecutionEvent): void {
  browserExecutionListeners.forEach((listener) => listener(event));
}

// ============================================================================
// Execution Event Types
// ============================================================================

/** Block ID type */
export type BlockId = string;

/**
 * Execution event types emitted from the backend
 */
export type ExecutionEventType =
  | 'started'
  | 'blockStarted'
  | 'blockCompleted'
  | 'blockError'
  | 'executionFailed'
  | 'flowCompleted'
  | 'stopped'
  | 'paused'
  | 'resumed';

/**
 * Base interface for all execution events
 */
export interface ExecutionEventBase {
  type: ExecutionEventType;
  timestamp: string;
}

/**
 * Flow execution started
 */
export interface ExecutionStartedEvent extends ExecutionEventBase {
  type: 'started';
}

/**
 * A block started executing
 */
export interface BlockStartedEvent extends ExecutionEventBase {
  type: 'blockStarted';
  blockId: BlockId;
}

/**
 * A block completed execution
 */
export interface BlockCompletedEvent extends ExecutionEventBase {
  type: 'blockCompleted';
  blockId: BlockId;
  success: boolean;
}

/**
 * A block execution resulted in an error
 */
export interface BlockErrorEvent extends ExecutionEventBase {
  type: 'blockError';
  blockId: BlockId;
  message: string;
}

export interface ExecutionFailedEvent extends ExecutionEventBase {
  type: 'executionFailed';
  message: string;
  blockId?: BlockId | null;
}

/**
 * Flow execution completed successfully
 */
export interface FlowCompletedEvent extends ExecutionEventBase {
  type: 'flowCompleted';
}

/**
 * Flow execution stopped
 */
export interface ExecutionStoppedEvent extends ExecutionEventBase {
  type: 'stopped';
  reason: string;
}

/**
 * Flow execution paused
 */
export interface ExecutionPausedEvent extends ExecutionEventBase {
  type: 'paused';
  blockId: BlockId;
}

/**
 * Flow execution resumed
 */
export interface ExecutionResumedEvent extends ExecutionEventBase {
  type: 'resumed';
  blockId: BlockId;
}

/**
 * Union type of all execution events
 */
export type ExecutionEvent =
  | ExecutionStartedEvent
  | BlockStartedEvent
  | BlockCompletedEvent
  | BlockErrorEvent
  | ExecutionFailedEvent
  | FlowCompletedEvent
  | ExecutionStoppedEvent
  | ExecutionPausedEvent
  | ExecutionResumedEvent;

// ============================================================================
// Execution Status Types
// ============================================================================

/**
 * Execution status enum
 * Must match the Rust enum in events.rs
 */
export type ExecutionStatusType =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error';

/**
 * Execution status response from get_execution_status command
 */
export interface ExecutionStatusResponse {
  status: ExecutionStatusType;
  isActive: boolean;
}

export interface RuntimeCheckResponse {
  ok: boolean;
  code: string;
  message: string;
}

// ============================================================================
// Event Listener Functions
// ============================================================================

/**
 * Listen for execution events from the backend
 * 
 * @param callback Function to call when an execution event is received
 * @returns Unlisten function to cleanup the listener
 * 
 * @example
 * ```typescript
 * const unlisten = await onExecutionEvent((event) => {
 *   switch (event.type) {
 *     case 'started':
 *       console.log('Execution started');
 *       break;
 *     case 'blockStarted':
 *       console.log(`Block ${event.blockId} started`);
 *       break;
 *     case 'blockError':
 *       console.error(`Block ${event.blockId} error: ${event.message}`);
 *       break;
 *     case 'flowCompleted':
 *       console.log('Flow completed');
 *       break;
 *   }
 * });
 * 
 * // Later, cleanup the listener
 * unlisten();
 * ```
 */
export async function onExecutionEvent(
  callback: (event: ExecutionEvent) => void
): Promise<UnlistenFn> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionListeners.add(callback);
    return async () => {
      browserExecutionListeners.delete(callback);
    };
  }

  return listen<ExecutionEvent>('execution-event', (event) => {
    callback(event.payload);
  });
}

/**
 * Type guard for checking event type
 */
export function isStartedEvent(event: ExecutionEvent): event is ExecutionStartedEvent {
  return event.type === 'started';
}

export function isBlockStartedEvent(event: ExecutionEvent): event is BlockStartedEvent {
  return event.type === 'blockStarted';
}

export function isBlockCompletedEvent(event: ExecutionEvent): event is BlockCompletedEvent {
  return event.type === 'blockCompleted';
}

export function isBlockErrorEvent(event: ExecutionEvent): event is BlockErrorEvent {
  return event.type === 'blockError';
}

export function isFlowCompletedEvent(event: ExecutionEvent): event is FlowCompletedEvent {
  return event.type === 'flowCompleted';
}

export function isStoppedEvent(event: ExecutionEvent): event is ExecutionStoppedEvent {
  return event.type === 'stopped';
}

export function isPausedEvent(event: ExecutionEvent): event is ExecutionPausedEvent {
  return event.type === 'paused';
}

export function isResumedEvent(event: ExecutionEvent): event is ExecutionResumedEvent {
  return event.type === 'resumed';
}

// ============================================================================
// Execution Command Wrappers
// ============================================================================

import { invoke } from '@tauri-apps/api/core';

/**
 * Start executing a flow
 * @param flowId The flow ID to execute
 * @returns true if execution started successfully
 */
export async function executeFlow(flowId: string): Promise<boolean> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionStatus = { status: 'running', isActive: true };
    emitBrowserExecutionEvent({ type: 'started', timestamp: new Date().toISOString() });

    const flow: Flow = await loadFlow(flowId);
    const blockIds = Object.keys(flow.blocks);
    let delay = 80;

    blockIds.forEach((blockId) => {
      window.setTimeout(() => {
        emitBrowserExecutionEvent({ type: 'blockStarted', blockId, timestamp: new Date().toISOString() });
      }, delay);
      delay += 90;
      window.setTimeout(() => {
        emitBrowserExecutionEvent({ type: 'blockCompleted', blockId, success: true, timestamp: new Date().toISOString() });
      }, delay);
      delay += 60;
    });

    window.setTimeout(() => {
      browserExecutionStatus = { status: 'completed', isActive: false };
      emitBrowserExecutionEvent({ type: 'flowCompleted', timestamp: new Date().toISOString() });
    }, delay + 60);

    return true;
  }

  return invoke<boolean>('execute_flow', { flowId });
}

/**
 * Execute a single step of a flow
 * @param flowId The flow ID to execute
 * @returns true if step executed successfully
 */
export async function stepExecution(flowId: string): Promise<boolean> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionStatus = { status: 'paused', isActive: true };
    const flow: Flow = await loadFlow(flowId);
    const firstBlockId = Object.keys(flow.blocks)[0];
    if (firstBlockId) {
      emitBrowserExecutionEvent({ type: 'blockStarted', blockId: firstBlockId, timestamp: new Date().toISOString() });
      emitBrowserExecutionEvent({ type: 'blockCompleted', blockId: firstBlockId, success: true, timestamp: new Date().toISOString() });
    }
    return true;
  }

  return invoke<boolean>('step_execution', { flowId });
}

/**
 * Stop the current execution
 * @returns true if execution stopped successfully
 */
export async function stopExecution(): Promise<boolean> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionStatus = { status: 'stopped', isActive: false };
    emitBrowserExecutionEvent({ type: 'stopped', reason: 'Browser mock stop', timestamp: new Date().toISOString() });
    return true;
  }

  return invoke<boolean>('stop_execution');
}

/**
 * Pause the current execution
 * @returns true if execution paused successfully
 */
export async function pauseExecution(): Promise<boolean> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionStatus = { status: 'paused', isActive: true };
    emitBrowserExecutionEvent({ type: 'paused', blockId: 'browser-mock', timestamp: new Date().toISOString() });
    return true;
  }

  return invoke<boolean>('pause_execution');
}

/**
 * Resume a paused execution
 * @returns true if execution resumed successfully
 */
export async function resumeExecution(): Promise<boolean> {
  if (isBrowserExecutionMockEnabled()) {
    browserExecutionStatus = { status: 'running', isActive: true };
    emitBrowserExecutionEvent({ type: 'resumed', blockId: 'browser-mock', timestamp: new Date().toISOString() });
    return true;
  }

  return invoke<boolean>('resume_execution');
}

/**
 * Get the current execution status
 * @returns The execution status response
 */
export async function getExecutionStatus(): Promise<ExecutionStatusResponse> {
  if (isBrowserExecutionMockEnabled()) {
    return browserExecutionStatus;
  }

  return invoke<ExecutionStatusResponse>('get_execution_status');
}

export async function runtimeSelfCheck(): Promise<RuntimeCheckResponse> {
  if (isBrowserExecutionMockEnabled()) {
    return {
      ok: true,
      code: 'OK',
      message: 'Runtime environment is ready',
    };
  }

  return invoke<RuntimeCheckResponse>('runtime_self_check');
}
