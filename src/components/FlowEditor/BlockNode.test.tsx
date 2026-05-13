import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockNode, { type BlockNodeData } from './BlockNode';

vi.mock('reactflow', () => ({
  Handle: vi.fn(({ onMouseEnter, onMouseLeave, id, className }) => (
    <button
      type="button"
      data-testid={id ? `handle-${id}` : className?.includes('--output') ? 'handle-output' : 'handle-input'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  )),
  Position: { Top: 'top', Bottom: 'bottom' },
}));

describe('BlockNode connection hints', () => {
  function renderBlockNode(data: BlockNodeData) {
    return render(
      <BlockNode
        id="node-1"
        selected={false}
        xPos={0}
        yPos={0}
        dragging={false}
        zIndex={0}
        isConnectable
        type="blockNode"
        data={data}
      />
    );
  }

  it('shows a default-exit warning for condition output handles', () => {
    renderBlockNode({
      label: '条件判断',
      blockType: 'condition',
      blockCategory: 'control',
    });

    fireEvent.mouseEnter(screen.getByTestId('handle-output'));
    expect(screen.getByText('不支持默认出口；请使用“真/假”分支')).toBeInTheDocument();
  });

  it('shows branch-specific hints for condition handles', () => {
    renderBlockNode({
      label: '条件判断',
      blockType: 'condition',
      blockCategory: 'control',
    });

    fireEvent.mouseEnter(screen.getByTestId('handle-true'));
    expect(screen.getByText('真分支：仅连接 1 个直接节点')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId('handle-true'));
    fireEvent.mouseEnter(screen.getByTestId('handle-false'));
    expect(screen.getByText('假分支：仅连接 1 个直接节点')).toBeInTheDocument();
  });

  it('shows loop body limits on loop outputs', () => {
    renderBlockNode({
      label: '循环',
      blockType: 'loop',
      blockCategory: 'control',
    });

    fireEvent.mouseEnter(screen.getByTestId('handle-output'));
    expect(screen.getByText('循环体暂仅支持 1 个直接子节点')).toBeInTheDocument();
  });
});
