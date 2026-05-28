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
  runtimeSelfCheck as tauriRuntimeSelfCheck,
  type ExecutionEvent,
  type RuntimeCheckResponse,
  type ExecutionStatusType as TauriExecutionStatusType,
  type ExecutionStatusResponse,
} from '../tauri/execution';

// Re-export ExecutionStatusType for compatibility
export type ExecutionStatusType = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'validation_blocked' | 'error';

/**
 * Map Tauri execution status to local status type
 */
function mapStatus(status: TauriExecutionStatusType): ExecutionStatusType {
  return status;
}

/**
 * Internal execution event for log tracking
 */
export interface InternalExecutionEvent {
  type: 'started' | 'block_started' | 'block_completed' | 'block_error' | 'execution_failed' | 'flow_completed' | 'stopped' | 'paused' | 'resumed';
  source?: 'frontend' | 'backend';
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
  setExecutionState: (status: ExecutionStatusType, errorMessage?: string | null) => void;
  runtimeSelfCheck: () => Promise<RuntimeCheckResponse>;
  executeFlow: (flowId: string) => Promise<void>;
  stepExecution: (flowId: string) => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  stopExecution: () => Promise<void>;
  getExecutionStatus: () => Promise<ExecutionStatusType>;
  clearLog: () => void;
  resetProgress: (totalBlocks: number) => void;
}

/**
 * useExecution Hook - Execution Control
 * Manages execution state and communicates with Tauri backend
 */
export function useExecution(): UseExecutionReturn {
  const [status, setStatus] = useState<ExecutionStatusType>('idle');
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<InternalExecutionEvent[]>([]);
  const [totalBlocks, setTotalBlocks] = useState<number>(0);
  const [completedBlocks, setCompletedBlocks] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Track if we've set up the event listener
  const listenerSetupRef = useRef(false);

  // Add event to log
  const addEvent = useCallback((event: InternalExecutionEvent) => {
    setExecutionLog((prev) => [...prev, event]);
  }, []);

  const addEventRef = useRef(addEvent);

  useEffect(() => {
    addEventRef.current = addEvent;
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
              addEventRef.current({
                type: 'started',
                source: 'backend',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockStarted':
              setCurrentBlockId(event.blockId);
              addEventRef.current({
                type: 'block_started',
                source: 'backend',
                blockId: event.blockId,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockCompleted':
              setCompletedBlocks((prev) => prev + 1);
              addEventRef.current({
                type: 'block_completed',
                source: 'backend',
                blockId: event.blockId,
                success: event.success,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'blockError':
              addEventRef.current({
                type: 'block_error',
                source: 'backend',
                blockId: event.blockId,
                error: event.message,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'executionFailed':
              setStatus('error');
              setCurrentBlockId(event.blockId ?? null);
              setErrorMessage(event.message);
              addEventRef.current({
                type: 'execution_failed',
                source: 'backend',
                blockId: event.blockId ?? undefined,
                error: event.message,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'flowCompleted':
              setStatus('completed');
              setCurrentBlockId(null);
              addEventRef.current({
                type: 'flow_completed',
                source: 'backend',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'stopped':
              setStatus('stopped');
              setCurrentBlockId(null);
              setErrorMessage(event.reason || '执行已停止');
              addEventRef.current({
                type: 'stopped',
                source: 'backend',
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'paused':
              setStatus('paused');
              addEventRef.current({
                type: 'paused',
                source: 'backend',
                blockId: event.blockId,
                timestamp: new Date(event.timestamp),
              });
              break;

            case 'resumed':
              setStatus('running');
              addEventRef.current({
                type: 'resumed',
                source: 'backend',
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
  }, []);

  // Execute a flow
  const executeFlow = useCallback(async (flowId: string): Promise<void> => {
    try {
      setErrorMessage(null);
      setCompletedBlocks(0);
      
      const result = await tauriExecuteFlow(flowId);
      if (!result) {
        setErrorMessage('执行未成功启动');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Execution failed');
      addEventRef.current({
        type: 'block_error',
        source: 'frontend',
        error: error instanceof Error ? error.message : 'Execution failed',
        timestamp: new Date(),
      });
    }
  }, []);

  // Execute a single step
  const stepExecution = useCallback(async (flowId: string): Promise<void> => {
    try {
      const result = await tauriStepExecution(flowId);
      if (!result) {
        setErrorMessage('单步执行未成功启动');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Step execution failed');
      addEventRef.current({
        type: 'block_error',
        source: 'frontend',
        error: error instanceof Error ? error.message : 'Step execution failed',
        timestamp: new Date(),
      });
    }
  }, []);

  // Pause execution
  const pauseExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriPauseExecution();
      if (!result) {
        setErrorMessage('暂停执行失败');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pause failed');
    }
  }, []);

  // Resume execution
  const resumeExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriResumeExecution();
      if (!result) {
        setErrorMessage('恢复执行失败');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Resume failed');
    }
  }, []);

  // Stop execution
  const stopExecution = useCallback(async (): Promise<void> => {
    try {
      const result = await tauriStopExecution();
      if (!result) {
        setErrorMessage('停止执行失败');
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

  const resetProgress = useCallback((nextTotalBlocks: number) => {
    setTotalBlocks(nextTotalBlocks);
    setCompletedBlocks(0);
    setCurrentBlockId(null);
    setErrorMessage(null);
  }, []);

  const setExecutionState = useCallback((nextStatus: ExecutionStatusType, nextErrorMessage: string | null = null) => {
    setStatus(nextStatus);
    setErrorMessage(nextErrorMessage);
    if (nextStatus !== 'running' && nextStatus !== 'paused') {
      setCurrentBlockId(null);
    }
  }, []);

  const runtimeSelfCheck = useCallback(async (): Promise<RuntimeCheckResponse> => {
    return tauriRuntimeSelfCheck();
  }, []);

  return {
    status,
    currentBlockId,
    executionLog,
    totalBlocks,
    completedBlocks,
    errorMessage,
    setExecutionState,
    runtimeSelfCheck,
    executeFlow,
    stepExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    getExecutionStatus,
    clearLog,
    resetProgress,
  };
}

export default useExecution;
