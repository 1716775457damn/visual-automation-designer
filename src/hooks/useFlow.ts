/**
 * useFlow - 流程管理 Hook
 * 封装流程管理相关的 Tauri Command 调用
 * 
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Edge, Connection, addEdge, NodeChange, applyNodeChanges, EdgeChange, applyEdgeChanges } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import {
  createFlow as tauriCreateFlow,
  saveFlow as tauriSaveFlow,
  loadFlow as tauriLoadFlow,
  listFlows as tauriListFlows,
  deleteFlow as tauriDeleteFlow,
  createBlock as tauriCreateBlock,
  updateBlockPosition as tauriUpdateBlockPosition,
  updateBlockConfig as tauriUpdateBlockConfig,
  deleteBlock as tauriDeleteBlock,
  createConnection as tauriCreateConnection,
  deleteConnection as tauriDeleteConnection,
  canUndoFlow as tauriCanUndo,
  canRedoFlow as tauriCanRedo,
  undoFlow as tauriUndo,
  redoFlow as tauriRedo,
  type Flow as TauriFlow,
  type FlowMetadata,
  type BlockNode as TauriBlockNode,
  type BlockType,
  type BlockConfig,
  type BlockPosition,
  type Connection as TauriConnection,
} from '../tauri/flow';

/**
 * Frontend Flow type (extends Tauri Flow)
 */
export type Flow = TauriFlow;

/**
 * Options for useFlow hook
 */
export interface UseFlowOptions {
  initialFlow?: Flow;
  initialNodes?: Node<BlockNodeData>[];
  initialEdges?: Edge[];
}

/**
 * Return type for useFlow hook
 */
export interface UseFlowReturn {
  flow: Flow | null;
  nodes: Node<BlockNodeData>[];
  edges: Edge[];
  flowList: FlowMetadata[];
  loading: boolean;
  error: Error | null;
  isDirty: boolean;
  createFlow: (name: string) => Promise<Flow>;
  saveFlow: () => Promise<void>;
  loadFlow: (id: string) => Promise<void>;
  loadFlowList: () => Promise<void>;
  deleteFlow: (id: string) => Promise<void>;
  setNodes: React.Dispatch<React.SetStateAction<Node<BlockNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  addNode: (type: string, category: string, position: { x: number; y: number }, config?: Record<string, unknown>, flowIdOverride?: string) => Promise<string>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>;
  updateNodeConfig: (nodeId: string, config: BlockConfig) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  addConnection: (connection: Connection) => Promise<void>;
  deleteConnection: (connectionId: string) => Promise<void>;
  setEntryBlock: (nodeId: string | null) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  handleNodesChange: (changes: NodeChange[]) => void;
  handleEdgesChange: (changes: EdgeChange[]) => void;
}

/**
 * Convert Tauri BlockNode to ReactFlow Node
 */
function blockNodeToReactFlowNode(block: TauriBlockNode, isEntryPoint = false): Node<BlockNodeData> {
  const label = getNodeLabel(block.blockType);
  const blockTypeStr = getBlockTypeString(block.blockType);
  const blockCategory = getBlockCategory(block.blockType);
  
  return {
    id: block.id,
    type: 'blockNode',
    position: { x: block.position.x, y: block.position.y },
    data: {
      label,
      blockType: blockTypeStr as never, // Cast to satisfy TypeScript
      blockCategory,
      config: blockConfigToRecord(block.config),
      isEntryPoint,
      executing: false,
    },
  };
}

/**
 * Convert Tauri Connection to ReactFlow Edge
 */
function connectionToEdge(connection: TauriConnection): Edge {
  return {
    id: connection.id,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    type: 'smoothstep',
    animated: false,
  };
}

/**
 * Get node label from block type
 */
function getNodeLabel(blockType: BlockType): string {
  if (blockType.type === 'action') {
    const actionLabels: Record<string, string> = {
      click: '点击',
      wait_image: '等待图片',
      wait_time: '等待时间',
      input_text: '输入文本',
    };
    return actionLabels[blockType.action] || blockType.action;
  } else {
    const controlLabels: Record<string, string> = {
      loop: '循环',
      loop_infinite: '无限循环',
      condition: '条件判断',
    };
    return controlLabels[blockType.control] || blockType.control;
  }
}

/**
 * Get block type string from BlockType
 */
function getBlockTypeString(blockType: BlockType): string {
  if (blockType.type === 'action') {
    return blockType.action;
  } else {
    return blockType.control;
  }
}

/**
 * Get block category from BlockType
 */
function getBlockCategory(blockType: BlockType): 'action' | 'control' {
  return blockType.type;
}

/**
 * Convert BlockConfig to plain record for display
 */
function blockConfigToRecord(config: BlockConfig): Record<string, unknown> {
  return config as Record<string, unknown>;
}

/**
 * Create default block config based on block type
 */
function createDefaultConfig(type: string, category: string): BlockConfig {
  if (category === 'action') {
    switch (type) {
      case 'click':
        return { type: 'click', mode: { mode: 'coordinates', x: 0, y: 0 }, count: 1 };
      case 'wait_image':
        return { type: 'wait_image', imageId: '', timeoutMs: 5000 };
      case 'wait_time':
        return { type: 'wait_time', durationMs: 1000 };
      case 'input_text':
        return { type: 'input_text', text: '', intervalMs: 50 };
      default:
        return { type: 'wait_time', durationMs: 1000 };
    }
  } else {
    switch (type) {
      case 'loop':
        return { type: 'loop', count: 1 };
      case 'loop_infinite':
        return { type: 'loop_infinite' };
      case 'condition':
        return { type: 'condition', imageId: '', condition: 'image_exists', trueBranch: [], falseBranch: [] };
      default:
        return { type: 'loop', count: 1 };
    }
  }
}

/**
 * Create BlockType from type string and category
 */
function createBlockType(type: string, category: string): BlockType {
  if (category === 'action') {
    return { type: 'action', action: type as never };
  } else {
    return { type: 'control', control: type as never };
  }
}

function normalizeConfigFromEdges(
  config: BlockConfig,
  blockType: string,
  outgoingEdges: Edge[]
): BlockConfig {
  if (blockType === 'condition' && config.type === 'condition') {
    return {
      ...config,
      trueBranch: outgoingEdges
        .filter((edge) => edge.sourceHandle === 'true')
        .map((edge) => edge.target),
      falseBranch: outgoingEdges
        .filter((edge) => edge.sourceHandle === 'false')
        .map((edge) => edge.target),
    };
  }

  return config;
}

function resolveEntryBlock(flow: Flow, nodes: Node<BlockNodeData>[], edges: Edge[]): string | undefined {
  if (flow.entryBlock && nodes.some((node) => node.id === flow.entryBlock)) {
    return flow.entryBlock;
  }

  const incomingTargets = new Set(edges.map((edge) => edge.target));
  const rootNode = nodes.find((node) => !incomingTargets.has(node.id));
  return rootNode?.id ?? nodes[0]?.id;
}

function applyEntryPointFlag(nodes: Node<BlockNodeData>[], entryBlock?: string): Node<BlockNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isEntryPoint: node.id === entryBlock,
    },
  }));
}

function synchronizeNodeSemantics(
  nodes: Node<BlockNodeData>[],
  edges: Edge[],
  entryBlock?: string
): Node<BlockNodeData>[] {
  const normalizedNodes = nodes.map((node) => {
    const currentConfig = node.data.config as BlockConfig | undefined;
    if (!currentConfig) {
      return node;
    }

    const outgoingEdges = edges.filter((edge) => edge.source === node.id);
    const normalizedConfig = normalizeConfigFromEdges(currentConfig, node.data.blockType, outgoingEdges);

    if (normalizedConfig === currentConfig) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        config: normalizedConfig as Record<string, unknown>,
      },
    };
  });

  return applyEntryPointFlag(normalizedNodes, entryBlock);
}

export function buildCanonicalFlow(
  flow: Flow,
  nodes: Node<BlockNodeData>[],
  edges: Edge[]
): Flow {
  const canonicalFlow: Flow = {
    ...flow,
    blocks: {},
    connections: [],
  };

  canonicalFlow.entryBlock = resolveEntryBlock(canonicalFlow, nodes, edges);

  for (const node of nodes) {
    const blockType = createBlockType(
      node.data.blockType,
      node.data.blockCategory
    );
    const baseConfig = (node.data.config as BlockConfig) || createDefaultConfig(node.data.blockType, node.data.blockCategory);
    const outgoingEdges = edges.filter((edge) => edge.source === node.id);
    const config = normalizeConfigFromEdges(baseConfig, node.data.blockType, outgoingEdges);

    canonicalFlow.blocks[node.id] = {
      id: node.id,
      blockType,
      position: { x: node.position.x, y: node.position.y },
      config,
      children: [],
    };
  }

  for (const edge of edges) {
    canonicalFlow.connections.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
    });

    const sourceBlock = canonicalFlow.blocks[edge.source];
    if (sourceBlock && !sourceBlock.children.includes(edge.target)) {
      sourceBlock.children.push(edge.target);
    }
  }

  return canonicalFlow;
}

/**
 * useFlow Hook - 流程管理
 * Manages flow state and communicates with Tauri backend
 */
export function useFlow(options: UseFlowOptions = {}): UseFlowReturn {
  const { initialFlow, initialNodes = [], initialEdges = [] } = options;

  const [flow, setFlow] = useState<Flow | null>(initialFlow || null);
  const [nodes, setNodes] = useState<Node<BlockNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [flowList, setFlowList] = useState<FlowMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Track if we've initialized
  const initializedRef = useRef(false);

  // Load flow list
  const loadFlowList = useCallback(async () => {
    try {
      const list = await tauriListFlows();
      setFlowList(list);
    } catch (err) {
      console.error('Failed to load flow list:', err);
    }
  }, []);

  // Update undo/redo state when flow changes
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
      // Keep current state on error
    }
  }, [flow]);

  const refreshUndoRedoForFlow = useCallback(async (flowId: string) => {
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
  }, []);

  // Initialize flow list on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    loadFlowList();
  }, []);

  // Update undo/redo state periodically when flow is active
  useEffect(() => {
    updateUndoRedoState();
  }, [flow, updateUndoRedoState]);

  // Create a new flow
  const createFlow = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const newFlow = await tauriCreateFlow(name);
      setFlow(newFlow);
      setNodes([]);
      setEdges([]);
      setIsDirty(false);
      // Refresh flow list
      await loadFlowList();
      return newFlow;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loadFlowList]);

  // Save the current flow
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
      setNodes((currentNodes) => synchronizeNodeSemantics(currentNodes, edges, flowToSave.entryBlock));
      setIsDirty(false);
      
      // Refresh flow list
      await loadFlowList();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [edges, flow, loadFlowList, nodes]);

  // Load a flow by ID
  const loadFlow = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const loadedFlow = await tauriLoadFlow(id);
      setFlow(loadedFlow);

      // Convert connections to edges
      const loadedEdges: Edge[] = loadedFlow.connections.map((conn) =>
        connectionToEdge(conn)
      );

      // Convert blocks to nodes
      const loadedNodes: Node<BlockNodeData>[] = Object.values(loadedFlow.blocks).map((block) =>
        blockNodeToReactFlowNode(block, loadedFlow.entryBlock === block.id)
      );
      setNodes(synchronizeNodeSemantics(loadedNodes, loadedEdges, loadedFlow.entryBlock));
      setEdges(loadedEdges);
      setIsDirty(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loadFlowList]);

  // Delete a flow
  const deleteFlow = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await tauriDeleteFlow(id);
      
      // If we deleted the current flow, clear it
      if (flow?.id === id) {
        setFlow(null);
        setNodes([]);
        setEdges([]);
        setIsDirty(false);
      }
      
      // Refresh flow list
      await loadFlowList();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [flow, loadFlowList]);

  // Add a new node (block)
  const addNode = useCallback(async (
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

      // Add the new node to state
      const newNode = blockNodeToReactFlowNode(block, !flow?.entryBlock);
      setNodes((nds) => synchronizeNodeSemantics([...nds, newNode], edges, flow?.entryBlock ?? block.id));
      setIsDirty(true);
      await refreshUndoRedoForFlow(activeFlowId);

      return block.id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [flow]);

  // Update node position
  const updateNodePosition = useCallback(async (
    nodeId: string,
    position: { x: number; y: number }
  ): Promise<void> => {
    // Optimistically update UI
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, position }
          : node
      )
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
      // Don't throw for position updates - keep UI responsive
    }
  }, [flow, refreshUndoRedoForFlow]);

  // Update node config
  const updateNodeConfig = useCallback(async (
    nodeId: string,
    config: BlockConfig
  ): Promise<void> => {
    // Optimistically update UI
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
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [flow, refreshUndoRedoForFlow]);

  // Delete a node
  const deleteNode = useCallback(async (nodeId: string): Promise<void> => {
    // Optimistically update UI
    setNodes((nds) => {
      const nextNodes = nds.filter((node) => node.id !== nodeId);
      const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      const nextEntryBlock = flow?.entryBlock === nodeId ? nextNodes[0]?.id : flow?.entryBlock;
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
  }, [flow, refreshUndoRedoForFlow]);

  // Add a connection
  const addConnection = useCallback(async (connection: Connection): Promise<void> => {
    if (!flow) {
      throw new Error('请先创建或加载流程');
    }

    try {
      const createdConnection = await tauriCreateConnection(
        flow.id,
        connection.source!,
        connection.target!,
        connection.sourceHandle || undefined
      );
      setEdges((eds) => {
        const nextEdges = addEdge(connectionToEdge(createdConnection), eds);
        setNodes((nds) => synchronizeNodeSemantics(nds, nextEdges, flow.entryBlock));
        return nextEdges;
      });
      setIsDirty(true);
      await refreshUndoRedoForFlow(flow.id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [flow, refreshUndoRedoForFlow]);

  // Delete a connection
  const deleteConnection = useCallback(async (connectionId: string): Promise<void> => {
    // Optimistically update UI
    setEdges((eds) => {
      const nextEdges = eds.filter((edge) => edge.id !== connectionId);
      setNodes((nds) => synchronizeNodeSemantics(nds, nextEdges, flow?.entryBlock));
      return nextEdges;
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
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [flow, refreshUndoRedoForFlow]);

  const setEntryBlock = useCallback(async (nodeId: string | null): Promise<void> => {
    if (!flow) {
      console.warn('No flow to set entry block in');
      return;
    }

    const nextEntryBlock = nodeId ?? undefined;
    setFlow((currentFlow) => currentFlow ? { ...currentFlow, entryBlock: nextEntryBlock } : currentFlow);
    setNodes((currentNodes) => synchronizeNodeSemantics(currentNodes, edges, nextEntryBlock));
    setIsDirty(true);
  }, [edges, flow]);

  // Undo
  const undo = useCallback(async (): Promise<void> => {
    if (!flow) {
      console.warn('No flow to undo');
      return;
    }

    try {
      const result = await tauriUndo(flow.id);
      if (result) {
        setFlow(result);
        setNodes(synchronizeNodeSemantics(
          Object.values(result.blocks).map((block) => blockNodeToReactFlowNode(block, result.entryBlock === block.id)),
          result.connections.map(connectionToEdge),
          result.entryBlock
        ));
        setEdges(result.connections.map(connectionToEdge));
        setIsDirty(true);
        await updateUndoRedoState();
      }
    } catch (err) {
      console.error('Undo failed:', err);
    }
  }, [flow, updateUndoRedoState]);

  // Redo
  const redo = useCallback(async (): Promise<void> => {
    if (!flow) {
      console.warn('No flow to redo');
      return;
    }

    try {
      const result = await tauriRedo(flow.id);
      if (result) {
        setFlow(result);
        setNodes(synchronizeNodeSemantics(
          Object.values(result.blocks).map((block) => blockNodeToReactFlowNode(block, result.entryBlock === block.id)),
          result.connections.map(connectionToEdge),
          result.entryBlock
        ));
        setEdges(result.connections.map(connectionToEdge));
        setIsDirty(true);
        await updateUndoRedoState();
      }
    } catch (err) {
      console.error('Redo failed:', err);
    }
  }, [flow, updateUndoRedoState]);

  // Handle nodes change from ReactFlow
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      setNodes(nextNodes);
      
      // Handle position changes for persistence
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          // Only save on drag end
          updateNodePosition(change.id, change.position);
        }
      });
    },
    [nodes, updateNodePosition]
  );

  // Handle edges change from ReactFlow
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removalIds = new Set(
        changes
          .filter((change): change is EdgeChange & { type: 'remove'; id: string } => change.type === 'remove')
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
    [deleteConnection, edges]
  );

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
