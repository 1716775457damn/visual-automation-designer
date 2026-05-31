/**
 * FlowCanvas - 流程画布组件
 * 基于 react-flow 实现流程编辑画布
 * 
 * Phase 4b: 拖放逻辑提取至 useDragDrop.ts，快捷键预留至 useCanvasShortcuts.ts。
 *
 * Validates: Requirements 2.1, 8.2, 2.2, 2.4, 2.5
 */

import { useCallback, useEffect, useRef, useState, useMemo, memo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  addEdge,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  ReactFlowInstance,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  ConnectionMode,
  Panel,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { BlockNode as CustomBlockNode } from './BlockNode';
import { ContextMenu, ContextMenuItem, ContextMenuContext } from './ContextMenu';
import { useDragDrop } from './useDragDrop';
import { useCanvasShortcuts } from './useCanvasShortcuts';
import styles from './FlowEditor.module.css';

// ── Module-level constants ─────────────────────────────────────────

const nodeTypes = { blockNode: CustomBlockNode };

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2, stroke: '#666' },
} as const;

const BLOCK_COLORS: Record<string, string> = {
  click: '#3b82f6',
  wait_image: '#60a5fa',
  wait_time: '#93c5fd',
  input_text: '#2563eb',
  loop: '#8b5cf6',
  loop_infinite: '#7c3aed',
  condition: '#a78bfa',
};

// ── Pure helpers ───────────────────────────────────────────────────

function getNodeColor(node: Node): string {
  const blockType = node.data?.blockType as string | undefined;
  return blockType && BLOCK_COLORS[blockType] ? BLOCK_COLORS[blockType] : '#94a3b8';
}

const PLACEMENT_IGNORE_SELECTOR = [
  '.react-flow__controls',
  '.react-flow__controls-button',
  '.react-flow__minimap',
  '.react-flow__panel',
  '.react-flow__handle',
  '.context-menu',
  '.flow-canvas__placement-preview',
].join(', ');

function shouldIgnorePlacementClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest(PLACEMENT_IGNORE_SELECTOR) !== null;
}

function getPlacementHintMessage(pendingPlacement?: { type: string; category: string } | null): string {
  if (!pendingPlacement) return '从工具箱拖拽积木块到画布';
  if (pendingPlacement.type === 'condition') {
    return '点击白板放置: condition · 提示：请只使用"真/假"分支，每个分支先连接 1 个直接节点';
  }
  if (pendingPlacement.type === 'loop' || pendingPlacement.type === 'loop_infinite') {
    return `点击白板放置: ${pendingPlacement.type} · 提示：循环体当前仅支持 1 个直接子节点`;
  }
  return `点击白板放置: ${pendingPlacement.type}`;
}

function toFlowPosition(instance: ReactFlowInstance, point: { x: number; y: number }) {
  return instance.screenToFlowPosition(point);
}

// ── Types ──────────────────────────────────────────────────────────

interface ClipboardState {
  type: 'node';
  data: Node;
}

interface CanvasPoint {
  x: number;
  y: number;
}

export interface FlowCanvasProps {
  nodes?: Node[];
  edges?: Edge[];
  nodeValidation?: Record<string, { severity: 'error' | 'warning'; message: string }>;
  focusedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (connection: Connection) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onSetEntryNode?: (nodeId: string | null) => void;
  onNodeConfig?: (nodeId: string) => void;
  onAddNode?: (type: string, category: string, position: { x: number; y: number }) => void;
  pendingPlacement?: { type: string; category: string } | null;
  onPlacePendingNode?: (position: { x: number; y: number }) => void;
  onViewportCenterReady?: (getCenter: () => { x: number; y: number } | null) => void;
  recentNodeId?: string | null;
  executingBlockId?: string | null;
}

// ── Component ──────────────────────────────────────────────────────

export const FlowCanvas = memo(function FlowCanvas({
  nodes: externalNodes,
  edges: externalEdges,
  nodeValidation,
  focusedNodeId,
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  onConnect: onConnectExternal,
  onNodeDelete,
  onEdgeDelete,
  onSetEntryNode,
  onNodeConfig,
  onAddNode,
  pendingPlacement,
  onPlacePendingNode,
  onViewportCenterReady,
  recentNodeId,
  executingBlockId,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // ── Internal state fallback ─────────────────────────────────────
  const [internalNodes, setInternalNodes] = useState<Node[]>([]);
  const [internalEdges, setInternalEdges] = useState<Edge[]>([]);

  // ── Drag-drop (Phase 4b extracted) ──────────────────────────────
  const { isDropActive, onDragOver, onDragLeave, onDrop } = useDragDrop({
    reactFlowInstance,
    reactFlowWrapper,
    externalNodes,
    onAddNode,
    setInternalNodes,
  });

  // ── Keyboard shortcuts (Phase 4b stub) ──────────────────────────
  useCanvasShortcuts();

  // ── Context menu & placement state ──────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuContext | null>(null);
  const [placementPreview, setPlacementPreview] = useState<CanvasPoint | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  const rafRef = useRef<number | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const pendingPlacementRef = useRef(pendingPlacement);

  // ── Derived nodes/edges ─────────────────────────────────────────
  const nodes = externalNodes !== undefined ? externalNodes : internalNodes;
  const edges = externalEdges !== undefined ? externalEdges : internalEdges;

  // ── Viewport center ─────────────────────────────────────────────
  useEffect(() => {
    if (!onViewportCenterReady) return;
    const getCenter = () => {
      if (!reactFlowInstance || !reactFlowWrapper.current) return null;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      return toFlowPosition(reactFlowInstance, {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
    };
    onViewportCenterReady(getCenter);
    return () => onViewportCenterReady(() => null);
  }, [onViewportCenterReady, reactFlowInstance]);

  // ── Nodes with executing state ──────────────────────────────────
  const nodesWithExecutingState = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        executing: executingBlockId === node.id,
        recent: recentNodeId === node.id,
        validationSeverity: nodeValidation?.[node.id]?.severity,
        validationMessage: nodeValidation?.[node.id]?.message,
      },
    }));
  }, [nodes, executingBlockId, nodeValidation, recentNodeId]);

  // ── Focused node centering ──────────────────────────────────────
  useEffect(() => {
    if (!focusedNodeId || !reactFlowInstance) return;
    const targetNode = nodes.find((n) => n.id === focusedNodeId);
    if (!targetNode) return;
    reactFlowInstance.setCenter(targetNode.position.x, targetNode.position.y, {
      zoom: 1.1,
      duration: 300,
    });
  }, [focusedNodeId, nodes, reactFlowInstance]);

  // ── Node/edge change handlers ───────────────────────────────────
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      if (externalNodes === undefined) setInternalNodes(nextNodes);
      onNodesChange?.(changes);
    },
    [nodes, externalNodes, onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      if (externalEdges === undefined) setInternalEdges(nextEdges);
      onEdgesChange?.(changes);
    },
    [edges, externalEdges, onEdgesChange]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = {
        ...connection,
        id: `edge-${Date.now()}`,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      if (externalEdges === undefined) setInternalEdges((eds) => addEdge(edge, eds));
      onConnectExternal?.(connection);
    },
    [externalEdges, onConnectExternal]
  );

  // ── Node click / pane click ─────────────────────────────────────
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => onNodeSelect?.(node.id),
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
    setContextMenu(null);
  }, [onNodeSelect]);

  // ── Placement click ─────────────────────────────────────────────
  const handlePlacementClick = useCallback(
    (clientX: number, clientY: number) => {
      if (!pendingPlacement || !onPlacePendingNode || !reactFlowInstance) return;
      const clickedPosition = toFlowPosition(reactFlowInstance, { x: clientX, y: clientY });
      setPlacementPreview(null);
      onPlacePendingNode(clickedPosition);
      setContextMenu(null);
    },
    [onPlacePendingNode, pendingPlacement, reactFlowInstance]
  );

  const onCanvasClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!pendingPlacement || event.button !== 0 || shouldIgnorePlacementClick(event.target)) return;
      event.preventDefault();
      handlePlacementClick(event.clientX, event.clientY);
    },
    [handlePlacementClick, pendingPlacement]
  );

  // ── Context menu handlers ───────────────────────────────────────
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ type: 'node', targetId: node.id, screenPosition: { x: event.clientX, y: event.clientY } });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({ type: 'edge', targetId: edge.id, screenPosition: { x: event.clientX, y: event.clientY } });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance || !reactFlowWrapper.current) return;
      const canvasPosition = toFlowPosition(reactFlowInstance, { x: event.clientX, y: event.clientY });
      setContextMenu({ type: 'canvas', canvasPosition, screenPosition: { x: event.clientX, y: event.clientY } });
    },
    [reactFlowInstance]
  );

  // ── Pane mouse move (throttled) ─────────────────────────────────
  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      mousePosRef.current = { x: event.clientX, y: event.clientY };
      if (!pendingPlacementRef.current || !reactFlowInstance || !reactFlowWrapper.current) {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setPlacementPreview(null);
        return;
      }
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const position = toFlowPosition(reactFlowInstance, { x: mousePosRef.current.x, y: mousePosRef.current.y });
        setPlacementPreview({ x: Math.round(position.x / 20) * 20, y: Math.round(position.y / 20) * 20 });
      });
    },
    [reactFlowInstance]
  );

  useEffect(() => {
    if (!pendingPlacement) setPlacementPreview(null);
    pendingPlacementRef.current = pendingPlacement;
  }, [pendingPlacement]);

  // ── Copy / paste ────────────────────────────────────────────────
  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) setClipboard({ type: 'node', data: JSON.parse(JSON.stringify(node)) });
    },
    [nodes]
  );

  const handlePasteNode = useCallback(() => {
    if (!clipboard || clipboard.type !== 'node' || !contextMenu?.canvasPosition) return;
    const newNode: Node = {
      ...clipboard.data,
      id: `node-${Date.now()}`,
      position: contextMenu.canvasPosition,
      data: { ...clipboard.data.data, executing: false },
    };
    if (externalNodes === undefined) setInternalNodes((nds) => [...nds, newNode]);
  }, [clipboard, contextMenu, externalNodes]);

  // ── Context menu items ──────────────────────────────────────────
  const nodeMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu?.targetId) return [];
    const nodeId = contextMenu.targetId;
    const node = nodes.find((item) => item.id === nodeId);
    const isEntryNode = node?.data?.isEntryPoint === true;
    return [
      { label: '编辑配置', icon: '⚙️', action: () => onNodeConfig?.(nodeId) },
      { label: '设为入口', icon: '🚀', action: () => onSetEntryNode?.(nodeId), disabled: isEntryNode },
      ...(isEntryNode ? [{ label: '清除入口', icon: '🛑', action: () => onSetEntryNode?.(null) }] : []),
      { label: '复制', icon: '📋', action: () => handleCopyNode(nodeId) },
      { label: '删除', icon: '🗑️', action: () => onNodeDelete?.(nodeId), danger: true },
    ];
  }, [contextMenu, handleCopyNode, nodes, onNodeConfig, onNodeDelete, onSetEntryNode]);

  const edgeMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu?.targetId) return [];
    return [{ label: '删除连接', icon: '🗑️', action: () => onEdgeDelete?.(contextMenu.targetId!), danger: true }];
  }, [contextMenu, onEdgeDelete]);

  const canvasMenuItems = useMemo((): ContextMenuItem[] => {
    const hasClipboard = clipboard !== null;
    return [
      {
        label: '添加积木块', icon: '➕',
        submenu: [
          { label: '点击', icon: '👆', action: () => onAddNode?.('click', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '等待图片', icon: '🔍', action: () => onAddNode?.('wait_image', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '等待时间', icon: '⏱️', action: () => onAddNode?.('wait_time', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '输入文本', icon: '⌨️', action: () => onAddNode?.('input_text', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '循环', icon: '🔄', action: () => onAddNode?.('loop', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '无限循环', icon: '♾️', action: () => onAddNode?.('loop_infinite', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
          { label: '条件判断', icon: '❓', action: () => onAddNode?.('condition', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }) },
        ],
      },
      { label: '粘贴', icon: '📋', action: handlePasteNode, disabled: !hasClipboard },
    ];
  }, [clipboard, contextMenu, onAddNode, handlePasteNode]);

  const currentMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    switch (contextMenu.type) {
      case 'node': return nodeMenuItems;
      case 'edge': return edgeMenuItems;
      case 'canvas': return canvasMenuItems;
      default: return [];
    }
  }, [contextMenu, nodeMenuItems, edgeMenuItems, canvasMenuItems]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div
      className={`${styles.flowCanvas} ${isDropActive ? styles.flowCanvasDropActive : ''} ${pendingPlacement ? styles.flowCanvasPlacementArmed : ''}`}
      ref={reactFlowWrapper}
      data-testid="flow-canvas"
      role="application"
      aria-label="自动化流程画布"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseDownCapture={onCanvasClickCapture}
      onClickCapture={onCanvasClickCapture}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodesWithExecutingState}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onPaneMouseMove={onPaneMouseMove}
          onInit={setReactFlowInstance}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          snapToGrid={true}
          snapGrid={[20, 20]}
          fitView
          attributionPosition="bottom-right"
        >
          <Controls />
          <MiniMap
            nodeColor={getNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
            position="bottom-right"
            style={{
              backgroundColor: 'var(--color-bg-elevated, var(--color-bg-primary))',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
            }}
            maskColor="rgba(0, 0, 0, 0.16)"
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Panel position="top-left">
            <div className={styles.flowCanvasHint}>{getPlacementHintMessage(pendingPlacement)}</div>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {contextMenu && currentMenuItems.length > 0 && (
        <ContextMenu
          position={contextMenu.screenPosition || { x: 0, y: 0 }}
          items={currentMenuItems}
          onClose={() => setContextMenu(null)}
          testId={`context-menu-${contextMenu.type}`}
        />
      )}

      {pendingPlacement && placementPreview && (
        <div
          className={styles.flowCanvasPlacementPreview}
          style={{ left: `${placementPreview.x}px`, top: `${placementPreview.y}px` }}
          aria-hidden="true"
        >
          <div className={styles.flowCanvasPlacementCore} />
          <div className={styles.flowCanvasPlacementRing} />
          <div className={styles.flowCanvasPlacementLabel}>放置</div>
        </div>
      )}
    </div>
  );
});

export default FlowCanvas;
