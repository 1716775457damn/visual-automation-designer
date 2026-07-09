/**
 * useFlowHistory — 撤销/重做 Hook
 * 管理流程的 undo/redo 状态与操作。
 */

import { useCallback, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import {
  canUndoFlow as tauriCanUndo,
  canRedoFlow as tauriCanRedo,
  undoFlow as tauriUndo,
  redoFlow as tauriRedo,
} from '../tauri/flow';
import {
  type Flow,
  blockNodeToReactFlowNode,
  connectionToEdge,
  synchronizeNodeSemantics,
} from './flowHelpers';

// ── Module-level history action factory ────────────────────────────

type HistoryAction = (flowId: string) => Promise<Flow | null>;

async function executeHistoryAction(
  label: string,
  action: HistoryAction,
  flow: Flow | null,
  applySnapshot: (result: Flow) => Promise<void>,
): Promise<void> {
  if (!flow) {
    console.warn(`No flow to ${label.toLowerCase()}`);
    return;
  }
  try {
    const result = await action(flow.id);
    if (result) {
      await applySnapshot(result);
    }
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

export interface UseFlowHistoryParams {
  flow: Flow | null;
  setFlow: React.Dispatch<React.SetStateAction<Flow | null>>;
  setNodes: React.Dispatch<React.SetStateAction<Node<BlockNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  canUndo: boolean;
  setCanUndo: React.Dispatch<React.SetStateAction<boolean>>;
  canRedo: boolean;
  setCanRedo: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseFlowHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  updateUndoRedoState: () => Promise<void>;
}

export function useFlowHistory(params: UseFlowHistoryParams): UseFlowHistoryReturn {
  const { flow, setFlow, setNodes, setEdges, setIsDirty, canUndo, setCanUndo, canRedo, setCanRedo } =
    params;

  // ── updateUndoRedoState ─────────────────────────────────────────

  const updateUndoRedoState = useCallback(async () => {
    if (!flow) {
      setCanUndo(false);
      setCanRedo(false);
      return;
    }
    try {
      const [undo, redo] = await Promise.all([
        tauriCanUndo(flow.id),
        tauriCanRedo(flow.id),
      ]);
      setCanUndo(undo);
      setCanRedo(redo);
    } catch (err) {
      console.error('Failed to get undo/redo state:', err);
    }
  }, [flow, setCanUndo, setCanRedo]);

  // ── applyFlowSnapshot (shared by undo/redo) ─────────────────────

  const applyFlowSnapshot = useCallback(
    async (result: Flow): Promise<void> => {
      const nextEdges = result.connections.map(connectionToEdge);
      setFlow(result);
      setNodes(
        synchronizeNodeSemantics(
          Object.values(result.blocks).map((block) =>
            blockNodeToReactFlowNode(block, result.entryBlock === block.id)
          ),
          nextEdges,
          result.entryBlock
        )
      );
      setEdges(nextEdges);
      setIsDirty(true);
      await updateUndoRedoState();
    },
    [setFlow, setNodes, setEdges, setIsDirty, updateUndoRedoState]
  );

  // ── undo / redo (module-level factory to eliminate duplication) ──

  const undo = useCallback(
    () => executeHistoryAction('Undo', tauriUndo, flow, applyFlowSnapshot),
    [flow, applyFlowSnapshot],
  );

  const redo = useCallback(
    () => executeHistoryAction('Redo', tauriRedo, flow, applyFlowSnapshot),
    [flow, applyFlowSnapshot],
  );

  // ── Auto-sync history state ─────────────────────────────────────

  useEffect(() => {
    updateUndoRedoState();
  }, [flow, updateUndoRedoState]);

  return { canUndo, canRedo, undo, redo, updateUndoRedoState };
}
