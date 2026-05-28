import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Connection } from 'reactflow';
import './App.css';
import './styles/index.css';
import { FlowListModal, NewFlowDialog, ShortcutCheatsheet, StatusBar } from './components/App';
import { FlowCanvas, FlowToolbar } from './components/FlowEditor';
import { ExecutionLog, executionEventToLogEntry } from './components/ExecutionStatus';
import { Toolbox } from './components/BlockToolbox';
import { BlockConfig } from './components/ConfigPanel';
import { ConfirmDialog, ToastProvider, useToast } from './components/common';
import { useFlow, useExecution, useKeyboardShortcuts, useTheme, buildCanonicalFlow } from './hooks';
import type { InternalExecutionEvent } from './hooks/useExecution';
import type { Flow as TauriFlow, ValidationErrorResponse } from './tauri/flow';
import { validateFlow } from './tauri/flow';
import { formatValidationResponse } from './validation/formatValidationMessage';
import { getConnectionGuardValidation } from './validation/connectionGuards';

type PendingUnsavedAction =
  | { type: 'load_flow'; flowId: string }
  | { type: 'create_flow_dialog' };

type PendingPlacement = { type: string; category: string };

const ONBOARDING_DISMISSED_KEY = 'vad-onboarding-dismissed';
const LOG_COLLAPSED_STORAGE_KEY = 'vad-log-collapsed';
const LOG_HEIGHT_STORAGE_KEY = 'vad-log-height';
const DEFAULT_LOG_HEIGHT = 240;

function isInputLikeElement(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;

  if (!element) {
    return false;
  }

  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable;
}

function AppContent() {
  // UX优化103: 主题管理
  const { mode: themeMode, toggleTheme } = useTheme();

  // UX优化121: 日志面板折叠状态
  const [logCollapsed, setLogCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(LOG_COLLAPSED_STORAGE_KEY) === 'true';
  });
  const [logHeight, setLogHeight] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_LOG_HEIGHT;
    }

    const savedHeight = Number(window.localStorage.getItem(LOG_HEIGHT_STORAGE_KEY));
    return Number.isFinite(savedHeight) && savedHeight >= 140 && savedHeight <= 520
      ? savedHeight
      : DEFAULT_LOG_HEIGHT;
  });
  const logResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // UX优化124: 快捷键帮助面板
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  const {
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
    addNode,
    addConnection,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteNode,
    deleteConnection,
    setEntryBlock,
    handleNodesChange,
    handleEdgesChange,
    updateNodeConfig,
  } = useFlow();

  const { showToast } = useToast();

  // Use the enhanced execution hook
  const {
    status: executionStatus,
    currentBlockId,
    executionLog,
    errorMessage,
    setExecutionState,
    runtimeSelfCheck,
    executeFlow: tauriExecuteFlow,
    pauseExecution,
    resumeExecution,
    stopExecution,
    stepExecution,
    clearLog,
    completedBlocks,
    resetProgress,
  } = useExecution();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showFlowList, setShowFlowList] = useState(false);
  const [flowPendingDelete, setFlowPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [showNewFlowDialog, setShowNewFlowDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<PendingUnsavedAction | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [recentNodeId, setRecentNodeId] = useState<string | null>(null);
  const [flowValidationErrors, setFlowValidationErrors] = useState<ValidationErrorResponse[]>([]);
  const [flowValidationWarnings, setFlowValidationWarnings] = useState<ValidationErrorResponse[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== 'true';
  });
  const viewportCenterRef = useRef<(() => { x: number; y: number } | null) | null>(null);

  const [focusedValidationNodeId, setFocusedValidationNodeId] = useState<string | null>(null);
  const [frontendRuntimeEvents, setFrontendRuntimeEvents] = useState<InternalExecutionEvent[]>([]);

  const buildQuickFlowName = useCallback(() => `快速流程_${new Date().toLocaleDateString()}`, []);
  const buildDialogFlowName = useCallback(() => `新流程_${new Date().toLocaleDateString()}`, []);

  const ensureFlowForEditing = useCallback(async () => {
    if (flow) {
      return flow.id;
    }

    const createdFlow = await createFlow(buildQuickFlowName());
    showToast('info', '已自动创建流程，可直接开始搭建');
    return createdFlow.id;
  }, [buildQuickFlowName, createFlow, flow, showToast]);

  // Determine execution states
  const isExecuting = executionStatus === 'running' || executionStatus === 'paused';
  const isPaused = executionStatus === 'paused';
  const hasFlow = flow !== null;
  const hasSelection = selectedNodeId !== null;

  // Convert execution log entries to log entries for display
  const mergedExecutionLog = useMemo(
    () => [...executionLog, ...frontendRuntimeEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    [executionLog, frontendRuntimeEvents]
  );

  const logEntries = mergedExecutionLog.map((event, index) =>
    executionEventToLogEntry(event, index)
  );

  const formattedFlowValidationErrors = useMemo(
    () => flowValidationErrors.map(formatValidationResponse),
    [flowValidationErrors]
  );
  const formattedFlowValidationWarnings = useMemo(
    () => flowValidationWarnings.map(formatValidationResponse),
    [flowValidationWarnings]
  );

  const primaryFlowValidationError = formattedFlowValidationErrors[0] ?? null;
  const primaryFlowValidationWarning = formattedFlowValidationWarnings[0] ?? null;

  const validationByNodeId = useMemo(() => {
    const entries: Record<string, { severity: 'error' | 'warning'; message: string }> = {};

    for (const validation of formattedFlowValidationWarnings) {
      if (!validation.blockId || entries[validation.blockId]) {
        continue;
      }

      entries[validation.blockId] = {
        severity: 'warning',
        message: validation.message,
      };
    }

    for (const validation of formattedFlowValidationErrors) {
      if (!validation.blockId) {
        continue;
      }

      entries[validation.blockId] = {
        severity: 'error',
        message: validation.message,
      };
    }

    return entries;
  }, [formattedFlowValidationErrors, formattedFlowValidationWarnings]);

  const selectedNodeValidation = selectedNodeId ? validationByNodeId[selectedNodeId] ?? null : null;

  const validationItems = useMemo(() => {
    const items = [
      ...formattedFlowValidationErrors.map((validation, index) => ({
        id: `error-${validation.code}-${validation.blockId ?? 'global'}-${index}`,
        severity: 'error' as const,
        message: validation.message,
        blockId: validation.blockId ?? null,
      })),
      ...formattedFlowValidationWarnings.map((validation, index) => ({
        id: `warning-${validation.code}-${validation.blockId ?? 'global'}-${index}`,
        severity: 'warning' as const,
        message: validation.message,
        blockId: validation.blockId ?? null,
      })),
    ];

    return items;
  }, [formattedFlowValidationErrors, formattedFlowValidationWarnings]);

  const handleSelectValidationBlock = useCallback((blockId: string | null) => {
    if (!blockId) {
      return;
    }

    setSelectedNodeId(blockId);
    setFocusedValidationNodeId(blockId);
  }, []);

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setFocusedValidationNodeId((current) => (nodeId === current ? null : current));
  }, []);

  const getQuickAddPosition = useCallback(() => {
    const viewportCenter = viewportCenterRef.current?.();
    if (viewportCenter) {
      return {
        x: Math.round(viewportCenter.x / 20) * 20,
        y: Math.round(viewportCenter.y / 20) * 20,
      };
    }

    const nodeIndex = nodes.length;
    return {
      x: 160 + (nodeIndex % 4) * 180,
      y: 80 + Math.floor(nodeIndex / 4) * 110,
    };
  }, [nodes.length]);

  const openNewFlowDialog = useCallback(() => {
    if (isDirty) {
      setPendingUnsavedAction({ type: 'create_flow_dialog' });
      return;
    }

    setNewFlowName(buildDialogFlowName());
    setShowNewFlowDialog(true);
  }, [buildDialogFlowName, isDirty]);

  const proceedWithNewFlowDialog = useCallback(() => {
    setNewFlowName(buildDialogFlowName());
    setShowNewFlowDialog(true);
  }, [buildDialogFlowName]);

  const createFlowWithFeedback = useCallback(async (name: string, errorLabel: string) => {
    try {
      const createdFlow = await createFlow(name);
      showToast('success', '流程已创建');
      return createdFlow;
    } catch (err) {
      console.error(errorLabel, err);
      showToast('error', '创建失败');
      return null;
    }
  }, [createFlow, showToast]);

  const createQuickFlow = useCallback(async () => {
    await createFlowWithFeedback(buildQuickFlowName(), 'Failed to create quick flow:');
  }, [buildQuickFlowName, createFlowWithFeedback]);

  // Get selected node data for config panel
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(node => node.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  // Handle config save from BlockConfig component
  const handleConfigSave = useCallback(async (config: Record<string, unknown>) => {
    if (!selectedNodeId) return;

    try {
      // The config from BlockConfig already includes the 'type' field
      await updateNodeConfig(selectedNodeId, config as never);
      showToast('success', '配置已保存');
    } catch (err) {
      console.error('Failed to save config:', err);
      showToast('error', '配置保存失败');
    }
  }, [selectedNodeId, updateNodeConfig, showToast]);

  // Handle config cancel
  const handleConfigCancel = useCallback(() => {
    // Just deselect the node
    setSelectedNodeId(null);
  }, []);

  // Handle connection from FlowCanvas
  const handleConnect = useCallback(async (connection: Connection) => {
    const guardValidation = getConnectionGuardValidation(connection, nodes, edges);
    if (guardValidation) {
      setFlowValidationErrors([guardValidation]);
      showToast('warning', guardValidation.message);
      return;
    }

    try {
      await addConnection(connection);
      setFlowValidationErrors((current) => {
        const blockingCodes = new Set([
          'CONDITION_DEFAULT_OUTGOING_UNSUPPORTED',
          'CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED',
          'LOOP_SUBCHAIN_UNSUPPORTED',
        ]);

        return current.filter((validation) => !blockingCodes.has(validation.code));
      });
    } catch (err) {
      console.error('Failed to add connection:', err);
      showToast('error', err instanceof Error ? err.message : '连接创建失败');
    }
  }, [addConnection, edges, nodes, showToast]);

  const handleAddNode = useCallback(async (type: string, category: string, position: { x: number; y: number }) => {
    try {
      const flowId = await ensureFlowForEditing();
      const nodeId = await addNode(type, category, position, undefined, flowId);
      setSelectedNodeId(nodeId);
      setRecentNodeId(nodeId);
      return nodeId;
    } catch (err) {
      console.error('Failed to add node:', err);
      showToast('warning', err instanceof Error ? err.message : '添加节点失败');
      return null;
    }
  }, [addNode, ensureFlowForEditing, showToast]);

  const handleToolboxSelect = useCallback((type: string, category: string) => {
    const addNodeFromToolbox = async () => {
      setPendingPlacement(null);
      const nodeId = await handleAddNode(type, category, getQuickAddPosition());
      if (nodeId) {
        showToast('info', `${type} 已添加到当前视口`);
      }
    };

    void addNodeFromToolbox();
  }, [getQuickAddPosition, handleAddNode, showToast]);

  const handleArmPlacement = useCallback((type: string, category: string) => {
    const activatePlacement = async () => {
      try {
        await ensureFlowForEditing();
        setPendingPlacement({ type, category });
        showToast('info', `精确放置已开启：点击白板放置 ${type}`);
      } catch (err) {
        console.error('Failed to arm placement mode:', err);
        showToast('error', '无法开启精确放置模式');
      }
    };

    void activatePlacement();
  }, [ensureFlowForEditing, showToast]);

  const handleCancelPlacement = useCallback(() => {
    setPendingPlacement(null);
    showToast('info', '已取消精确放置模式');
  }, [showToast]);

  const handleDismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
  }, []);

  const handleToggleLogCollapsed = useCallback(() => {
    setLogCollapsed((current) => !current);
  }, []);

  const handleClearExecutionLog = useCallback(() => {
    clearLog();
    showToast('info', '执行日志已清空');
  }, [clearLog, showToast]);

  const handleLogResizeStart = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setLogCollapsed(false);
    logResizeStateRef.current = {
      startY: event.clientY,
      startHeight: logHeight,
    };
  }, [logHeight]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (!event.message) {
        return;
      }

      setFrontendRuntimeEvents((current) => [
        ...current,
        {
          type: 'block_error',
          source: 'frontend',
          error: event.message,
          timestamp: new Date(),
        },
      ]);
      showToast('error', `[前端异常] ${event.message}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message) {
        return;
      }

      setFrontendRuntimeEvents((current) => [
        ...current,
        {
          type: 'block_error',
          source: 'frontend',
          error: message,
          timestamp: new Date(),
        },
      ]);
      showToast('error', `[前端异常] ${message}`);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [showToast]);

  useEffect(() => {
    window.localStorage.setItem(LOG_COLLAPSED_STORAGE_KEY, String(logCollapsed));
  }, [logCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(LOG_HEIGHT_STORAGE_KEY, String(logHeight));
  }, [logHeight]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!logResizeStateRef.current) {
        return;
      }

      const deltaY = logResizeStateRef.current.startY - event.clientY;
      const nextHeight = Math.min(520, Math.max(140, logResizeStateRef.current.startHeight + deltaY));
      setLogHeight(nextHeight);
    };

    const handlePointerUp = () => {
      logResizeStateRef.current = null;
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, []);

  const handlePlacePendingNode = useCallback((position: { x: number; y: number }) => {
    if (!pendingPlacement) {
      return;
    }

    const snappedPosition = {
      x: Math.round(position.x / 20) * 20,
      y: Math.round(position.y / 20) * 20,
    };

    const { type, category } = pendingPlacement;
    setPendingPlacement(null);

    const placeNode = async () => {
      const nodeId = await handleAddNode(type, category, snappedPosition);
      if (nodeId) {
        showToast('success', `${type} 已放置到白板`);
      }
    };

    void placeNode();
  }, [handleAddNode, pendingPlacement, showToast]);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    try {
      await deleteNode(nodeId);
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    } catch (err) {
      console.error('Failed to delete node:', err);
      showToast('error', '删除节点失败');
    }
  }, [deleteNode, showToast]);

  const handleDeleteEdge = useCallback(async (edgeId: string) => {
    try {
      await deleteConnection(edgeId);
    } catch (err) {
      console.error('Failed to delete connection:', err);
      showToast('error', '删除连接失败');
    }
  }, [deleteConnection, showToast]);

  const buildCurrentFlowForValidation = useCallback((): TauriFlow | null => {
    if (!flow) {
      return null;
    }

    return buildCanonicalFlow(flow, nodes, edges);
  }, [edges, flow, nodes]);

  const validateBeforeExecution = useCallback(async () => {
    const runtimeCheck = await runtimeSelfCheck();
    if (!runtimeCheck.ok) {
      setExecutionState('validation_blocked', runtimeCheck.message);
      throw new Error(runtimeCheck.message);
    }

    const currentFlow = buildCurrentFlowForValidation();
    if (!currentFlow) {
      return true;
    }

    const validation = await validateFlow(currentFlow);
      setFlowValidationErrors(validation.errors);
      setFlowValidationWarnings(validation.warnings);
    if (!validation.isValid && validation.errors.length > 0) {
      const formattedError = formatValidationResponse(validation.errors[0]);
      setExecutionState('validation_blocked', formattedError.message);
      throw new Error(formattedError.message);
    }

    return true;
  }, [buildCurrentFlowForValidation, runtimeSelfCheck, setExecutionState]);

  const refreshValidationState = useCallback(async () => {
    const currentFlow = buildCurrentFlowForValidation();
    if (!currentFlow) {
      setFlowValidationErrors([]);
      setFlowValidationWarnings([]);
      return;
    }

    const validation = await validateFlow(currentFlow);
    setFlowValidationErrors(validation.errors);
    setFlowValidationWarnings(validation.warnings);
  }, [buildCurrentFlowForValidation]);

  useEffect(() => {
    if (!flow) {
      setFlowValidationErrors([]);
      setFlowValidationWarnings([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshValidationState();
    }, isDirty ? 180 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [flow, edges, isDirty, nodes, refreshValidationState]);

  const handleSetEntryNode = useCallback(async (nodeId: string | null) => {
    try {
      await setEntryBlock(nodeId);
      showToast('success', nodeId ? '已设为入口节点' : '已清除入口节点');
    } catch (err) {
      console.error('Failed to set/clear entry block:', err);
      showToast('error', '操作入口节点失败');
    }
  }, [setEntryBlock, showToast]);

  // Handle execution controls
  const handleExecute = useCallback(async () => {
    if (!flow) {
      showToast('warning', '请先创建或加载流程');
      return;
    }
    try {
      if (isDirty) {
        await saveFlow();
      }
      await validateBeforeExecution();
      resetProgress(nodes.length);
      await tauriExecuteFlow(flow.id);
      showToast('info', '开始执行流程');
    } catch (err) {
      console.error('Failed to execute flow:', err);
      showToast('error', '执行失败');
    }
  }, [flow, isDirty, nodes.length, resetProgress, saveFlow, tauriExecuteFlow, showToast, validateBeforeExecution]);

  const handlePause = useCallback(() => {
    if (executionStatus === 'paused') {
      resumeExecution();
    } else {
      pauseExecution();
    }
  }, [executionStatus, pauseExecution, resumeExecution]);

  const handleStop = useCallback(() => {
    stopExecution();
    clearLog();
    setExecutionState('stopped', '执行已停止');
  }, [clearLog, setExecutionState, stopExecution]);

  const handleStep = useCallback(async () => {
    if (!flow) {
      showToast('warning', '没有可执行的流程');
      return;
    }
    try {
      if (isDirty) {
        await saveFlow();
      }
      await validateBeforeExecution();
      resetProgress(nodes.length);
      await stepExecution(flow.id);
    } catch (err) {
      console.error('Failed to step execution:', err);
      showToast('error', '单步执行失败');
    }
  }, [flow, isDirty, nodes.length, resetProgress, saveFlow, showToast, stepExecution, validateBeforeExecution]);

  const handleSave = useCallback(async () => {
    if (!flow) {
      showToast('warning', '没有可保存的流程');
      return;
    }
    try {
      await saveFlow();
      await refreshValidationState();
      showToast('success', '流程已保存');
    } catch (err) {
      console.error('Failed to save flow:', err);
      showToast('error', '保存失败');
    }
  }, [flow, refreshValidationState, saveFlow, showToast]);

  const handleLoad = useCallback(async () => {
    // Toggle flow list display
    setShowFlowList((prev) => !prev);

    // Refresh flow list
    try {
      await loadFlowList();
    } catch (err) {
      console.error('Failed to load flow list:', err);
    }
  }, [loadFlowList]);

  const handleLoadFlowById = useCallback(async (id: string) => {
    if (isDirty && flow?.id !== id) {
      setPendingUnsavedAction({ type: 'load_flow', flowId: id });
      return;
    }

    try {
      await loadFlow(id);
      setShowFlowList(false);
      showToast('success', '流程已加载');
    } catch (err) {
      console.error('Failed to load flow:', err);
      showToast('error', '加载失败');
    }
  }, [flow?.id, isDirty, loadFlow, showToast]);

  const handleDeleteFlowById = useCallback(async (id: string) => {
    const flowMeta = flowList.find((meta) => meta.id === id);
    setFlowPendingDelete({ id, name: flowMeta?.name ?? '此流程' });
  }, [flowList]);

  const confirmDeleteFlow = useCallback(async () => {
    if (!flowPendingDelete) {
      return;
    }

    try {
      await deleteFlow(flowPendingDelete.id);
      setFlowPendingDelete(null);
      showToast('success', '流程已删除');
    } catch (err) {
      console.error('Failed to delete flow:', err);
      showToast('error', '删除失败');
    }
  }, [deleteFlow, flowPendingDelete, showToast]);

  const cancelDeleteFlow = useCallback(() => {
    setFlowPendingDelete(null);
  }, []);

  const handleCreateFlow = useCallback(async () => {
    const trimmedName = newFlowName.trim();
    if (!trimmedName) {
      showToast('warning', '请输入流程名称');
      return;
    }

    const createdFlow = await createFlowWithFeedback(trimmedName, 'Failed to create flow:');
    if (createdFlow) {
      setShowNewFlowDialog(false);
      setNewFlowName('');
    }
  }, [createFlowWithFeedback, newFlowName, showToast]);

  const cancelCreateFlow = useCallback(() => {
    setShowNewFlowDialog(false);
    setNewFlowName('');
  }, []);

  const cancelUnsavedAction = useCallback(() => {
    setPendingUnsavedAction(null);
  }, []);

  const confirmUnsavedAction = useCallback(async () => {
    if (!pendingUnsavedAction) {
      return;
    }

    const action = pendingUnsavedAction;
    setPendingUnsavedAction(null);

    if (action.type === 'load_flow') {
      try {
        await loadFlow(action.flowId);
        setShowFlowList(false);
        showToast('success', '流程已加载');
      } catch (err) {
        console.error('Failed to load flow:', err);
        showToast('error', '加载失败');
      }
      return;
    }

    if (action.type === 'create_flow_dialog') {
      proceedWithNewFlowDialog();
    }
  }, [loadFlow, pendingUnsavedAction, proceedWithNewFlowDialog, showToast]);

  const handleUndo = useCallback(async () => {
    try {
      await undo();
    } catch (err) {
      console.error('Failed to undo:', err);
      showToast('error', '撤销失败');
    }
  }, [showToast, undo]);

  const handleRedo = useCallback(async () => {
    try {
      await redo();
    } catch (err) {
      console.error('Failed to redo:', err);
      showToast('error', '重做失败');
    }
  }, [redo, showToast]);

  // Keyboard shortcut handler for delete
  const handleKeyboardDelete = useCallback(async () => {
    if (selectedNodeId) {
      try {
        await deleteNode(selectedNodeId);
        setSelectedNodeId(null);
      } catch (err) {
        console.error('Failed to delete node:', err);
        showToast('error', '删除节点失败');
      }
    }
  }, [selectedNodeId, deleteNode, showToast]);

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    enabled: true,
    handlers: {
      onUndo: undo,
      onRedo: redo,
      onNew: openNewFlowDialog,
      onDelete: handleKeyboardDelete,
      onExecute: handleExecute,
      onStep: handleStep,
      onStop: handleStop,
      onSave: handleSave,
      onOpen: handleLoad,
    },
    canUndo,
    canRedo,
    hasSelection,
    hasFlow,
    isExecuting,
  });

  // UX优化124: 监听 ? 键显示快捷键帮助
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only trigger if not in an input field
        const target = e.target as HTMLElement;
        if (!isInputLikeElement(target)) {
          setShowShortcutHelp(prev => !prev);
        }
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        setPendingPlacement(null);
        setShowShortcutHelp(false);
        setShowFlowList(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!recentNodeId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentNodeId(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [recentNodeId]);

  return (
    <div className="app">
      {/* Top Toolbar */}
      <FlowToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        isExecuting={isExecuting}
        isPaused={isPaused}
        hasFlow={hasFlow}
        flowName={flow?.name}
        themeMode={themeMode}
        onSave={handleSave}
        onLoad={handleLoad}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExecute={handleExecute}
        onPause={handlePause}
        onStop={handleStop}
        onStep={handleStep}
        onNew={openNewFlowDialog}
        onToggleTheme={toggleTheme}
        onHelp={() => setShowShortcutHelp(true)}
      />

      {/* Main Content */}
      <div className="app__content">
        {/* Left Sidebar - Toolbox */}
        <aside className="app__sidebar app__sidebar--left">
          <Toolbox
            onBlockSelect={handleToolboxSelect}
            onArmPlacement={handleArmPlacement}
            pendingPlacementLabel={pendingPlacement?.type ?? null}
            onCancelPlacement={handleCancelPlacement}
          />
        </aside>

        {/* Center - Flow Canvas */}
        <main className="app__main">
          <FlowCanvas
          nodes={nodes}
          edges={edges}
          nodeValidation={validationByNodeId}
          focusedNodeId={focusedValidationNodeId}
              onNodeSelect={handleNodeSelect}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            executingBlockId={currentBlockId}
            onAddNode={handleAddNode}
            pendingPlacement={pendingPlacement}
            onPlacePendingNode={handlePlacePendingNode}
            onViewportCenterReady={(getCenter) => {
              viewportCenterRef.current = getCenter;
            }}
            recentNodeId={recentNodeId}
            onNodeDelete={handleDeleteNode}
            onEdgeDelete={handleDeleteEdge}
            onSetEntryNode={handleSetEntryNode}
          />
        </main>

        {/* Right Sidebar - Config Panel */}
        <aside className="app__sidebar app__sidebar--right">
          {loading && (
            <div className="loading-indicator">
              <div className="loading-spinner" />
              <span>加载中...</span>
            </div>
          )}

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error.message}</span>
              <button onClick={() => window.location.reload()} className="error-retry-btn">
                重试
              </button>
            </div>
          )}

          {validationItems.length > 0 && (
            <div className="config-placeholder__hint-box app__validation-panel" data-testid="validation-panel">
              <p className="config-placeholder__hint-title">🩺 流程问题清单</p>
              <ul className="app__validation-list">
                {validationItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`app__validation-item app__validation-item--${item.severity}`}
                      onClick={() => handleSelectValidationBlock(item.blockId)}
                      data-testid={`validation-item-${item.id}`}
                    >
                      <strong>{item.severity === 'error' ? '错误' : '警告'}</strong>
                      <span>{item.message}</span>
                      {item.blockId && <span className="app__validation-item-meta">定位到节点</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedNode ? (
            <BlockConfig
              blockId={selectedNode.id}
              blockType={selectedNode.data.blockType}
              config={selectedNode.data.config}
              externalValidationSeverity={selectedNodeValidation?.severity}
              externalValidationMessage={selectedNodeValidation?.message ?? null}
              onSave={handleConfigSave}
              onCancel={handleConfigCancel}
            />
          ) : (
            <div className="config-placeholder">
              <div className="config-placeholder__icon">🔧</div>
              <h3>积木块配置</h3>
              <p>点击积木块进行配置</p>
              {!flow && (
                <div className="config-placeholder__hint-box">
                  <p className="config-placeholder__hint-title">💡 快速开始</p>
                  <p className="config-placeholder__hint">1. 点击"新建"创建流程</p>
                  <p className="config-placeholder__hint">2. 从左侧拖动积木块到画布</p>
                  <p className="config-placeholder__hint">3. 点击积木块配置参数</p>
                  <p className="config-placeholder__hint">4. 点击"执行"运行流程</p>
                  <div className="config-placeholder__actions">
                    <button className="config-placeholder__action-btn" type="button" onClick={() => void createQuickFlow()}>
                      ➕ 立即创建流程
                    </button>
                    <button className="config-placeholder__action-btn config-placeholder__action-btn--secondary" type="button" onClick={() => handleToolboxSelect('click', 'action')}>
                      ⚡ 直接放一个点击积木块
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <StatusBar
        executionStatus={executionStatus}
        currentBlockId={currentBlockId}
        nodesCount={nodes.length}
        edgesCount={edges.length}
        completedBlocks={completedBlocks}
        errorMessage={errorMessage}
        flowName={flow?.name}
        loading={loading}
        isDirty={isDirty}
        flowError={error}
        flowValidationErrors={formattedFlowValidationErrors}
        flowValidationWarnings={formattedFlowValidationWarnings}
        primaryFlowValidationError={primaryFlowValidationError}
        primaryFlowValidationWarning={primaryFlowValidationWarning}
        placementLabel={pendingPlacement?.type ?? null}
        onFocusNode={(blockId) => setFocusedValidationNodeId(blockId)}
      />

      {/* Execution Log Panel - UX优化85: 总是显示日志面板 */}
      <div
        className={`app__execution-log ${logCollapsed ? 'app__execution-log--collapsed' : ''}`}
        style={{ height: logCollapsed ? 54 : logHeight }}
      >
        <button
          className="execution-log__resize-handle"
          type="button"
          aria-label="调整日志面板高度"
          title="拖动调整日志面板高度"
          onMouseDown={handleLogResizeStart}
        />
        <ExecutionLog
          entries={logEntries}
          maxHeight={logCollapsed ? 0 : Math.max(logHeight - 54, 80)}
          collapsed={logCollapsed}
          onClear={handleClearExecutionLog}
        />
        <button
          className="execution-log__collapse-btn"
          onClick={handleToggleLogCollapsed}
          title={logCollapsed ? '展开日志' : '折叠日志'}
          aria-label={logCollapsed ? '展开日志' : '折叠日志'}
          type="button"
        >
          {logCollapsed ? '▲' : '▼'}
        </button>
      </div>

      <FlowListModal
        isOpen={showFlowList}
        flowList={flowList}
        currentFlowId={flow?.id}
        onClose={() => setShowFlowList(false)}
        onNew={openNewFlowDialog}
        onLoad={(id) => void handleLoadFlowById(id)}
        onDelete={(id) => void handleDeleteFlowById(id)}
      />

      <ShortcutCheatsheet isOpen={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} />

      <ConfirmDialog
        isOpen={flowPendingDelete !== null}
        title="删除流程"
        message={flowPendingDelete ? `确定要删除“${flowPendingDelete.name}”吗？此操作不可撤销。` : ''}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={() => void confirmDeleteFlow()}
        onCancel={cancelDeleteFlow}
      />

      <ConfirmDialog
        isOpen={pendingUnsavedAction !== null}
        title="未保存的更改"
        message="当前流程有未保存的更改。继续操作将丢失这些修改，是否继续？"
        confirmText="继续"
        cancelText="取消"
        variant="warning"
        onConfirm={() => void confirmUnsavedAction()}
        onCancel={cancelUnsavedAction}
      />

      {showOnboarding && (
        <div className="app__onboarding" role="dialog" aria-modal="true">
          <div className="app__onboarding-card">
            <div className="app__onboarding-header">
              <div>
                <p className="app__onboarding-eyebrow">Visual Automation Designer</p>
                <h2 className="app__onboarding-title">先从一个简单流程开始</h2>
              </div>
              <button className="app__onboarding-close" type="button" onClick={handleDismissOnboarding}>
                ×
              </button>
            </div>
            <div className="app__onboarding-steps">
              <div className="app__onboarding-step">
                <span className="app__onboarding-step-index">1</span>
                <div>
                  <strong>创建流程</strong>
                  <p>点击顶部“新建”，或者直接点击左侧元件自动生成快速流程。</p>
                </div>
              </div>
              <div className="app__onboarding-step">
                <span className="app__onboarding-step-index">2</span>
                <div>
                  <strong>放置元件</strong>
                  <p>支持拖拽、点击放到视口中心，或用“◎”进入精确放置模式。</p>
                </div>
              </div>
              <div className="app__onboarding-step">
                <span className="app__onboarding-step-index">3</span>
                <div>
                  <strong>配置并执行</strong>
                  <p>新建节点后会自动选中，右侧修改参数，最后点击执行。</p>
                </div>
              </div>
            </div>
            <div className="app__onboarding-actions">
              <button className="app__onboarding-btn app__onboarding-btn--secondary" type="button" onClick={handleDismissOnboarding}>
                稍后再看
              </button>
      <button
        className="app__onboarding-btn"
        type="button"
        onClick={() => {
          handleDismissOnboarding();
          void createQuickFlow();
        }}
      >
        立即创建流程
      </button>
            </div>
          </div>
        </div>
      )}

      <NewFlowDialog
        isOpen={showNewFlowDialog}
        value={newFlowName}
        onChange={setNewFlowName}
        onCancel={cancelCreateFlow}
        onConfirm={() => void handleCreateFlow()}
      />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
