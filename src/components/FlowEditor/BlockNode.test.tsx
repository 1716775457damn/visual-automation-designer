import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockNode, { type BlockNodeData } from './BlockNode';

// Container element selector for the outermost block-node div
function getBlockContainer(): HTMLElement | null {
  return document.querySelector('[class*="block-node--"]');
}

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

  it('shows explicit validation labels and badge text for errors', () => {
    renderBlockNode({
      label: '条件判断',
      blockType: 'condition',
      blockCategory: 'control',
      validationSeverity: 'error',
      validationMessage: '条件块结构错误',
    });

    expect(screen.getByLabelText('节点存在错误')).toHaveTextContent('错');
    expect(screen.getByText('错误：')).toBeInTheDocument();
    expect(screen.getByText('条件块结构错误')).toBeInTheDocument();
  });

  it('shows explicit validation labels and badge text for warnings', () => {
    renderBlockNode({
      label: '等待时间',
      blockType: 'wait_time',
      blockCategory: 'action',
      validationSeverity: 'warning',
      validationMessage: '等待时间为 0',
    });

    expect(screen.getByLabelText('节点存在警告')).toHaveTextContent('警');
    expect(screen.getByText('警告：')).toBeInTheDocument();
    expect(screen.getByText('等待时间为 0')).toBeInTheDocument();
  });

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

  it('applies validation-error CSS class when severity is error', () => {
    renderBlockNode({
      label: '点击',
      blockType: 'click',
      blockCategory: 'action',
      validationSeverity: 'error',
      validationMessage: '点击次数无效',
    });

    const container = getBlockContainer();
    expect(container).toBeTruthy();
    expect(container!.className).toContain('block-node--validation-error');
    expect(container!.className).not.toContain('block-node--validation-warning');
  });

  it('applies validation-warning CSS class when severity is warning', () => {
    renderBlockNode({
      label: '点击',
      blockType: 'click',
      blockCategory: 'action',
      validationSeverity: 'warning',
      validationMessage: '配置不完整',
    });

    const container = getBlockContainer();
    expect(container).toBeTruthy();
    expect(container!.className).toContain('block-node--validation-warning');
    expect(container!.className).not.toContain('block-node--validation-error');
  });

  it('does not apply validation CSS class when severity is absent', () => {
    renderBlockNode({
      label: '点击',
      blockType: 'click',
      blockCategory: 'action',
    });

    const container = getBlockContainer();
    expect(container).toBeTruthy();
    expect(container!.className).not.toContain('block-node--validation-');
  });
});
