/**
 * useFlowEdges — 边 CRUD Hook
 * 管理流程连接（边）的创建、删除操作。
 */

import { useCallback, useRef } from 'react';
import { Node, Edge, Connection, addEdge, EdgeChange, applyEdgeChanges } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import { toError } from '../utils/error';
import {
  createConnection as tauriCreateConnection,
  deleteConnection as tauriDeleteConnection,
} from '../tauri/flow';
import { type Flow, connectionToEdge, synchronizeNodeSemantics } from './flowHelpers';

export interface UseFlowEdgesParams {
  flow: Flow | null;
  setNodes: React.Dispatch<React.SetStateAction<Node<BlockNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  edges: Edge[];
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<Error | null>>;
  refreshUndoRedoForFlow: (flowId: string) => Promise<void>;
}

export interface UseFlowEdgesReturn {
  edgesRef: React.MutableRefObject<Edge[]>;
  addConnection: (connection: Connection) => Promise<void>;
  deleteConnection: (connectionId: string) => Promise<void>;
  handleEdgesChange: (changes: EdgeChange[]) => void;
}

export function useFlowEdges(params: UseFlowEdgesParams): UseFlowEdgesReturn {
  const { flow, setNodes, setEdges, edges, setIsDirty, setError, refreshUndoRedoForFlow } = params;

  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // ── addConnection ───────────────────────────────────────────────

  const addConnection = useCallback(
    async (connection: Connection): Promise<void> => {
      if (!flow) {
        throw new Error('请先创建或加载流程');
      }

      try {
        if (!connection.source || !connection.target) {
          throw new Error('Cannot create connection: source and target block IDs are required');
        }
        const createdConnection = await tauriCreateConnection(
          flow.id,
          connection.source,
          connection.target,
          connection.sourceHandle || undefined
        );
        const newEdge = connectionToEdge(createdConnection);
        setEdges((eds) => addEdge(newEdge, eds));
        setNodes((nds) => {
          const nextEdges = addEdge(newEdge, edgesRef.current);
          return synchronizeNodeSemantics(nds, nextEdges, flow.entryBlock);
        });
        setIsDirty(true);
        await refreshUndoRedoForFlow(flow.id);
      } catch (err) {
        const error = toError(err);
        setError(error);
        throw error;
      }
    },
    [flow, setNodes, setEdges, setIsDirty, setError, refreshUndoRedoForFlow]
  );

  // ── deleteConnection ────────────────────────────────────────────

  const deleteConnection = useCallback(
    async (connectionId: string): Promise<void> => {
      setEdges((eds) => eds.filter((edge) => edge.id !== connectionId));
      setNodes((nds) => {
        const nextEdges = edgesRef.current.filter((edge) => edge.id !== connectionId);
        return synchronizeNodeSemantics(nds, nextEdges, flow?.entryBlock);
      });
      setIsDirty(true);

      if (!flow) {
        console.warn('No flow to delete connection from');
        return;
      }

      try {
        await tauriDeleteConnection(flow.id, connectionId);
        await refreshUndoRedoForFlow(flow.id);
      } catch (err) {
        const error = toError(err);
        setError(error);
        throw error;
      }
    },
    [flow, setNodes, setEdges, setIsDirty, setError, refreshUndoRedoForFlow]
  );

  // ── handleEdgesChange ───────────────────────────────────────────

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removalIds = new Set(
        changes
          .filter(
            (change): change is EdgeChange & { type: 'remove'; id: string } =>
              change.type === 'remove'
          )
          .map((change) => change.id)
      );

      const nonRemovalChanges = changes.filter((change) => change.type !== 'remove');
      const baseEdges = edges.filter((edge) => !removalIds.has(edge.id));
      const nextEdges = applyEdgeChanges(nonRemovalChanges, baseEdges);
      setEdges(nextEdges);
      if (changes.length > 0) {
        setIsDirty(true);
      }

      removalIds.forEach((id) => {
        void deleteConnection(id);
      });
    },
    [edges, setEdges, setIsDirty, deleteConnection]
  );

  return { edgesRef, addConnection, deleteConnection, handleEdgesChange };
}
