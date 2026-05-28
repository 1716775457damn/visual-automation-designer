import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

const hookMocks = vi.hoisted(() => ({
  canonicalFlowBuilder: vi.fn(),
}));

const tauriFlowMocks = vi.hoisted(() => ({
  validateFlow: vi.fn(),
}));

const flowEditorMocks = vi.hoisted(() => ({
  lastFlowCanvasProps: null as null | {
    onConnect?: (connection: { source: string; target: string; sourceHandle?: string }) => void;
    onPlacePendingNode?: (position: { x: number; y: number }) => void;
    pendingPlacement?: { type: string; category: string } | null;
    nodeValidation?: Record<string, { message: string }>;
    focusedNodeId?: string | null;
  },
}));

const createFlowMock = vi.fn();
const addNodeMock = vi.fn();
const addConnectionMock = vi.fn();
const saveFlowMock = vi.fn();
const executeFlowMock = vi.fn();
const stopExecutionMock = vi.fn();
const setExecutionStateMock = vi.fn();
const runtimeSelfCheckMock = vi.fn();
let flowState = {
  flow: null as null | { id: string; name: string; blocks: Record<string, unknown>; connections: unknown[] },
  nodes: [] as Array<Record<string, unknown>>,
  edges: [] as Array<Record<string, unknown>>,
  isDirty: false,
};

vi.mock('./hooks', async () => {
  const actual = await vi.importActual<typeof import('./hooks')>('./hooks');

  return {
    ...actual,
    useFlow: () => ({
      flow: flowState.flow,
      nodes: flowState.nodes,
      edges: flowState.edges,
      flowList: [],
      loading: false,
      error: null,
      isDirty: flowState.isDirty,
      createFlow: createFlowMock,
      saveFlow: saveFlowMock,
      loadFlow: vi.fn(),
      loadFlowList: vi.fn(),
      deleteFlow: vi.fn(),
      addNode: addNodeMock,
      addConnection: addConnectionMock,
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      deleteNode: vi.fn(),
      deleteConnection: vi.fn(),
      handleNodesChange: vi.fn(),
      handleEdgesChange: vi.fn(),
      updateNodeConfig: vi.fn(),
      setEntryBlock: vi.fn(),
    }),
    buildCanonicalFlow: hookMocks.canonicalFlowBuilder,
    useExecution: () => ({
      status: 'idle',
      currentBlockId: null,
      executionLog: [],
      errorMessage: null,
      setExecutionState: setExecutionStateMock,
      runtimeSelfCheck: runtimeSelfCheckMock,
      executeFlow: executeFlowMock,
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: stopExecutionMock,
      stepExecution: vi.fn(),
      clearLog: vi.fn(),
      completedBlocks: 0,
      resetProgress: vi.fn(),
    }),
    useKeyboardShortcuts: vi.fn(),
    useTheme: () => ({
      mode: 'light',
      toggleTheme: vi.fn(),
    }),
  };
});

vi.mock('./tauri/flow', () => ({
  validateFlow: tauriFlowMocks.validateFlow,
}));

vi.mock('./components/App', () => ({
  FlowListModal: () => null,
  NewFlowDialog: () => null,
  ShortcutCheatsheet: () => null,
  StatusBar: ({
    flowValidationErrors = [],
    flowValidationWarnings = [],
    primaryFlowValidationError,
    primaryFlowValidationWarning,
  }: {
    flowValidationErrors?: Array<{ message?: string }>;
    flowValidationWarnings?: Array<{ message?: string }>;
    primaryFlowValidationError?: { message?: string } | null;
    primaryFlowValidationWarning?: { message?: string } | null;
  }) => (
    <div data-testid="status-bar-mock">
      {primaryFlowValidationError?.message && <span>{primaryFlowValidationError.message}</span>}
      {primaryFlowValidationWarning?.message && <span>{primaryFlowValidationWarning.message}</span>}
      <span data-testid="status-bar-counts">errors:{flowValidationErrors.length};warnings:{flowValidationWarnings.length}</span>
    </div>
  ),
}));

vi.mock('./components/FlowEditor', () => ({
  FlowCanvas: (props: {
    onConnect?: (connection: { source: string; target: string; sourceHandle?: string }) => void;
    onPlacePendingNode?: (position: { x: number; y: number }) => void;
    pendingPlacement?: { type: string; category: string } | null;
    nodeValidation?: Record<string, { message: string }>;
    focusedNodeId?: string | null;
    onNodeSelect?: (nodeId: string | null) => void;
  }) => {
    flowEditorMocks.lastFlowCanvasProps = props;
    const { nodeValidation, pendingPlacement, onPlacePendingNode, focusedNodeId } = props;

    return (
      <div data-testid="flow-canvas">
        <span data-testid="flow-canvas-focused-node">{focusedNodeId ?? ''}</span>
        {nodeValidation && Object.entries(nodeValidation).map(([nodeId, validation]) => (
          <span key={nodeId} data-testid={`node-validation-${nodeId}`}>{validation.message}</span>
        ))}
        {pendingPlacement && (
          <button
            type="button"
            onClick={() => onPlacePendingNode?.({ x: 240, y: 180 })}
          >
            模拟在已有节点区域放置
          </button>
        )}
      </div>
    );
  },
  FlowToolbar: ({ onExecute, onSave, onStop }: { onExecute?: () => void; onSave?: () => void; onStop?: () => void }) => (
    <div data-testid="flow-toolbar">
      <button type="button" onClick={onExecute}>执行流程</button>
      <button type="button" onClick={onSave}>保存流程</button>
      <button type="button" onClick={onStop}>停止执行</button>
    </div>
  ),
}));

vi.mock('./components/ExecutionStatus', () => ({
  ExecutionLog: ({ entries = [], onClear }: { entries?: Array<{ id: string; message: string }>; onClear?: () => void }) => (
    <div data-testid="execution-log">
      <button type="button" onClick={onClear}>清空执行日志</button>
      {entries.map((entry) => (
        <span key={entry.id} data-testid={`execution-log-entry-${entry.id}`}>{entry.message}</span>
      ))}
    </div>
  ),
  executionEventToLogEntry: vi.fn((event, index) => ({
    id: `log-${index}`,
    message: `${event.source === 'frontend' ? '[前端] ' : ''}${event.error ? `[执行错误] 执行错误 - ${event.error}` : event.type}`,
  })),
}));

vi.mock('./components/BlockToolbox', () => ({
  Toolbox: ({
    onBlockSelect,
    onArmPlacement,
    pendingPlacementLabel,
    onCancelPlacement,
  }: {
    onBlockSelect?: (type: string, category: string) => void;
    onArmPlacement?: (type: string, category: string) => void;
    pendingPlacementLabel?: string | null;
    onCancelPlacement?: () => void;
  }) => (
    <div data-testid="toolbox">
      <button type="button" onClick={() => onBlockSelect?.('click', 'action')}>⚡ 直接放一个点击积木块</button>
      <button type="button" onClick={() => onBlockSelect?.('wait_image', 'action')}>🖼️ 直接放一个等待图片积木块</button>
      <button type="button" onClick={() => onBlockSelect?.('wait_time', 'action')}>⏱️ 直接放一个等待时间积木块</button>
      <button type="button" onClick={() => onBlockSelect?.('input_text', 'action')}>⌨️ 直接放一个输入文本积木块</button>
      <button type="button" onClick={() => onBlockSelect?.('loop_infinite', 'control')}>♾️ 直接放一个无限循环积木块</button>
      <button type="button" onClick={() => onBlockSelect?.('condition', 'control')}>❓ 直接放一个条件判断积木块</button>
      <button type="button" onClick={() => onArmPlacement?.('loop', 'control')}>在白板上指定位置放置 循环</button>
      {pendingPlacementLabel && (
        <button type="button" onClick={onCancelPlacement}>当前放置: {pendingPlacementLabel} · 点击取消</button>
      )}
    </div>
  ),
}));

vi.mock('./components/ConfigPanel', () => ({
  BlockConfig: ({ blockId, externalValidationMessage }: { blockId: string; externalValidationMessage?: string | null }) => (
    <div data-testid="block-config">
      <span data-testid="block-config-selected-id">{blockId}</span>
      {externalValidationMessage && <span data-testid="block-config-validation-message">{externalValidationMessage}</span>}
    </div>
  ),
}));

vi.mock('./components/common', async () => {
  const actual = await vi.importActual<typeof import('./components/common')>('./components/common');

  return {
    ...actual,
    ConfirmDialog: () => null,
  };
});

describe('App frontend runtime issue visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('vad-onboarding-dismissed', 'true');
    flowState = { flow: null, nodes: [], edges: [], isDirty: false };
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
    runtimeSelfCheckMock.mockResolvedValue({ ok: true, code: 'OK', message: 'Runtime environment is ready' });
    tauriFlowMocks.validateFlow.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    hookMocks.canonicalFlowBuilder.mockImplementation((flow) => flow);
  });

  it('shows a toast and records a log entry when a window error occurs', async () => {
    render(<App />);

    await act(async () => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'UI renderer crashed' }));
    });

    await waitFor(() => {
      expect(screen.getByText('[前端异常] UI renderer crashed')).toBeInTheDocument();
      expect(screen.getByTestId('execution-log')).toHaveTextContent('[前端] [执行错误] 执行错误 - UI renderer crashed');
    });
  });

  it('shows a toast and records a log entry when an unhandled rejection occurs', async () => {
    render(<App />);

    await act(async () => {
      const rejectionEvent = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(rejectionEvent, 'reason', {
        value: new Error('Async pipeline exploded'),
      });
      window.dispatchEvent(rejectionEvent);
    });

    await waitFor(() => {
      expect(screen.getByText('[前端异常] Async pipeline exploded')).toBeInTheDocument();
      expect(screen.getByTestId('execution-log')).toHaveTextContent('[前端] [执行错误] 执行错误 - Async pipeline exploded');
    });
  });
});

describe('App quick-create entry points', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    flowState = { flow: null, nodes: [], edges: [], isDirty: false };
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
    addConnectionMock.mockResolvedValue(undefined);
    saveFlowMock.mockResolvedValue(undefined);
    executeFlowMock.mockResolvedValue(undefined);
    stopExecutionMock.mockResolvedValue(undefined);
    runtimeSelfCheckMock.mockResolvedValue({ ok: true, code: 'OK', message: 'Runtime environment is ready' });
    tauriFlowMocks.validateFlow.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    hookMocks.canonicalFlowBuilder.mockImplementation((flow) => flow);
    flowEditorMocks.lastFlowCanvasProps = null;
  });

  it('creates a quick flow from onboarding CTA', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '立即创建流程' }));

    await waitFor(() => {
      expect(createFlowMock).toHaveBeenCalledTimes(1);
    });

    expect(createFlowMock.mock.calls[0][0]).toMatch(/^快速流程_/);
  });

  it('creates a quick flow from the empty-state CTA', async () => {
    window.localStorage.setItem('vad-onboarding-dismissed', 'true');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '➕ 立即创建流程' }));

    await waitFor(() => {
      expect(createFlowMock).toHaveBeenCalledTimes(1);
    });

    expect(createFlowMock.mock.calls[0][0]).toMatch(/^快速流程_/);
  });
});

describe('App node placement feedback', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('vad-onboarding-dismissed', 'true');
    flowState = { flow: null, nodes: [], edges: [], isDirty: false };
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('does not show a success toast when quick-add fails', async () => {
    addNodeMock.mockRejectedValueOnce(new Error('添加节点失败'));

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: '⚡ 直接放一个点击积木块' })[0]);

    await waitFor(() => {
      expect(screen.getByText('添加节点失败')).toBeInTheDocument();
    });

    expect(screen.queryByText('click 已添加到当前视口')).not.toBeInTheDocument();
  });

  it('creates all non-click block types through the quick-add path', async () => {
    render(<App />);

    const cases = [
      { label: '🖼️ 直接放一个等待图片积木块', type: 'wait_image', category: 'action' },
      { label: '⏱️ 直接放一个等待时间积木块', type: 'wait_time', category: 'action' },
      { label: '⌨️ 直接放一个输入文本积木块', type: 'input_text', category: 'action' },
      { label: '♾️ 直接放一个无限循环积木块', type: 'loop_infinite', category: 'control' },
      { label: '❓ 直接放一个条件判断积木块', type: 'condition', category: 'control' },
    ] as const;

    for (const item of cases) {
      addNodeMock.mockClear();
      fireEvent.click(screen.getByRole('button', { name: item.label }));

      await waitFor(() => {
        expect(addNodeMock).toHaveBeenCalledWith(item.type, item.category, expect.any(Object), undefined, 'flow-1');
      });
    }
  });
});

describe('App execution log console interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('vad-onboarding-dismissed', 'true');
    flowState = { flow: null, nodes: [], edges: [], isDirty: false };
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
  });

  it('restores collapsed execution log state from localStorage and lets users expand it again', async () => {
    window.localStorage.setItem('vad-log-collapsed', 'true');
    window.localStorage.setItem('vad-log-height', '300');

    render(<App />);

    const logPanel = screen.getByTestId('execution-log').parentElement;
    expect(logPanel).toHaveStyle({ height: '54px' });

    fireEvent.click(screen.getByRole('button', { name: '展开日志' }));

    await waitFor(() => {
      expect(logPanel).toHaveStyle({ height: '300px' });
    });
  });

  it('clears execution log entries from the console action', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '清空执行日志' }));

    await waitFor(() => {
      expect(screen.getByText('执行日志已清空')).toBeInTheDocument();
    });
  });
});

describe('App execution uses saved flow state', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [],
      edges: [],
      isDirty: true,
    };
    saveFlowMock.mockResolvedValue(undefined);
    executeFlowMock.mockResolvedValue(undefined);
    stopExecutionMock.mockResolvedValue(undefined);
    runtimeSelfCheckMock.mockResolvedValue({ ok: true, code: 'OK', message: 'Runtime environment is ready' });
    tauriFlowMocks.validateFlow.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
    hookMocks.canonicalFlowBuilder.mockImplementation((flow) => flow);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('saves dirty changes before execution', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '执行流程' }));
    });

    await waitFor(() => {
      expect(saveFlowMock).toHaveBeenCalledTimes(1);
      expect(executeFlowMock).toHaveBeenCalledWith('flow-1');
    });
  });

  it('builds canonical flow before validation and execution', async () => {
    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
          },
        },
        {
          id: 'next-1',
          type: 'blockNode',
          position: { x: 100, y: 0 },
          data: {
            label: '点击',
            blockType: 'click',
            blockCategory: 'action',
          },
        },
      ],
      edges: [],
      isDirty: false,
    };

    const canonicalFlow = {
      id: 'flow-1',
      name: '测试流程',
      entryBlock: 'entry-1',
      blocks: {
        'condition-1': {
          id: 'condition-1',
          blockType: { type: 'control', control: 'condition' },
          position: { x: 0, y: 0 },
          config: {
            type: 'condition',
            imageId: 'image-1',
            condition: 'image_exists',
            trueBranch: ['true-1'],
            falseBranch: ['false-1'],
          },
          children: ['true-1', 'false-1'],
        },
      },
      connections: [],
    };

    hookMocks.canonicalFlowBuilder.mockReturnValueOnce(canonicalFlow);

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(hookMocks.canonicalFlowBuilder).toHaveBeenCalled();
      expect(tauriFlowMocks.validateFlow).toHaveBeenCalledWith(canonicalFlow);
      expect(executeFlowMock).toHaveBeenCalledWith('flow-1');
    });
  });

  it('blocks execution when validation fails', async () => {
    tauriFlowMocks.validateFlow.mockResolvedValue({
      isValid: false,
      errors: [{ code: 'EMPTY_CONDITION_BRANCHES', message: 'Both condition branches are empty' }],
      warnings: [],
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(executeFlowMock).not.toHaveBeenCalled();
      expect(setExecutionStateMock).toHaveBeenCalledWith('validation_blocked', '条件判断的“真”与“假”分支均为空。请从条件块底部的“真/假”出口拉出连线，连接至对应要执行的积木块。');
      expect(screen.getByText('执行失败')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar-mock')).toHaveTextContent('条件判断的“真”与“假”分支均为空。请从条件块底部的“真/假”出口拉出连线，连接至对应要执行的积木块。');
    });
  });

  it('blocks execution when runtime self check fails', async () => {
    runtimeSelfCheckMock.mockResolvedValueOnce({
      ok: false,
      code: 'INPUT_BACKEND_UNAVAILABLE',
      message: 'Input backend is unavailable',
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(executeFlowMock).not.toHaveBeenCalled();
      expect(setExecutionStateMock).toHaveBeenCalledWith('validation_blocked', 'Input backend is unavailable');
    });
  });

  it('marks manual stop as stopped instead of error', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停止执行' }));

    expect(stopExecutionMock).toHaveBeenCalledTimes(1);
    expect(setExecutionStateMock).toHaveBeenCalledWith('stopped', '执行已停止');
  });

  it('shows validation warnings automatically', async () => {
    tauriFlowMocks.validateFlow.mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [{ code: 'ZERO_WAIT_TIME', message: 'Wait time is zero' }],
    });

    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [],
      edges: [],
      isDirty: false,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('status-bar-mock')).toHaveTextContent('等待时间不能为 0ms。请设置一个大于 0 的有效等待毫秒数。');
      expect(screen.getByTestId('validation-panel')).toBeInTheDocument();
    });
  });

  it('blocks unsupported condition default outgoing connections before saving to backend', async () => {
    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
          },
        },
        {
          id: 'next-1',
          type: 'blockNode',
          position: { x: 100, y: 0 },
          data: {
            label: '点击',
            blockType: 'click',
            blockCategory: 'action',
          },
        },
      ],
      edges: [],
      isDirty: false,
    };

    render(<App />);

    const flowCanvasProps = flowEditorMocks.lastFlowCanvasProps;

    await act(async () => {
      flowCanvasProps?.onConnect?.({ source: 'condition-1', target: 'next-1' });
    });

    await waitFor(() => {
      expect(addConnectionMock).not.toHaveBeenCalled();
      expect(screen.getByText('条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。')).toBeInTheDocument();
    });
  });

  it('lets users jump from the validation list to the referenced node', async () => {
    tauriFlowMocks.validateFlow.mockResolvedValue({
      isValid: false,
      errors: [
        {
          code: 'CONDITION_DEFAULT_OUTGOING_UNSUPPORTED',
          message: 'Condition default outgoing edges are unsupported',
          blockId: 'condition-1',
        },
      ],
      warnings: [
        {
          code: 'ZERO_WAIT_TIME',
          message: 'Wait time is zero',
          blockId: 'wait-1',
        },
      ],
    });

    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [
        {
          id: 'condition-1',
          type: 'blockNode',
          position: { x: 0, y: 0 },
          data: {
            label: '条件判断',
            blockType: 'condition',
            blockCategory: 'control',
            config: {},
          },
        },
        {
          id: 'wait-1',
          type: 'blockNode',
          position: { x: 100, y: 0 },
          data: {
            label: '等待时间',
            blockType: 'wait_time',
            blockCategory: 'action',
            config: { durationMs: 0 },
          },
        },
      ],
      edges: [],
      isDirty: false,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('validation-panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /错误.*条件判断暂不支持默认出口连接/ }));

    await waitFor(() => {
      expect(screen.getByTestId('flow-canvas-focused-node')).toHaveTextContent('condition-1');
      expect(screen.getByTestId('block-config-selected-id')).toHaveTextContent('condition-1');
      expect(screen.getByTestId('block-config-validation-message')).toHaveTextContent('条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。');
    });
  });

  it('shows the global validation list with summary items', async () => {
    tauriFlowMocks.validateFlow.mockResolvedValue({
      isValid: false,
      errors: [
        {
          code: 'CONDITION_DEFAULT_OUTGOING_UNSUPPORTED',
          message: 'Condition default outgoing edges are unsupported',
          blockId: 'condition-1',
        },
      ],
      warnings: [
        {
          code: 'ZERO_WAIT_TIME',
          message: 'Wait time is zero',
          blockId: 'wait-1',
        },
      ],
    });

    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      nodes: [],
      edges: [],
      isDirty: false,
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('validation-panel')).toBeInTheDocument();
      expect(screen.getByText('🩺 流程问题清单')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /错误.*条件判断暂不支持默认出口连接/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /警告.*等待时间不能为 0ms/ })).toBeInTheDocument();
    });
  });
});
