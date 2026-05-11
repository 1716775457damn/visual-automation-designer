/**
 * BlockNode - 积木块节点渲染组件
 * 渲染单个积木块节点，支持选中、高亮状态
 * 使用 react-flow 的自定义节点接口
 * 
 * Validates: Requirements 2.2, 5.2
 */

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

// Block types
export type BlockCategory = 'action' | 'control';
export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text';
export type ControlType = 'loop' | 'loop_infinite' | 'condition';

export interface BlockNodeData {
  label: string;
  blockType: ActionType | ControlType;
  blockCategory: BlockCategory;
  executing?: boolean;
  config?: Record<string, unknown>;
}

/**
 * BlockNode 组件 - 渲染单个积木块节点
 * 作为 react-flow 的自定义节点使用
 */
function BlockNodeComponent({ data, selected }: NodeProps<BlockNodeData>) {
  const { label, blockType, blockCategory, executing, config } = data;

  // Get block color based on type
  const getBlockColor = (): string => {
    if (blockCategory === 'action') {
      switch (blockType as ActionType) {
        case 'click':
          return 'var(--color-block-click, #ff9800)';
        case 'wait_image':
        case 'wait_time':
          return 'var(--color-block-wait, #9c27b0)';
        case 'input_text':
          return 'var(--color-block-action, #4caf50)';
        default:
          return 'var(--color-block-action, #4caf50)';
      }
    } else {
      switch (blockType as ControlType) {
        case 'loop':
        case 'loop_infinite':
          return 'var(--color-block-loop, #00bcd4)';
        case 'condition':
          return 'var(--color-block-condition, #e91e63)';
        default:
          return 'var(--color-block-control, #2196f3)';
      }
    }
  };

  // Get block icon based on type
  const getBlockIcon = (): string => {
    if (blockCategory === 'action') {
      switch (blockType as ActionType) {
        case 'click':
          return '👆';
        case 'wait_image':
          return '🔍';
        case 'wait_time':
          return '⏱️';
        case 'input_text':
          return '⌨️';
        default:
          return '▶️';
      }
    } else {
      switch (blockType as ControlType) {
        case 'loop':
        case 'loop_infinite':
          return '🔄';
        case 'condition':
          return '❓';
        default:
          return '🔀';
      }
    }
  };

  // Get config summary
  const getConfigSummary = (): string | null => {
    if (!config) return null;

    if (blockCategory === 'action') {
      switch (blockType as ActionType) {
        case 'click':
          return (config as { count?: number }).count 
            ? `点击 ${(config as { count?: number }).count} 次` 
            : null;
        case 'wait_time':
          return (config as { durationMs?: number }).durationMs 
            ? `${(config as { durationMs?: number }).durationMs}ms` 
            : null;
        case 'input_text':
          return (config as { text?: string }).text 
            ? `"${(config as { text?: string }).text}"` 
            : null;
        default:
          return null;
      }
    } else {
      switch (blockType as ControlType) {
        case 'loop':
          return (config as { count?: number }).count 
            ? `${(config as { count?: number }).count} 次` 
            : null;
        default:
          return null;
      }
    }
  };

  const blockColor = getBlockColor();
  const configSummary = getConfigSummary();

  return (
    <div
      className={`block-node block-node--${blockCategory} ${selected ? 'block-node--selected' : ''} ${executing ? 'block-node--executing' : ''}`}
      data-testid={`block-node-${blockType}`}
      data-block-type={blockType}
      data-block-category={blockCategory}
      style={{ borderLeftColor: blockColor }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="block-node__handle block-node__handle--input"
      />

      <div className="block-node__header" style={{ backgroundColor: `${blockColor}20` }}>
        <span className="block-node__icon">{getBlockIcon()}</span>
        <span className="block-node__label">{label}</span>
      </div>

      {configSummary && (
        <div className="block-node__content">
          <span className="block-node__config">{configSummary}</span>
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="block-node__handle block-node__handle--output"
      />

      {/* Additional output handles for condition blocks */}
      {blockType === 'condition' && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: '30%' }}
            className="block-node__handle block-node__handle--true"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: '70%' }}
            className="block-node__handle block-node__handle--false"
          />
        </>
      )}

      {/* Executing indicator */}
      {executing && (
        <div className="block-node__executing-indicator">
          <span className="block-node__pulse" />
        </div>
      )}
    </div>
  );
}

// Export memoized component
export const BlockNode = memo(BlockNodeComponent);

// Also export props type for backward compatibility
export interface BlockNodeProps {
  id: string;
  type: string;
  label: string;
  selected?: boolean;
  executing?: boolean;
  position?: { x: number; y: number };
}

export default BlockNode;
