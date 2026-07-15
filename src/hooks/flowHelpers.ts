/**
 * flowHelpers — 纯函数工具和共享类型
 * 从 useFlow.ts 提取，供各子 hook 复用，避免循环依赖。
 */

import { Node, Edge, Connection } from 'reactflow';
import type { BlockNodeData } from '../components/FlowEditor/BlockNode';
import { logRuntimeIssue } from '../tauri/logging';
import {
  type Flow as TauriFlow,
  type FlowMetadata,
  type BlockNode as TauriBlockNode,
  type BlockType,
  type BlockConfig,
  type BlockPosition,
  type Connection as TauriConnection,
} from '../tauri/flow';

// ─── Re-export types ────────────────────────────────────────────────

export type Flow = TauriFlow;
export type { 
  FlowMetadata, 
  TauriBlockNode, 
  BlockType, 
  BlockConfig, 
  BlockPosition,
  TauriConnection 
};

export interface UseFlowOptions {
  initialFlow?: Flow;
  initialNodes?: Node<BlockNodeData>[];
  initialEdges?: Edge[];
}

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
  handleNodesChange: (changes: import('reactflow').NodeChange[]) => void;
  handleEdgesChange: (changes: import('reactflow').EdgeChange[]) => void;
}

// ─── Label helpers ──────────────────────────────────────────────────

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

function getBlockTypeString(blockType: BlockType): string {
  if (blockType.type === 'action') {
    return blockType.action;
  } else {
    return blockType.control;
  }
}

function getBlockCategory(blockType: BlockType): 'action' | 'control' {
  return blockType.type;
}

// ─── Conversion helpers ─────────────────────────────────────────────

function createPlaceholderImageId(): string {
  return '00000000-0000-0000-0000-000000000000';
}

export function blockNodeToReactFlowNode(block: TauriBlockNode, isEntryPoint = false): Node<BlockNodeData> {
  const label = getNodeLabel(block.blockType);
  const blockTypeStr = getBlockTypeString(block.blockType);
  const blockCategory = getBlockCategory(block.blockType);

  return {
    id: block.id,
    type: 'blockNode',
    position: { x: block.position.x, y: block.position.y },
    data: {
      label,
      blockType: blockTypeStr as never,
      blockCategory,
      config: block.config as Record<string, unknown>,
      isEntryPoint,
      executing: false,
    },
  };
}

export function connectionToEdge(connection: TauriConnection): Edge {
  return {
    id: connection.id,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    type: 'smoothstep',
    animated: false,
  };
}

// ─── Block factory helpers ──────────────────────────────────────────

export function createDefaultConfig(type: string, category: string): BlockConfig {
  if (category === 'action') {
    switch (type) {
      case 'click':
        return { type: 'click', mode: { mode: 'coordinates', x: 0, y: 0 }, count: 1 };
      case 'wait_image':
        return { type: 'wait_image', imageId: createPlaceholderImageId(), timeoutMs: 5000 };
      case 'wait_time':
        return { type: 'wait_time', durationMs: 1000 };
      case 'input_text':
        return { type: 'input_text', text: '', intervalMs: 50 };
      case 'screenshot_assert':
        return { type: 'screenshot_assert', imageId: '', threshold: 0.0, strictMode: false };
      case 'text_extract':
        return { type: 'text_extract', imageId: '', language: 'chi_sim' };
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
        return { type: 'condition', imageId: createPlaceholderImageId(), condition: 'image_exists', trueBranch: [], falseBranch: [] };
      case 'text_check':
        return { type: 'text_check', imageId: '', keyword: '', trueBranch: [], falseBranch: [] };
      default:
        return { type: 'loop', count: 1 };
    }
  }
}

export function createBlockType(type: string, category: string): BlockType {
  if (category === 'action') {
    return { type: 'action', action: type as never };
  } else {
    return { type: 'control', control: type as never };
  }
}

// ─── Graph normalization ────────────────────────────────────────────

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

export function resolveEntryBlock(flow: Flow, nodes: Node<BlockNodeData>[], edges: Edge[]): string | undefined {
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

export function synchronizeNodeSemantics(
  nodes: Node<BlockNodeData>[],
  edges: Edge[],
  entryBlock?: string
): Node<BlockNodeData>[] {
  const normalizedNodes = nodes.map((node) => {
    const currentConfig = node.data.config as BlockConfig | undefined;
    if (!currentConfig) return node;
    const outgoingEdges = edges.filter((edge) => edge.source === node.id);
    const normalizedConfig = normalizeConfigFromEdges(currentConfig, node.data.blockType, outgoingEdges);
    if (normalizedConfig === currentConfig) return node;
    return {
      ...node,
      data: { ...node.data, config: normalizedConfig as Record<string, unknown> },
    };
  });
  return applyEntryPointFlag(normalizedNodes, entryBlock);
}

// ─── Logging ────────────────────────────────────────────────────────

export async function reportRuntimeIssue(source: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof Error && error.stack ? error.stack : undefined;
  try {
    await logRuntimeIssue({ source, message, details });
  } catch (loggingError) {
    console.error('Failed to write runtime issue log:', loggingError);
  }
}

// ─── Canonical flow builder ─────────────────────────────────────────

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
    const blockType = createBlockType(node.data.blockType, node.data.blockCategory);
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
