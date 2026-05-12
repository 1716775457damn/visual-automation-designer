/**
 * FlowCanvas - 流程画布组件
 * 基于 react-flow 实现流程编辑画布
 * 
 * Performance optimizations:
 * - React.memo for BlockNode (already implemented)
 * - useMemo for expensive computations
 * - useCallback for event handlers
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

// Custom node types - memoized to prevent recreation
const nodeTypes = {
  blockNode: CustomBlockNode,
};

// Default edge options with smoothstep type
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2, stroke: '#666' },
};

// Block labels lookup table - defined outside component to prevent recreation
const BLOCK_LABELS: Record<string, Record<string, string>> = {
  action: {
    click: '点击',
    wait_image: '等待图片',
    wait_time: '等待时间',
    input_text: '输入文本',
  },
  control: {
    loop: '循环',
    loop_infinite: '无限循环',
    condition: '条件判断',
  },
};

// Block colors for MiniMap - action blocks are blue, control blocks are purple
const BLOCK_COLORS: Record<string, string> = {
  click: '#3b82f6', // blue-500
  wait_image: '#60a5fa', // blue-400
  wait_time: '#93c5fd', // blue-300
  input_text: '#2563eb', // blue-600
  loop: '#8b5cf6', // violet-500
  loop_infinite: '#7c3aed', // violet-600
  condition: '#a78bfa', // violet-400
};

/**
 * Get block label by type and category
 */
function getBlockLabel(blockType: string, blockCategory: string): string {
  return BLOCK_LABELS[blockCategory]?.[blockType] || blockType;
}

/**
 * Get node color for MiniMap based on block type
 * Validates: Requirements 2.1
 */
function getNodeColor(node: Node): string {
  const blockType = node.data?.blockType as string | undefined;
  if (blockType && BLOCK_COLORS[blockType]) {
    return BLOCK_COLORS[blockType];
  }
  // Default color for unknown block types
  return '#94a3b8'; // slate-400
}

/**
 * Clipboard state for copy/paste functionality
 */
interface ClipboardState {
  type: 'node';
  data: Node;
}

export interface FlowCanvasProps {
  nodes?: Node[];
  edges?: Edge[];
  onNodeSelect?: (nodeId: string | null) => void;
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (connection: Connection) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onNodeConfig?: (nodeId: string) => void;
  onAddNode?: (type: string, category: string, position: { x: number; y: number }) => void;
  pendingPlacement?: { type: string; category: string } | null;
  onPlacePendingNode?: (position: { x: number; y: number }) => void;
  onViewportCenterReady?: (getCenter: () => { x: number; y: number } | null) => void;
  executingBlockId?: string | null;
}

/**
 * FlowCanvas 组件 - 流程编辑的主画布区域
 * 集成 react-flow 提供拖拽、缩放、平移功能
 */
export const FlowCanvas = memo(function FlowCanvas({
  nodes: externalNodes,
  edges: externalEdges,
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  onConnect: onConnectExternal,
  onNodeDelete,
  onEdgeDelete,
  onNodeConfig,
  onAddNode,
  pendingPlacement,
  onPlacePendingNode,
  onViewportCenterReady,
  executingBlockId,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Internal state for when nodes/edges are not provided externally
  const [internalNodes, setInternalNodes] = useState<Node[]>([]);
  const [internalEdges, setInternalEdges] = useState<Edge[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuContext | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);

  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // Use external state if provided, otherwise use internal state
  const nodes = externalNodes !== undefined ? externalNodes : internalNodes;
  const edges = externalEdges !== undefined ? externalEdges : internalEdges;

  useEffect(() => {
    if (!onViewportCenterReady) {
      return;
    }

    const getCenter = () => {
      if (!reactFlowInstance || !reactFlowWrapper.current) {
        return null;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      return reactFlowInstance.project({
        x: bounds.width / 2,
        y: bounds.height / 2,
      });
    };

    onViewportCenterReady(getCenter);

    return () => onViewportCenterReady(() => null);
  }, [onViewportCenterReady, reactFlowInstance]);

  // Memoized nodes with executing state - prevents unnecessary re-renders
  const nodesWithExecutingState = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        executing: executingBlockId === node.id,
      },
    }));
  }, [nodes, executingBlockId]);

  // Handle node changes - memoized
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      if (externalNodes === undefined) {
        setInternalNodes(nextNodes);
      }
      onNodesChange?.(changes);
    },
    [nodes, externalNodes, onNodesChange]
  );

  // Handle edge changes - memoized
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      if (externalEdges === undefined) {
        setInternalEdges(nextEdges);
      }
      onEdgesChange?.(changes);
    },
    [edges, externalEdges, onEdgesChange]
  );

  // Handle new connections - memoized
  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = {
        ...connection,
        id: `edge-${Date.now()}`,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      
      if (externalEdges === undefined) {
        setInternalEdges((eds) => addEdge(edge, eds));
      }
      
      onConnectExternal?.(connection);
    },
    [externalEdges, onConnectExternal]
  );

  // Handle node click for selection - memoized
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect]
  );

  // Handle pane click to deselect - memoized
  const onPaneClick = useCallback(() => {
    if (pendingPlacement && onPlacePendingNode && reactFlowInstance && reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const centeredPosition = reactFlowInstance.project({
        x: bounds.width / 2,
        y: bounds.height / 2,
      });
      onPlacePendingNode(centeredPosition);
      return;
    }

    onNodeSelect?.(null);
    setContextMenu(null);
  }, [onNodeSelect, onPlacePendingNode, pendingPlacement, reactFlowInstance]);

  // Handle drag over - memoized
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!isDropActive) {
      setIsDropActive(true);
    }
  }, [isDropActive]);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget === event.target) {
      setIsDropActive(false);
    }
  }, []);

  const parseDropPayload = useCallback((event: React.DragEvent) => {
    const blockType = event.dataTransfer.getData('blockType');
    const blockCategory = event.dataTransfer.getData('blockCategory');

    if (blockType) {
      return { blockType, blockCategory };
    }

    const fallback = event.dataTransfer.getData('text/plain');
    if (!fallback) {
      return null;
    }

    try {
      const parsed = JSON.parse(fallback) as { blockType?: string; blockCategory?: string };
      if (!parsed.blockType) {
        return null;
      }

      return {
        blockType: parsed.blockType,
        blockCategory: parsed.blockCategory ?? '',
      };
    } catch {
      return null;
    }
  }, []);

  // Handle drop from toolbox - memoized
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDropActive(false);

      const payload = parseDropPayload(event);
      const blockType = payload?.blockType ?? '';
      const blockCategory = payload?.blockCategory ?? '';

      if (!blockType) {
        return;
      }

      if (!reactFlowInstance) {
        console.warn('No reactFlowInstance');
        return;
      }

      if (!reactFlowWrapper.current) {
        console.warn('No reactFlowWrapper');
        return;
      }

      // Get drop position
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Snap to grid (20px)
      const snappedPosition = {
        x: Math.round(position.x / 20) * 20,
        y: Math.round(position.y / 20) * 20,
      };

      // If onAddNode callback is provided, use it (this will call the backend)
      if (onAddNode) {
        onAddNode(blockType, blockCategory, snappedPosition);
      } else {
        // Fallback: Create new node locally
        const newNode: Node = {
          id: `node-${Date.now()}`,
          type: 'blockNode',
          position: snappedPosition,
          data: {
            label: getBlockLabel(blockType, blockCategory),
            blockType,
            blockCategory,
            config: {},
            executing: false,
          },
        };

        if (externalNodes === undefined) {
          setInternalNodes((nds) => [...nds, newNode]);
        }
      }
    },
    [reactFlowInstance, externalNodes, onAddNode, parseDropPayload]
  );

  // Handle right-click on node - memoized
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        type: 'node',
        targetId: node.id,
        // Store screen position for menu rendering
        screenPosition: { x: event.clientX, y: event.clientY },
      });
    },
    []
  );

  // Handle right-click on edge - memoized
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        type: 'edge',
        targetId: edge.id,
        // Store screen position for menu rendering
        screenPosition: { x: event.clientX, y: event.clientY },
      });
    },
    []
  );

  // Handle right-click on canvas (pane) - memoized
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      
      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      // Get click position in canvas coordinates
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const canvasPosition = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      setContextMenu({
        type: 'canvas',
        canvasPosition,
        // Store screen position for menu rendering
        screenPosition: { x: event.clientX, y: event.clientY },
      });
    },
    [reactFlowInstance]
  );

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!pendingPlacement || !onPlacePendingNode || !reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      if ((event.buttons & 1) !== 1) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      onPlacePendingNode(position);
    },
    [onPlacePendingNode, pendingPlacement, reactFlowInstance]
  );

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle node copy
  const handleCopyNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setClipboard({ type: 'node', data: JSON.parse(JSON.stringify(node)) });
    }
  }, [nodes]);

  // Handle node paste
  const handlePasteNode = useCallback(() => {
    if (!clipboard || clipboard.type !== 'node' || !contextMenu?.canvasPosition) return;

    const newNode: Node = {
      ...clipboard.data,
      id: `node-${Date.now()}`,
      position: contextMenu.canvasPosition,
      data: {
        ...clipboard.data.data,
        executing: false,
      },
    };

    if (externalNodes === undefined) {
      setInternalNodes((nds) => [...nds, newNode]);
    }
  }, [clipboard, contextMenu, externalNodes]);

  // Build node context menu items
  const nodeMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu?.targetId) return [];

    const nodeId = contextMenu.targetId;

    return [
      {
        label: '编辑配置',
        icon: '⚙️',
        action: () => onNodeConfig?.(nodeId),
      },
      {
        label: '复制',
        icon: '📋',
        action: () => handleCopyNode(nodeId),
      },
      {
        label: '删除',
        icon: '🗑️',
        action: () => onNodeDelete?.(nodeId),
        danger: true,
      },
    ];
  }, [contextMenu, onNodeConfig, onNodeDelete, handleCopyNode]);

  // Build edge context menu items
  const edgeMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu?.targetId) return [];

    return [
      {
        label: '删除连接',
        icon: '🗑️',
        action: () => onEdgeDelete?.(contextMenu.targetId!),
        danger: true,
      },
    ];
  }, [contextMenu, onEdgeDelete]);

  // Build canvas context menu items
  const canvasMenuItems = useMemo((): ContextMenuItem[] => {
    const hasClipboard = clipboard !== null;

    return [
      {
        label: '添加积木块',
        icon: '➕',
        submenu: [
          {
            label: '点击',
            icon: '👆',
            action: () => onAddNode?.('click', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '等待图片',
            icon: '🔍',
            action: () => onAddNode?.('wait_image', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '等待时间',
            icon: '⏱️',
            action: () => onAddNode?.('wait_time', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '输入文本',
            icon: '⌨️',
            action: () => onAddNode?.('input_text', 'action', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '循环',
            icon: '🔄',
            action: () => onAddNode?.('loop', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '无限循环',
            icon: '♾️',
            action: () => onAddNode?.('loop_infinite', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
          {
            label: '条件判断',
            icon: '❓',
            action: () => onAddNode?.('condition', 'control', contextMenu?.canvasPosition || { x: 0, y: 0 }),
          },
        ],
      },
      {
        label: '粘贴',
        icon: '📋',
        action: handlePasteNode,
        disabled: !hasClipboard,
      },
    ];
  }, [clipboard, contextMenu, onAddNode, handlePasteNode]);

  // Get current menu items based on context
  const currentMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    switch (contextMenu.type) {
      case 'node':
        return nodeMenuItems;
      case 'edge':
        return edgeMenuItems;
      case 'canvas':
        return canvasMenuItems;
      default:
        return [];
    }
  }, [contextMenu, nodeMenuItems, edgeMenuItems, canvasMenuItems]);

  return (
    <div 
      className={`flow-canvas ${isDropActive ? 'flow-canvas--drop-active' : ''} ${pendingPlacement ? 'flow-canvas--placement-armed' : ''}`}
      ref={reactFlowWrapper} 
      data-testid="flow-canvas"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            <div className="flow-canvas__hint">
              {pendingPlacement ? `点击白板放置: ${pendingPlacement.type}` : '从工具箱拖拽积木块到画布'}
            </div>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {/* Context Menu */}
      {contextMenu && currentMenuItems.length > 0 && (
        <ContextMenu
          position={contextMenu.screenPosition || { x: 0, y: 0 }}
          items={currentMenuItems}
          onClose={closeContextMenu}
          testId={`context-menu-${contextMenu.type}`}
        />
      )}
    </div>
  );
});

export default FlowCanvas;
