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

  // ── undo ────────────────────────────────────────────────────────

  const undo = useCallback(async (): Promise<void> => {
    if (!flow) {
      console.warn('No flow to undo');
      return;
    }
    try {
      const result = await tauriUndo(flow.id);
      if (result) {
        await applyFlowSnapshot(result);
      }
    } catch (err) {
      console.error('Undo failed:', err);
    }
  }, [flow, applyFlowSnapshot]);

  // ── redo ────────────────────────────────────────────────────────

  const redo = useCallback(async (): Promise<void> => {
    if (!flow) {
      console.warn('No flow to redo');
      return;
    }
    try {
      const result = await tauriRedo(flow.id);
      if (result) {
        await applyFlowSnapshot(result);
      }
    } catch (err) {
      console.error('Redo failed:', err);
    }
  }, [flow, applyFlowSnapshot]);

  // ── Auto-sync history state ─────────────────────────────────────

  useEffect(() => {
    updateUndoRedoState();
  }, [flow, updateUndoRedoState]);

  return { canUndo, canRedo, undo, redo, updateUndoRedoState };
}
