/**
 * useFlowValidation — 流程校验 Hook
 * 管理 undo/redo 状态刷新等校验逻辑。
 */

import { useCallback } from 'react';
import {
  canUndoFlow as tauriCanUndo,
  canRedoFlow as tauriCanRedo,
} from '../tauri/flow';
import { type Flow } from './flowHelpers';

export interface UseFlowValidationParams {
  flow: Flow | null;
  setCanUndo: React.Dispatch<React.SetStateAction<boolean>>;
  setCanRedo: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseFlowValidationReturn {
  refreshUndoRedoForFlow: (flowId: string) => Promise<void>;
}

export function useFlowValidation(params: UseFlowValidationParams): UseFlowValidationReturn {
  const { flow: _flow, setCanUndo, setCanRedo } = params;

  const refreshUndoRedoForFlow = useCallback(
    async (flowId: string) => {
      try {
        const [undo, redo] = await Promise.all([
          tauriCanUndo(flowId),
          tauriCanRedo(flowId),
        ]);
        setCanUndo(undo);
        setCanRedo(redo);
      } catch (err) {
        console.error('Failed to get undo/redo state:', err);
      }
    },
    [setCanUndo, setCanRedo]
  );

  return { refreshUndoRedoForFlow };
}
