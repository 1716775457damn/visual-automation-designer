import { useState, useCallback, useMemo } from 'react';
import { Connection } from 'reactflow';
import './App.css';
import './styles/index.css';
import { FlowCanvas, FlowToolbar } from './components/FlowEditor';
import { ExecutionBar, ExecutionLog, executionEventToLogEntry } from './components/ExecutionStatus';
import { Toolbox } from './components/BlockToolbox';
import { BlockConfig } from './components/ConfigPanel';
import { ToastProvider, useToast } from './components/common';
import { useFlow, useExecution, useKeyboardShortcuts, useTheme } from './hooks';
import type { BlockConfig as BlockConfigType } from './tauri/flow';

function AppContent() {
  // UX优化103: 主题管理
  const { mode: themeMode, toggleTheme } = useTheme();

  const {
    flow,
    nodes,
    edges,
    flowList,
    loading,
    error,
    createFlow,
    saveFlow,
    loadFlow,
    loadFlowList,
    deleteFlow,
    setNodes,
    setEdges,
    addNode,
    addConnection,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteNode,
    updateNodeConfig,
  } = useFlow();

  const { showToast } = useToast();

  // Use the enhanced execution hook
  const {
    status: executionStatus,
    currentBlockId,
    executionLog,
    errorMessage,
    executeFlow: tauriExecuteFlow,
    pauseExecution,
    resumeExecution,
    stopExecution,
    stepExecution,
    clearLog,
  } = useExecution();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showFlowList, setShowFlowList] = useState(false);

  // Determine execution states
  const isExecuting = executionStatus === 'running' || executionStatus === 'paused';
  const isPaused = executionStatus === 'paused';
  const hasFlow = flow !== null;
  const hasSelection = selectedNodeId !== null;

  // Convert execution log entries to log entries for display
  const logEntries = executionLog.map((event, index) =>
    executionEventToLogEntry(event, index)
  );

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

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
      await updateNodeConfig(selectedNodeId, config as BlockConfigType);
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
    try {
      await addConnection(connection);
    } catch (err) {
      console.error('Failed to add connection:', err);
    }
  }, [addConnection]);

  // Handle execution controls
  const handleExecute = useCallback(async () => {
    if (!flow) {
      showToast('warning', '请先创建或加载流程');
      return;
    }
    try {
      await tauriExecuteFlow(flow.id);
      showToast('info', '开始执行流程');
    } catch (err) {
      console.error('Failed to execute flow:', err);
      showToast('error', '执行失败');
    }
  }, [flow, tauriExecuteFlow, showToast]);

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
  }, [stopExecution, clearLog]);

  const handleStep = useCallback(async () => {
    if (!flow) {
      console.warn('No flow to step');
      return;
    }
    try {
      await stepExecution(flow.id);
    } catch (err) {
      console.error('Failed to step execution:', err);
    }
  }, [flow, stepExecution]);

  const handleSave = useCallback(async () => {
    if (!flow) {
      showToast('warning', '没有可保存的流程');
      return;
    }
    try {
      await saveFlow();
      showToast('success', '流程已保存');
    } catch (err) {
      console.error('Failed to save flow:', err);
      showToast('error', '保存失败');
    }
  }, [flow, saveFlow, showToast]);

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
    try {
      await loadFlow(id);
      setShowFlowList(false);
      showToast('success', '流程已加载');
    } catch (err) {
      console.error('Failed to load flow:', err);
      showToast('error', '加载失败');
    }
  }, [loadFlow, showToast]);

  const handleDeleteFlowById = useCallback(async (id: string) => {
    if (!confirm('确定要删除此流程吗？')) {
      return;
    }
    try {
      await deleteFlow(id);
      showToast('success', '流程已删除');
    } catch (err) {
      console.error('Failed to delete flow:', err);
      showToast('error', '删除失败');
    }
  }, [deleteFlow, showToast]);

  const handleNewFlow = useCallback(async () => {
    const name = prompt('请输入流程名称：', `新流程_${new Date().toLocaleDateString()}`);
    if (name) {
      try {
        await createFlow(name);
        showToast('success', '流程已创建');
      } catch (err) {
        console.error('Failed to create flow:', err);
        showToast('error', '创建失败');
      }
    }
  }, [createFlow, showToast]);

  const handleUndo = useCallback(async () => {
    try {
      await undo();
    } catch (err) {
      console.error('Failed to undo:', err);
    }
  }, [undo]);

  const handleRedo = useCallback(async () => {
    try {
      await redo();
    } catch (err) {
      console.error('Failed to redo:', err);
    }
  }, [redo]);

  // Keyboard shortcut handler for delete
  const handleKeyboardDelete = useCallback(async () => {
    if (selectedNodeId) {
      try {
        await deleteNode(selectedNodeId);
        setSelectedNodeId(null);
      } catch (err) {
        console.error('Failed to delete node:', err);
      }
    }
  }, [selectedNodeId, deleteNode]);

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    enabled: true,
    handlers: {
      onUndo: undo,
      onRedo: redo,
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
        onNew={handleNewFlow}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content */}
      <div className="app__content">
        {/* Left Sidebar - Toolbox */}
        <aside className="app__sidebar app__sidebar--left">
          <Toolbox />
        </aside>

        {/* Center - Flow Canvas */}
        <main className="app__main">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodeSelect={handleNodeSelect}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onConnect={handleConnect}
            executingBlockId={currentBlockId}
            onAddNode={addNode}
            onNodeDelete={deleteNode}
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

          {selectedNode ? (
            <BlockConfig
              blockId={selectedNode.id}
              blockType={selectedNode.data.blockType}
              config={selectedNode.data.config}
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
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Status Bar */}
      <div className="app__status">
        {/* Execution Status Bar */}
        <ExecutionBar
          status={executionStatus}
          currentBlock={currentBlockId || undefined}
          totalBlocks={nodes.length}
          completedBlocks={0}
          errorMessage={errorMessage || undefined}
        />

        {/* UX优化42: 增强的积木块/连接统计 */}
        <span className="app__status-item app__status-item--stats">
          🧩 {nodes.length} 积木块
        </span>
        <span className="app__status-item app__status-item--stats">
          🔗 {edges.length} 连接
        </span>

        {/* Flow name */}
        {flow && (
          <span className="app__status-item app__status-item--flow">
            📋 {flow.name}
          </span>
        )}

        {/* UX优化43: 自动保存指示器 */}
        {flow && !loading && (
          <span className="app__status-item app__status-item--autosave">
            已保存
          </span>
        )}

        {/* Loading indicator */}
        {loading && (
          <span className="app__status-item app__status-item--loading">
            ⏳ 加载中...
          </span>
        )}

        {/* Error display */}
        {error && (
          <span className="app__status-item app__status-item--error">
            ⚠️ {error.message}
          </span>
        )}
      </div>

      {/* Execution Log Panel - UX优化85: 总是显示日志面板 */}
      <div className="app__execution-log">
        <ExecutionLog entries={logEntries} maxHeight={180} />
      </div>

      {/* Flow List Modal */}
      {showFlowList && (
        <div className="flow-list-modal" onClick={() => setShowFlowList(false)}>
          <div className="flow-list-modal__content" onClick={(e) => e.stopPropagation()}>
            <div className="flow-list-modal__header">
              <h3>📋 流程列表</h3>
              <button
                className="flow-list-modal__close"
                onClick={() => setShowFlowList(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="flow-list-modal__actions">
              <button
                className="flow-list-modal__btn flow-list-modal__btn--primary"
                onClick={handleNewFlow}
                type="button"
              >
                ➕ 新建流程
              </button>
            </div>
            <div className="flow-list-modal__list">
              {flowList.length === 0 ? (
                <div className="flow-list-modal__empty">
                  <p>📭 暂无保存的流程</p>
                  <p className="flow-list-modal__empty-hint">点击"新建流程"开始创建</p>
                </div>
              ) : (
                flowList.map((meta) => (
                  <div key={meta.id} className={`flow-list-modal__item ${flow?.id === meta.id ? 'flow-list-modal__item--active' : ''}`}>
                    <div className="flow-list-modal__item-info">
                      <span className="flow-list-modal__item-name">{meta.name}</span>
                      <span className="flow-list-modal__item-meta">
                        {meta.blockCount} 个积木块 · 更新于 {new Date(meta.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flow-list-modal__item-actions">
                      <button
                        className="flow-list-modal__item-btn"
                        onClick={() => handleLoadFlowById(meta.id)}
                        disabled={flow?.id === meta.id}
                        type="button"
                      >
                        {flow?.id === meta.id ? '✓ 当前' : '打开'}
                      </button>
                      <button
                        className="flow-list-modal__item-btn flow-list-modal__item-btn--danger"
                        onClick={() => handleDeleteFlowById(meta.id)}
                        type="button"
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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
