/**
 * useFlow - 流程管理组合 Hook
 * 
 * Phase 4a: 拆分为 4 个子 hook，本文件仅负责组合与流程级操作。
 * - useFlowNodes     → 节点 CRUD
 * - useFlowEdges     → 边 CRUD
 * - useFlowHistory   → 撤销/重做
 * - useFlowValidation → 校验（undo/redo 状态刷新）
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import { toError } from '../utils/error';
import {
  createFlow as tauriCreateFlow,
  saveFlow as tauriSaveFlow,
  loadFlow as tauriLoadFlow,
  listFlows as tauriListFlows,
  deleteFlow as tauriDeleteFlow,
} from '../tauri/flow';
import {
  type Flow,
  type FlowMetadata,
  type UseFlowOptions,
  type UseFlowReturn,
  buildCanonicalFlow,
  blockNodeToReactFlowNode,
  connectionToEdge,
  synchronizeNodeSemantics,
} from './flowHelpers';
import { useFlowNodes } from './useFlowNodes';
import { useFlowEdges } from './useFlowEdges';
import { useFlowHistory } from './useFlowHistory';
import { useFlowValidation } from './useFlowValidation';

export type { Flow, UseFlowOptions, UseFlowReturn } from './flowHelpers';
export { buildCanonicalFlow } from './flowHelpers';

export function useFlow(options: UseFlowOptions = {}): UseFlowReturn {
  const { initialFlow, initialNodes = [], initialEdges = [] } = options;

  // ── Core state ──────────────────────────────────────────────────

  const [flow, setFlow] = useState<Flow | null>(initialFlow || null);
  const [nodes, setNodes] = useState<Node<BlockNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [flowList, setFlowList] = useState<FlowMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const initializedRef = useRef(false);

  // ── Sub-hooks (order matters: validation → edges → nodes → history) ──

  const { refreshUndoRedoForFlow } = useFlowValidation({ flow, setCanUndo, setCanRedo });

  const {
    edgesRef,
    addConnection,
    deleteConnection,
    handleEdgesChange,
  } = useFlowEdges({
    flow,
    setNodes,
    setEdges,
    edges,
    setIsDirty,
    setError,
    refreshUndoRedoForFlow,
  });

  const {
    addNode,
    deleteNode,
    updateNodePosition,
    updateNodeConfig,
    handleNodesChange,
  } = useFlowNodes({
    flow,
    setNodes,
    setEdges,
    edgesRef,
    setIsDirty,
    setError,
    refreshUndoRedoForFlow,
  });

  const { undo, redo } = useFlowHistory({
    flow,
    setFlow,
    setNodes,
    setEdges,
    setIsDirty,
    canUndo,
    setCanUndo,
    canRedo,
    setCanRedo,
  });

  // ── Flow-level operations ───────────────────────────────────────

  const loadFlowList = useCallback(async () => {
    try {
      const list = await tauriListFlows();
      setFlowList(list);
    } catch (err) {
      console.error('Failed to load flow list:', err);
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    loadFlowList();
  }, []);

  const createFlow = useCallback(
    async (name: string) => {
      setLoading(true);
      setError(null);
      try {
        const newFlow = await tauriCreateFlow(name);
        setFlow(newFlow);
        setNodes([]);
        setEdges([]);
        setIsDirty(false);
        await loadFlowList();
        return newFlow;
      } catch (err) {
        const error = toError(err);
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadFlowList]
  );

  const saveFlow = useCallback(async () => {
    if (!flow) {
      console.warn('No flow to save');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const flowToSave = buildCanonicalFlow(flow, nodes, edges);
      await tauriSaveFlow(flowToSave);
      setFlow(flowToSave);
      setNodes((currentNodes) =>
        synchronizeNodeSemantics(currentNodes, edges, flowToSave.entryBlock)
      );
      setIsDirty(false);
      await loadFlowList();
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [edges, flow, loadFlowList, nodes]);

  const loadFlow = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const loadedFlow = await tauriLoadFlow(id);
        setFlow(loadedFlow);
        const loadedEdges: Edge[] = loadedFlow.connections.map((conn) =>
          connectionToEdge(conn)
        );
        const loadedNodes: Node<BlockNodeData>[] = Object.values(loadedFlow.blocks).map(
          (block) => blockNodeToReactFlowNode(block, loadedFlow.entryBlock === block.id)
        );
        setNodes(synchronizeNodeSemantics(loadedNodes, loadedEdges, loadedFlow.entryBlock));
        setEdges(loadedEdges);
        setIsDirty(false);
      } catch (err) {
        const error = toError(err);
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteFlow = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        await tauriDeleteFlow(id);
        if (flow?.id === id) {
          setFlow(null);
          setNodes([]);
          setEdges([]);
          setIsDirty(false);
        }
        await loadFlowList();
      } catch (err) {
        const error = toError(err);
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [flow, loadFlowList]
  );

  const setEntryBlock = useCallback(
    async (nodeId: string | null): Promise<void> => {
      if (!flow) {
        console.warn('No flow to set entry block in');
        return;
      }
      const nextEntryBlock = nodeId ?? undefined;
      setFlow((currentFlow) =>
        currentFlow ? { ...currentFlow, entryBlock: nextEntryBlock } : currentFlow
      );
      setNodes((currentNodes) =>
        synchronizeNodeSemantics(currentNodes, edges, nextEntryBlock)
      );
      setIsDirty(true);
    },
    [edges, flow]
  );

  // ── Return unified API ──────────────────────────────────────────

  return {
    flow,
    nodes,
    edges,
    flowList,
    loading,
    error,
    isDirty,
    createFlow,
    saveFlow,
    loadFlow,
    loadFlowList,
    deleteFlow,
    setNodes,
    setEdges,
    addNode,
    updateNodePosition,
    updateNodeConfig,
    deleteNode,
    addConnection,
    deleteConnection,
    setEntryBlock,
    undo,
    redo,
    canUndo,
    canRedo,
    handleNodesChange,
    handleEdgesChange,
  };
}

export default useFlow;
