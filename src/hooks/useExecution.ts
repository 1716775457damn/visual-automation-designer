/**
 * useExecution - Execution Control Hook
 * Encapsulates execution-related Tauri Command calls
 * 
 * Validates: Requirements 5.1, 5.2, 5.5, 5.6
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  onExecutionEvent,
  executeFlow as tauriExecuteFlow,
  stepExecution as tauriStepExecution,
  stopExecution as tauriStopExecution,
  pauseExecution as tauriPauseExecution,
  resumeExecution as tauriResumeExecution,
  getExecutionStatus as tauriGetExecutionStatus,
  type ExecutionEvent,
  type ExecutionStatusType as TauriExecutionStatusType,
  type ExecutionStatusResponse,
} from '../tauri/execution';

// Re-export ExecutionStatusType for compatibility
export type ExecutionStatusType = 'idle' | 'running' | 'paused' | 'completed' | 'error';

/**
 * Map Tauri execution status to local status type
 */
function mapStatus(status: TauriExecutionStatusType): ExecutionStatusType {
  // Tauri status can be 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error'
  // Map 'stopped' to 'idle' for UI purposes
  if (status === 'stopped') {
    return 'idle';
  }
  return status;
}

/**
 * Internal execution event for log tracking
 */
export interface InternalExecutionEvent {
  type: 'started' | 'block_started' | 'block_completed' | 'block_error' | 'flow_completed' | 'stopped' | 'paused' | 'resumed';
  flowId?: string;
  blockId?: string;
  success?: boolean;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

export interface UseExecutionReturn {
  status: ExecutionStatusType;
  currentBlockId: string | null;
  executionLog: InternalExecutionEvent[];
  totalBlocks: number;
  completedBlocks: number;
  errorMessage: string | null;
  executeFlow: (flowId: string) => Promise<void>;
  stepExecution: (flowId: string) => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  stopExecution: () => Promise<void>;
  getExecutionStatus: () => Promise<ExecutionStatusType>;
  clearLog: () => void;
}

/**
 * useExecution Hook - Execution Control
 * Manages execution state and communicates with Tauri backend
 */
export function useExecution(): UseExecutionReturn {
  const [status, setStatus] = useState<ExecutionStatusType>('idle');
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<InternalExecutionEvent[]>([]);
  const [totalBlocks] = useState<number>(0);
  const [completedBlocks, setCompletedBlocks] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Track if we've set up the event listener
  const listenerSetupRef = useRef(false);

  // Add event to log
  const addEvent = useCallback((event: InternalExecutionEvent) => {
    setExecutionLog((prev) => [...prev, event]);
  }, []);

  // Set up event listener on mount
  useEffect(() => {
    if (listenerSetupRef.current) return;
    listenerSetupRef.current = true;

    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await onExecutionEvent((event: ExecutionEvent) => {
          // Handle different event types
          switch (event.type) {
            case 'started':
              setStatus('running');
              setCurrentBlockId(null);
              setCompletedBlocks(0);
              setErrorMessage(null);
              addEvent({
                type: 'started',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockStarted':
              setCurrentBlockId(event.blockId);
              addEvent({
                type: 'block_started',
                blockId: event.blockId,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockCompleted':
              setCompletedBlocks((prev) => prev + 1);
              addEvent({
                type: 'block_completed',
                blockId: event.blockId,
                success: event.success,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockError':
              addEvent({
                type: 'block_error',
                blockId: event.blockId,
                error: event.message,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'flowCompleted':
              setStatus('completed');
              setCurrentBlockId(null);
              addEvent({
                type: 'flow_completed',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'stopped':
              setStatus('idle');
              setCurrentBlockId(null);
              addEvent({
                type: 'stopped',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'paused':
              setStatus('paused');
              addEvent({
                type: 'paused',
                blockId: event.blockId,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'resumed':
              setStatus('running');
              addEvent({
                type: 'resumed',
                blockId: event.blockId,
                timestamp: new Date(event.timestamp),
              });
              break;
          }
        });
      } catch (error) {
        console.error('Failed to set up execution event listener:', error);
      }
    };

    setupListener();

    // Cleanup on unmount
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [addEvent]);

  // Execute a flow
  const executeFlow = useCallback(async (flowId: string): Promise<void> => {
    try {
      setStatus('running');
      setErrorMessage(null);
      setCompletedBlocks(0);
      
      const result = await tauriExecuteFlow(flowId);
      if (!result) {
        console.warn('execute_flow returned false');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Execution failed');
      addEvent({
        type: 'block_error',
        error: error instanceof Error ? error.message : 'Execution failed',
        timestamp: new Date(),
      });
    }
  }, [addEvent]);

  // Execute a single step
  const stepExecution = useCallback(async (flowId: string): Promise<void> => {
    try {
      const result = await tauriStepExecution(flowId);
      if (!result) {
        console.warn('step_execution returned false');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Step execution failed');
      addEvent({
        type: 'block_error',
        error: error instanceof Error ? error.message : 'Step execution failed',
        timestamp: new Date(),
      });
    }
  }, [addEvent]);

  // Pause execution
  const pauseExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriPauseExecution();
      if (result) {
        setStatus('paused');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pause failed');
    }
  }, []);

  // Resume execution
  const resumeExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriResumeExecution();
      if (result) {
        setStatus('running');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Resume failed');
    }
  }, []);

  // Stop execution
  const stopExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriStopExecution();
      if (result) {
        setStatus('idle');
        setCurrentBlockId(null);
        addEvent({
          type: 'stopped',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Stop failed');
    }
  }, [addEvent]);

  // Get current execution status
  const getExecutionStatus = useCallback(async (): Promise<ExecutionStatusType> => {
    try {
      const response: ExecutionStatusResponse = await tauriGetExecutionStatus();
      const mappedStatus = mapStatus(response.status);
      setStatus(mappedStatus);
      return mappedStatus;
    } catch (error) {
      console.error('Failed to get execution status:', error);
      return status;
    }
  }, [status]);

  // Clear execution log
  const clearLog = useCallback(() => {
    setExecutionLog([]);
    setErrorMessage(null);
  }, []);

  return {
    status,
    currentBlockId,
    executionLog,
    totalBlocks,
    completedBlocks,
    errorMessage,
    executeFlow,
    stepExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    getExecutionStatus,
    clearLog,
  };
}

export default useExecution;
