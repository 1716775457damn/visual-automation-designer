/**
 * useFlowNodes — 节点 CRUD Hook
 * 管理流程节点的创建、更新、删除操作。
 */

import { useCallback } from 'react';
import { Node, Edge, NodeChange, applyNodeChanges } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import {
  createBlock as tauriCreateBlock,
  updateBlockPosition as tauriUpdateBlockPosition,
  updateBlockConfig as tauriUpdateBlockConfig,
  deleteBlock as tauriDeleteBlock,
  type BlockConfig,
  type BlockPosition,
} from '../tauri/flow';
import {
  type Flow,
  createBlockType,
  createDefaultConfig,
  blockNodeToReactFlowNode,
  synchronizeNodeSemantics,
  reportRuntimeIssue,
} from './flowHelpers';

export interface UseFlowNodesParams {
  flow: Flow | null;
  setNodes: React.Dispatch<React.SetStateAction<Node<BlockNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  edgesRef: React.MutableRefObject<Edge[]>;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<Error | null>>;
  refreshUndoRedoForFlow: (flowId: string) => Promise<void>;
}

export interface UseFlowNodesReturn {
  addNode: (
    type: string,
    category: string,
    position: { x: number; y: number },
    config?: Record<string, unknown>,
    flowIdOverride?: string
  ) => Promise<string>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>;
  updateNodeConfig: (nodeId: string, config: BlockConfig) => Promise<void>;
  handleNodesChange: (changes: NodeChange[]) => void;
}

export function useFlowNodes(params: UseFlowNodesParams): UseFlowNodesReturn {
  const { flow, setNodes, setEdges, edgesRef, setIsDirty, setError, refreshUndoRedoForFlow } =
    params;

  // ── addNode ─────────────────────────────────────────────────────

  const addNode = useCallback(
    async (
      type: string,
      category: string,
      position: { x: number; y: number },
      config?: Record<string, unknown>,
      flowIdOverride?: string
    ): Promise<string> => {
      const activeFlowId = flowIdOverride ?? flow?.id;
      if (!activeFlowId) {
        throw new Error('请先创建或加载流程');
      }

      try {
        const blockType = createBlockType(type, category);
        const blockConfig = (config as BlockConfig) || createDefaultConfig(type, category);
        const blockPosition: BlockPosition = { x: position.x, y: position.y };
        const block = await tauriCreateBlock(activeFlowId, blockType, blockConfig, blockPosition);

        const newNode = blockNodeToReactFlowNode(block, !flow?.entryBlock);
        setNodes((nds) =>
          synchronizeNodeSemantics([...nds, newNode], edgesRef.current, flow?.entryBlock ?? block.id)
        );
        setIsDirty(true);
        await refreshUndoRedoForFlow(activeFlowId);
        return block.id;
      } catch (err) {
        await reportRuntimeIssue('useFlowNodes.addNode', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [flow, setNodes, edgesRef, setIsDirty, setError, refreshUndoRedoForFlow]
  );

  // ── deleteNode ──────────────────────────────────────────────────

  const deleteNode = useCallback(
    async (nodeId: string): Promise<void> => {
      setNodes((nds) => {
        const nextNodes = nds.filter((node) => node.id !== nodeId);
        const nextEdges = edgesRef.current.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId
        );
        const nextEntryBlock =
          flow?.entryBlock === nodeId ? nextNodes[0]?.id : flow?.entryBlock;
        return synchronizeNodeSemantics(nextNodes, nextEdges, nextEntryBlock);
      });
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
      setIsDirty(true);

      if (!flow) {
        console.warn('No flow to delete node from');
        return;
      }

      try {
        await tauriDeleteBlock(flow.id, nodeId);
        await refreshUndoRedoForFlow(flow.id);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [flow, setNodes, setEdges, edgesRef, setIsDirty, setError, refreshUndoRedoForFlow]
  );

  // ── updateNodePosition ──────────────────────────────────────────

  const updateNodePosition = useCallback(
    async (nodeId: string, position: { x: number; y: number }): Promise<void> => {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, position } : node))
      );
      setIsDirty(true);

      if (!flow) {
        console.warn('No flow to update node position in');
        return;
      }

      try {
        await tauriUpdateBlockPosition(flow.id, nodeId, { x: position.x, y: position.y });
        await refreshUndoRedoForFlow(flow.id);
      } catch (err) {
        console.warn('Failed to update block position on backend:', err);
      }
    },
    [flow, setNodes, setIsDirty, refreshUndoRedoForFlow]
  );

  // ── updateNodeConfig ────────────────────────────────────────────

  const updateNodeConfig = useCallback(
    async (nodeId: string, config: BlockConfig): Promise<void> => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, config: config as Record<string, unknown> } }
            : node
        )
      );
      setIsDirty(true);

      if (!flow) {
        console.warn('No flow to update node config in');
        return;
      }

      try {
        await tauriUpdateBlockConfig(flow.id, nodeId, config);
        await refreshUndoRedoForFlow(flow.id);
      } catch (err) {
        await reportRuntimeIssue('useFlowNodes.updateNodeConfig', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [flow, setNodes, setIsDirty, setError, refreshUndoRedoForFlow]
  );

  // ── handleNodesChange ───────────────────────────────────────────

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prevNodes) => applyNodeChanges(changes, prevNodes));

      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(change.id, change.position);
        }
      });
    },
    [setNodes, updateNodePosition]
  );

  return { addNode, deleteNode, updateNodePosition, updateNodeConfig, handleNodesChange };
}
