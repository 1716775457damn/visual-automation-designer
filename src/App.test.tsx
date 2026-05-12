import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

const createFlowMock = vi.fn();
const addNodeMock = vi.fn();

vi.mock('./hooks', async () => {
  const actual = await vi.importActual<typeof import('./hooks')>('./hooks');

  return {
    ...actual,
    useFlow: () => ({
      flow: null,
      nodes: [],
      edges: [],
      flowList: [],
      loading: false,
      error: null,
      isDirty: false,
      createFlow: createFlowMock,
      saveFlow: vi.fn(),
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
      executeFlow: vi.fn(),
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

vi.mock('./components/App', () => ({
  FlowListModal: () => null,
  NewFlowDialog: () => null,
  ShortcutCheatsheet: () => null,
  StatusBar: () => null,
}));

vi.mock('./components/FlowEditor', () => ({
  FlowCanvas: () => <div data-testid="flow-canvas" />,
  FlowToolbar: () => <div data-testid="flow-toolbar" />,
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
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
    addNodeMock.mockResolvedValue('node-1');
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
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('vad-onboarding-dismissed', 'true');
    createFlowMock.mockResolvedValue({ id: 'flow-1', name: '快速流程', blocks: {}, connections: [] });
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
