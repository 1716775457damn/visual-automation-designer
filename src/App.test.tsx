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
  lastFlowCanvasProps: null as null | { onConnect?: (connection: { source: string; target: string; sourceHandle?: string }) => void; nodeValidation?: Record<string, { message: string }> },
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
  StatusBar: ({ flowValidationError, flowValidationWarning }: { flowValidationError?: { message?: string } | null; flowValidationWarning?: { message?: string } | null }) => (
    <div data-testid="status-bar-mock">
      {flowValidationError?.message && <span>{flowValidationError.message}</span>}
      {flowValidationWarning?.message && <span>{flowValidationWarning.message}</span>}
    </div>
  ),
}));

vi.mock('./components/FlowEditor', () => ({
  FlowCanvas: (props: { onConnect?: (connection: { source: string; target: string; sourceHandle?: string }) => void; nodeValidation?: Record<string, { message: string }> }) => {
    flowEditorMocks.lastFlowCanvasProps = props;
    const { nodeValidation } = props;

    return (
      <div data-testid="flow-canvas">
        {nodeValidation && Object.entries(nodeValidation).map(([nodeId, validation]) => (
          <span key={nodeId} data-testid={`node-validation-${nodeId}`}>{validation.message}</span>
        ))}
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
  ExecutionLog: () => <div data-testid="execution-log" />,
  executionEventToLogEntry: vi.fn((event) => event),
}));

vi.mock('./components/BlockToolbox', () => ({
  Toolbox: () => <div data-testid="toolbox" />,
}));

vi.mock('./components/ConfigPanel', () => ({
  BlockConfig: () => <div data-testid="block-config" />,
}));

vi.mock('./components/common', async () => {
  const actual = await vi.importActual<typeof import('./components/common')>('./components/common');

  return {
    ...actual,
    ConfirmDialog: () => null,
  };
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
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('does not show a success toast when quick-add fails', async () => {
    addNodeMock.mockRejectedValueOnce(new Error('添加节点失败'));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '⚡ 直接放一个点击积木块' }));

    await waitFor(() => {
      expect(screen.getByText('添加节点失败')).toBeInTheDocument();
    });

    expect(screen.queryByText('click 已添加到当前视口')).not.toBeInTheDocument();
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
      expect(hookMocks.canonicalFlowBuilder).toHaveBeenCalledTimes(1);
      expect(tauriFlowMocks.validateFlow).toHaveBeenCalledWith(canonicalFlow);
      expect(executeFlowMock).toHaveBeenCalledWith('flow-1');
    });
  });

  it('blocks execution when validation fails', async () => {
    tauriFlowMocks.validateFlow.mockResolvedValueOnce({
      isValid: false,
      errors: [{ code: 'EMPTY_CONDITION_BRANCHES', message: 'Both condition branches are empty' }],
      warnings: [],
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(executeFlowMock).not.toHaveBeenCalled();
      expect(setExecutionStateMock).toHaveBeenCalledWith('validation_blocked', 'Both condition branches are empty');
      expect(screen.getByText('执行失败')).toBeInTheDocument();
      expect(screen.getByText('Both condition branches are empty')).toBeInTheDocument();
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
      expect(screen.getByText('Wait time is zero')).toBeInTheDocument();
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

  it('blocks unsupported condition and loop structure validation text', async () => {
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
          code: 'LOOP_SUBCHAIN_UNSUPPORTED',
          message: 'Loop subchains are unsupported',
          blockId: 'loop-1',
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

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(screen.getAllByText('条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。').length).toBeGreaterThan(0);
      expect(screen.getByTestId('node-validation-condition-1')).toHaveTextContent('条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。');
      expect(screen.getByTestId('node-validation-loop-1')).toHaveTextContent('循环暂不支持把多个子节点串成循环体。请先保留一个直接子节点作为循环内容，或把复杂步骤拆到循环块之后执行。');
      expect(setExecutionStateMock).toHaveBeenCalledWith(
        'validation_blocked',
        '条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。'
      );
    });

    expect(screen.queryByText('Condition default outgoing edges are unsupported')).not.toBeInTheDocument();
    expect(screen.queryByText('Loop subchains are unsupported')).not.toBeInTheDocument();
  });
});
