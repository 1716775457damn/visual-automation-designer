/**
 * FlowCanvas MiniMap Tests
 * Tests for MiniMap component integration
 * 
 * Validates: Requirements 2.1
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlowCanvas } from './FlowCanvas';

// Mock react-flow to avoid rendering issues in tests
vi.mock('reactflow', () => ({
  default: vi.fn(({ children }) => (
    <div data-testid="react-flow-mock">{children}</div>
  )),
  ReactFlowProvider: vi.fn(({ children }) => (
    <div data-testid="react-flow-provider-mock">{children}</div>
  )),
  Controls: vi.fn(() => <div data-testid="controls-mock" />),
  MiniMap: vi.fn(() => <div data-testid="minimap-mock" />),
  Background: vi.fn(() => <div data-testid="background-mock" />),
  Panel: vi.fn(({ children }) => <div data-testid="panel-mock">{children}</div>),
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
});
