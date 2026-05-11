/**
 * ContextMenu Tests
 * Tests for right-click context menu component
 * 
 * Validates: Requirements 2.2, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

describe('ContextMenu', () => {
  const mockOnClose = vi.fn();
  const editAction = vi.fn();
  const copyAction = vi.fn();
  const deleteAction = vi.fn();
  
  const defaultItems: ContextMenuItem[] = [
    { label: '编辑配置', icon: '⚙️', action: editAction },
    { label: '复制', icon: '📋', action: copyAction },
    { label: '删除', icon: '🗑️', action: deleteAction, danger: true },
  ];

  beforeEach(() => {
    mockOnClose.mockClear();
    editAction.mockClear();
    copyAction.mockClear();
    deleteAction.mockClear();
  });

  it('should render context menu with items', () => {
    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={defaultItems}
        onClose={mockOnClose}
      />
    );
    
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByText('编辑配置')).toBeInTheDocument();
    expect(screen.getByText('复制')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('should call action when item is clicked', async () => {
    const editAction = vi.fn();
    const items: ContextMenuItem[] = [
      { label: '编辑配置', icon: '⚙️', action: editAction },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    const editButton = screen.getByText('编辑配置');
    fireEvent.click(editButton);
    
    expect(editAction).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not call action when disabled item is clicked', () => {
    const action = vi.fn();
    const items: ContextMenuItem[] = [
      { label: '禁用项', icon: '🚫', action, disabled: true },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    const button = screen.getByText('禁用项');
    fireEvent.click(button);
    
    expect(action).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should close menu on Escape key', async () => {
    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={defaultItems}
        onClose={mockOnClose}
      />
    );
    
    // Wait for the setTimeout in useEffect to complete
    await waitFor(() => new Promise(resolve => setTimeout(resolve, 10)));
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should close menu when clicking outside', async () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ContextMenu
          position={{ x: 100, y: 100 }}
          items={defaultItems}
          onClose={mockOnClose}
        />
      </div>
    );
    
    // Wait for the setTimeout in useEffect to complete
    await waitFor(() => new Promise(resolve => setTimeout(resolve, 10)));
    
    const outside = screen.getByTestId('outside');
    fireEvent.mouseDown(outside);
    
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should render submenu items', () => {
    const items: ContextMenuItem[] = [
      {
        label: '添加积木块',
        icon: '➕',
        submenu: [
          { label: '点击', icon: '👆' },
          { label: '等待时间', icon: '⏱️' },
        ],
      },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    expect(screen.getByText('添加积木块')).toBeInTheDocument();
    expect(screen.getByText('点击')).toBeInTheDocument();
    expect(screen.getByText('等待时间')).toBeInTheDocument();
  });

  it('should apply danger class to danger items', () => {
    const items: ContextMenuItem[] = [
      { label: '删除', icon: '🗑️', danger: true },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    const deleteButton = screen.getByText('删除').closest('button');
    expect(deleteButton).toHaveClass('context-menu__item--danger');
  });

  it('should apply disabled class to disabled items', () => {
    const items: ContextMenuItem[] = [
      { label: '禁用项', icon: '🚫', disabled: true },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    const button = screen.getByText('禁用项').closest('button');
    expect(button).toHaveClass('context-menu__item--disabled');
  });

  it('should render divider after item when specified', () => {
    const items: ContextMenuItem[] = [
      { label: '项目1', divider: true },
      { label: '项目2' },
    ];

    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={items}
        onClose={mockOnClose}
      />
    );
    
    const dividers = document.querySelectorAll('.context-menu__divider');
    expect(dividers.length).toBe(1);
  });

  it('should use custom testId', () => {
    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={defaultItems}
        onClose={mockOnClose}
        testId="custom-context-menu"
      />
    );
    
    expect(screen.getByTestId('custom-context-menu')).toBeInTheDocument();
  });
});

describe('ContextMenu Integration', () => {
  it('should render different menus based on context type', () => {
    const nodeItems: ContextMenuItem[] = [
      { label: '编辑配置' },
      { label: '删除' },
    ];

    const edgeItems: ContextMenuItem[] = [
      { label: '删除连接' },
    ];

    // Test node menu
    const { unmount } = render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={nodeItems}
        onClose={vi.fn()}
        testId="context-menu-node"
      />
    );
    expect(screen.getByText('编辑配置')).toBeInTheDocument();
    unmount();

    // Test edge menu
    render(
      <ContextMenu
        position={{ x: 100, y: 100 }}
        items={edgeItems}
        onClose={vi.fn()}
        testId="context-menu-edge"
      />
    );
    expect(screen.getByText('删除连接')).toBeInTheDocument();
    expect(screen.queryByText('编辑配置')).not.toBeInTheDocument();
  });
});
