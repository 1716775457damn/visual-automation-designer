/**
 * BlockConfig Tests
 * Tests for the block configuration panel component
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BlockConfig } from './BlockConfig';

// Mock the ImageSelector component
vi.mock('./ImageSelector', () => ({
  ImageSelector: ({ selectedId, onSelect, emptyMessage }: {
    selectedId?: string;
    onSelect?: (imageId: string) => void;
    emptyMessage?: string;
  }) => (
    <div data-testid="image-selector">
      <span data-testid="selected-id">{selectedId || ''}</span>
      <button
        onClick={() => onSelect?.('test-image-id')}
        data-testid="select-image-btn"
      >
        Select Image
      </button>
      <span>{emptyMessage}</span>
    </div>
  ),
}));

describe('BlockConfig', () => {
  const defaultProps = {
    blockId: 'test-block-1',
    blockType: 'click',
    config: {},
    externalValidationSeverity: undefined as 'error' | 'warning' | undefined,
    externalValidationMessage: null as string | null,
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
  it('应该渲染配置面板容器', () => {
  render(<BlockConfig {...defaultProps} />);
  expect(screen.getByTestId('block-config-test-block-1')).toBeInTheDocument();
  });

    it('应该在传入节点级校验信息时显示结构错误摘要', () => {
      render(
        <BlockConfig
          {...defaultProps}
          externalValidationSeverity="error"
          externalValidationMessage="条件块结构错误"
        />
      );

      expect(screen.getByText('结构错误：')).toBeInTheDocument();
      expect(screen.getByText('条件块结构错误')).toBeInTheDocument();
    });

    it('应该在传入节点级校验信息时显示结构警告摘要', () => {
      render(
        <BlockConfig
          {...defaultProps}
          externalValidationSeverity="warning"
          externalValidationMessage="等待时间为 0"
        />
      );

      expect(screen.getByText('结构警告：')).toBeInTheDocument();
      expect(screen.getByText('等待时间为 0')).toBeInTheDocument();
    });

    it('应该显示积木块类型的显示名称', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      expect(screen.getByText('点击')).toBeInTheDocument();
    });

    it('应该显示保存和取消按钮', () => {
      render(<BlockConfig {...defaultProps} />);
      expect(screen.getByTestId('btn-save-config')).toBeInTheDocument();
      expect(screen.getByTestId('btn-cancel-config')).toBeInTheDocument();
    });
  });

  describe('ClickBlock 配置', () => {
    it('应该渲染坐标模式和图片模式选择器', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      expect(screen.getByTestId('click-config')).toBeInTheDocument();
      expect(screen.getByTestId('mode-coordinates')).toBeInTheDocument();
      expect(screen.getByTestId('mode-image')).toBeInTheDocument();
    });

    it('默认应选择坐标模式并显示坐标输入', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      expect(screen.getByTestId('input-x')).toBeInTheDocument();
      expect(screen.getByTestId('input-y')).toBeInTheDocument();
    });

    it('切换到图片模式时应显示图片选择器', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      fireEvent.click(screen.getByTestId('mode-image'));
      expect(screen.getByTestId('image-selector')).toBeInTheDocument();
    });

    it('应该能够修改坐标值', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      const xInput = screen.getByTestId('input-x') as HTMLInputElement;
      fireEvent.change(xInput, { target: { value: '100' } });
      expect(xInput.value).toBe('100');
    });

    it('应该能够修改点击次数', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      const countInput = screen.getByTestId('input-count') as HTMLInputElement;
      fireEvent.change(countInput, { target: { value: '2' } });
      expect(countInput.value).toBe('2');
    });

    it('坐标模式下输入有效坐标时保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      const xInput = screen.getByTestId('input-x') as HTMLInputElement;
      const yInput = screen.getByTestId('input-y') as HTMLInputElement;
      fireEvent.change(xInput, { target: { value: '100' } });
      fireEvent.change(yInput, { target: { value: '200' } });
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });

    it('图片模式下选择图片后保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="click" />);
      fireEvent.click(screen.getByTestId('mode-image'));
      fireEvent.click(screen.getByTestId('select-image-btn'));
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('WaitImageBlock 配置', () => {
    it('应该渲染图片选择器和超时输入', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_image" />);
      expect(screen.getByTestId('wait-image-config')).toBeInTheDocument();
      expect(screen.getByTestId('image-selector')).toBeInTheDocument();
      expect(screen.getByTestId('input-timeout')).toBeInTheDocument();
    });

    it('应该能够修改超时时间', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_image" />);
      const timeoutInput = screen.getByTestId('input-timeout') as HTMLInputElement;
      fireEvent.change(timeoutInput, { target: { value: '10000' } });
      expect(timeoutInput.value).toBe('10000');
    });

    it('没有选择图片时保存按钮应禁用', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_image" />);
      expect(screen.getByTestId('btn-save-config')).toBeDisabled();
    });

    it('选择图片后保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_image" />);
      fireEvent.click(screen.getByTestId('select-image-btn'));
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('WaitTimeBlock 配置', () => {
    it('应该渲染等待时间输入', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_time" />);
      expect(screen.getByTestId('wait-time-config')).toBeInTheDocument();
      expect(screen.getByTestId('input-duration')).toBeInTheDocument();
    });

    it('应该能够修改等待时间', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_time" />);
      const durationInput = screen.getByTestId('input-duration') as HTMLInputElement;
      fireEvent.change(durationInput, { target: { value: '2000' } });
      expect(durationInput.value).toBe('2000');
    });

    it('有效等待时间时保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="wait_time" config={{ durationMs: 1000 }} />);
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('InputTextBlock 配置', () => {
    it('应该渲染文本输入和输入间隔', () => {
      render(<BlockConfig {...defaultProps} blockType="input_text" />);
      expect(screen.getByTestId('input-text-config')).toBeInTheDocument();
      expect(screen.getByTestId('input-text')).toBeInTheDocument();
      expect(screen.getByTestId('input-interval')).toBeInTheDocument();
    });

    it('应该能够修改输入文本', () => {
      render(<BlockConfig {...defaultProps} blockType="input_text" />);
      const textInput = screen.getByTestId('input-text') as HTMLTextAreaElement;
      fireEvent.change(textInput, { target: { value: 'Hello World' } });
      expect(textInput.value).toBe('Hello World');
    });

    it('应该能够修改输入间隔', () => {
      render(<BlockConfig {...defaultProps} blockType="input_text" />);
      const intervalInput = screen.getByTestId('input-interval') as HTMLInputElement;
      fireEvent.change(intervalInput, { target: { value: '100' } });
      expect(intervalInput.value).toBe('100');
    });

    it('没有输入文本时保存按钮应禁用', () => {
      render(<BlockConfig {...defaultProps} blockType="input_text" />);
      expect(screen.getByTestId('btn-save-config')).toBeDisabled();
    });

    it('输入文本后保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="input_text" config={{ text: 'Test text' }} />);
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('LoopBlock 配置', () => {
    it('应该渲染循环次数输入', () => {
      render(<BlockConfig {...defaultProps} blockType="loop" />);
      expect(screen.getByTestId('loop-config')).toBeInTheDocument();
      expect(screen.getByTestId('input-loop-count')).toBeInTheDocument();
    });

    it('应该能够修改循环次数', () => {
      render(<BlockConfig {...defaultProps} blockType="loop" />);
      const countInput = screen.getByTestId('input-loop-count') as HTMLInputElement;
      fireEvent.change(countInput, { target: { value: '5' } });
      expect(countInput.value).toBe('5');
    });

    it('有效循环次数时保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="loop" config={{ count: 3 }} />);
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('LoopInfiniteBlock 配置', () => {
    it('应该渲染无限循环说明', () => {
      render(<BlockConfig {...defaultProps} blockType="loop_infinite" />);
      expect(screen.getByTestId('loop-infinite-config')).toBeInTheDocument();
    });

    it('无限循环保存按钮应始终可用', () => {
      render(<BlockConfig {...defaultProps} blockType="loop_infinite" />);
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('ConditionalBlock 配置', () => {
    it('应该渲染条件选择器和图片选择器', () => {
      render(<BlockConfig {...defaultProps} blockType="condition" />);
      expect(screen.getByTestId('condition-config')).toBeInTheDocument();
      expect(screen.getByTestId('select-condition')).toBeInTheDocument();
      expect(screen.getByTestId('image-selector')).toBeInTheDocument();
    });

    it('应该能够切换条件类型', () => {
      render(<BlockConfig {...defaultProps} blockType="condition" />);
      const select = screen.getByTestId('select-condition') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'image_not_exists' } });
      expect(select.value).toBe('image_not_exists');
    });

    it('没有选择图片时保存按钮应禁用', () => {
      render(<BlockConfig {...defaultProps} blockType="condition" />);
      expect(screen.getByTestId('btn-save-config')).toBeDisabled();
    });

    it('选择图片后保存按钮应可用', () => {
      render(<BlockConfig {...defaultProps} blockType="condition" config={{ imageId: 'test-image', condition: 'image_exists' }} />);
      expect(screen.getByTestId('btn-save-config')).not.toBeDisabled();
    });
  });

  describe('保存和取消功能', () => {
    it('点击保存按钮应调用 onSave', async () => {
      const onSave = vi.fn();
      render(<BlockConfig {...defaultProps} blockType="loop" config={{ count: 1 }} onSave={onSave} />);
      
      fireEvent.click(screen.getByTestId('btn-save-config'));
      
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('点击取消按钮应调用 onCancel', () => {
      const onCancel = vi.fn();
      render(<BlockConfig {...defaultProps} blockType="click" onCancel={onCancel} />);
      
      fireEvent.click(screen.getByTestId('btn-cancel-config'));
      
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('未知积木块类型', () => {
    it('应显示未知类型提示', () => {
      render(<BlockConfig {...defaultProps} blockType="unknown_type" />);
      expect(screen.getByText('未知积木块类型: unknown_type')).toBeInTheDocument();
    });
  });

  describe('积木块类型名称显示', () => {
    it.each([
      ['click', '点击'],
      ['wait_time', '等待时间'],
      ['loop', '循环'],
      ['loop_infinite', '无限循环'],
      ['condition', '条件判断'],
    ])('应显示 %s 的正确名称 %s', (blockType, expectedName) => {
      render(<BlockConfig {...defaultProps} blockType={blockType} />);
      // Use getByTestId for the type span to avoid duplicate text issues
      expect(screen.getByTestId('block-config-test-block-1').querySelector('.block-config__type')).toHaveTextContent(expectedName);
    });
  });
});
