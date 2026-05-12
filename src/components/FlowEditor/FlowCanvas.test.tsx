/**
 * FlowCanvas MiniMap Tests
 * Tests for MiniMap component integration
 * 
 * Validates: Requirements 2.1
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlowCanvas } from './FlowCanvas';

// Mock react-flow to avoid rendering issues in tests
vi.mock('reactflow', () => ({
  default: vi.fn(({ children, nodes = [], onNodeContextMenu, onPaneContextMenu }) => (
    <div data-testid="react-flow-mock" onContextMenu={(event) => onPaneContextMenu?.(event)}>
      {nodes.map((node: { id: string; data?: { label?: string } }) => (
        <div
          key={node.id}
          data-testid={`react-flow-node-${node.id}`}
          onContextMenu={(event) => onNodeContextMenu?.(event, node)}
        >
          {node.data?.label ?? node.id}
        </div>
      ))}
      {children}
    </div>
  )),
  ReactFlowProvider: vi.fn(({ children }) => (
    <div data-testid="react-flow-provider-mock">{children}</div>
  )),
  Controls: vi.fn(() => <div data-testid="controls-mock" />),
  MiniMap: vi.fn(() => <div data-testid="minimap-mock" />),
  Background: vi.fn(() => <div data-testid="background-mock" />),
  Panel: vi.fn(({ children }) => <div data-testid="panel-mock">{children}</div>),
  Handle: vi.fn(() => <div data-testid="handle-mock" />),
  MarkerType: { ArrowClosed: 'arrowClosed' },
  BackgroundVariant: { Dots: 'dots' },
  ConnectionMode: { Loose: 'loose' },
  addEdge: vi.fn(),
  applyNodeChanges: vi.fn((_, nodes) => nodes),
  applyEdgeChanges: vi.fn((_, edges) => edges),
}));

describe('FlowCanvas MiniMap', () => {
  it('should render MiniMap component', () => {
    render(<FlowCanvas />);
    
    expect(screen.getByTestId('minimap-mock')).toBeInTheDocument();
  });

  it('should render Controls for navigation', () => {
    render(<FlowCanvas />);
    
    expect(screen.getByTestId('controls-mock')).toBeInTheDocument();
  });

  it('should render the flow canvas container', () => {
    render(<FlowCanvas />);
    
    expect(screen.getByTestId('flow-canvas')).toBeInTheDocument();
  });
});

describe('FlowCanvas Context Menu', () => {
  it('should not show context menu initially', () => {
    render(<FlowCanvas />);
    
    expect(screen.queryByTestId('context-menu-node')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-menu-edge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-menu-canvas')).not.toBeInTheDocument();
  });

  it('should render canvas with hint text', () => {
    render(<FlowCanvas />);
    
    expect(screen.getByText('从工具箱拖拽积木块到画布')).toBeInTheDocument();
  });

  it('should offer set entry action for non-entry nodes', () => {
    render(
      <FlowCanvas
        nodes={[
          {
            id: 'node-1',
            type: 'blockNode',
            position: { x: 0, y: 0 },
            data: {
              label: '点击',
              blockType: 'click',
              blockCategory: 'action',
              isEntryPoint: false,
            },
          },
        ] as never}
      />
    );

    fireEvent.contextMenu(screen.getByTestId('react-flow-node-node-1'));
    expect(screen.getByText('设为入口')).toBeInTheDocument();
  });

  it('should disable set entry action for current entry node', () => {
    render(
      <FlowCanvas
        nodes={[
          {
            id: 'node-1',
            type: 'blockNode',
            position: { x: 0, y: 0 },
            data: {
              label: '点击',
              blockType: 'click',
              blockCategory: 'action',
              isEntryPoint: true,
            },
          },
        ] as never}
      />
    );

    fireEvent.contextMenu(screen.getByTestId('react-flow-node-node-1'));
    expect(screen.getByText('设为入口').closest('button')).toBeDisabled();
  });
});
