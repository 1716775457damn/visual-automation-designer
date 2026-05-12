import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

const tauriFlowMocks = vi.hoisted(() => ({
  validateFlow: vi.fn(),
}));

const createFlowMock = vi.fn();
const addNodeMock = vi.fn();
const saveFlowMock = vi.fn();
const executeFlowMock = vi.fn();
let flowState = {
  flow: null as null | { id: string; name: string; blocks: Record<string, unknown>; connections: unknown[] },
  isDirty: false,
};

vi.mock('./hooks', async () => {
  const actual = await vi.importActual<typeof import('./hooks')>('./hooks');

  return {
    ...actual,
    useFlow: () => ({
      flow: flowState.flow,
      nodes: [],
      edges: [],
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
      addConnection: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      deleteNode: vi.fn(),
      deleteConnection: vi.fn(),
      handleNodesChange: vi.fn(),
      handleEdgesChange: vi.fn(),
      updateNodeConfig: vi.fn(),
    }),
    useExecution: () => ({
      status: 'idle',
      currentBlockId: null,
      executionLog: [],
      errorMessage: null,
      executeFlow: executeFlowMock,
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      stopExecution: vi.fn(),
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
  StatusBar: () => null,
}));

vi.mock('./components/FlowEditor', () => ({
  FlowCanvas: () => <div data-testid="flow-canvas" />,
  FlowToolbar: ({ onExecute }: { onExecute?: () => void }) => (
    <div data-testid="flow-toolbar">
      <button type="button" onClick={onExecute}>执行流程</button>
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
    flowState = { flow: null, isDirty: false };
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
    saveFlowMock.mockResolvedValue(undefined);
    executeFlowMock.mockResolvedValue(undefined);
    tauriFlowMocks.validateFlow.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
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
  beforeEach(() => {
    vi.clearAllMocks();
    flowState = {
      flow: { id: 'flow-1', name: '测试流程', blocks: {}, connections: [] },
      isDirty: true,
    };
    saveFlowMock.mockResolvedValue(undefined);
    executeFlowMock.mockResolvedValue(undefined);
  });

  it('saves dirty changes before execution', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '执行流程' }));

    await waitFor(() => {
      expect(saveFlowMock).toHaveBeenCalledTimes(1);
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
      expect(screen.getByText('执行失败')).toBeInTheDocument();
    });
  });
});
