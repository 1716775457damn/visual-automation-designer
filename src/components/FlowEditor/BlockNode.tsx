/**
 * BlockNode - 积木块节点渲染组件
 * 渲染单个积木块节点，支持选中、高亮状态
 * 使用 react-flow 的自定义节点接口
 * 
 * Validates: Requirements 2.2, 5.2
 */

import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import styles from './FlowEditor.module.css';

// Block types
export type BlockCategory = 'action' | 'control';
export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text';
export type ControlType = 'loop' | 'loop_infinite' | 'condition';

export interface BlockNodeData {
  label: string;
  blockType: ActionType | ControlType;
  blockCategory: BlockCategory;
  executing?: boolean;
  disabled?: boolean;
  isEntryPoint?: boolean;
  recent?: boolean;
  validationSeverity?: 'error' | 'warning';
  validationMessage?: string;
  config?: Record<string, unknown>;
}

/**
 * BlockNode 组件 - 渲染单个积木块节点
 * 作为 react-flow 的自定义节点使用
 */
function BlockNodeComponent({ data, selected }: NodeProps<BlockNodeData>) {
  const { label, blockType, blockCategory, executing, disabled, isEntryPoint, recent, validationSeverity, validationMessage, config } = data;
  const [showTooltip, setShowTooltip] = useState(false);

  // UX优化141: 连接提示状态
  const [showConnectionHint, setShowConnectionHint] = useState<'input' | 'output' | 'condition-true' | 'condition-false' | null>(null);

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

  // UX优化61: 获取完整配置描述用于工具提示
  const getFullDescription = (): string => {
    const lines: string[] = [label];
    
    if (config) {
      if (blockType === 'click') {
        const mode = (config as { mode?: { mode: string; x?: number; y?: number; imageId?: string } }).mode;
        if (mode?.mode === 'coordinates') {
          lines.push(`坐标: (${mode.x}, ${mode.y})`);
        } else if (mode?.mode === 'image') {
          lines.push(`图片模式`);
        }
        lines.push(`点击次数: ${(config as { count?: number }).count || 1}`);
      } else if (blockType === 'wait_time') {
        lines.push(`等待: ${(config as { durationMs?: number }).durationMs || 1000}ms`);
      } else if (blockType === 'loop') {
        lines.push(`循环: ${(config as { count?: number }).count || 1} 次`);
      }
    }
    
    return lines.join('\n');
  };

  const blockColor = getBlockColor();
  const configSummary = getConfigSummary();

  const outputHintMessage = (() => {
    if (blockType === 'condition') {
      return '不支持默认出口；请使用“真/假”分支';
    }

    if (blockType === 'loop' || blockType === 'loop_infinite') {
      return '循环体暂仅支持 1 个直接子节点';
    }

    return '连接到下一节点';
  })();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Let ReactFlow handle selection via click simulation
      (e.currentTarget as HTMLElement).click();
    } else if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
    // Delete/Backspace handled by FlowCanvas global hotkeys
  };

  const categoryLabel = blockCategory === 'action' ? '动作' : '控制';
  const ariaLabel = `${categoryLabel}节点：${label}，类型：${blockType}`;

  return (
    <div
      className={`block-node block-node--${blockCategory} ${selected ? 'block-node--selected' : ''} ${executing ? 'block-node--executing' : ''} ${disabled ? 'block-node--disabled' : ''} ${recent ? 'block-node--recent' : ''} ${validationSeverity ? `block-node--validation-${validationSeverity}` : ''}`}
      data-testid={`block-node-${blockType}`}
      data-block-type={blockType}
      data-block-category={blockCategory}
      style={{ borderLeftColor: blockColor }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="block-node__handle block-node__handle--input"
        onMouseEnter={() => setShowConnectionHint('input')}
        onMouseLeave={() => setShowConnectionHint(null)}
      />

      {/* UX优化141: 连接提示 */}
      {showConnectionHint === 'input' && (
        <div className={`${styles.blockNodeConnectionHint} ${styles.blockNodeConnectionHintInput}`}>
          连接到上一节点
        </div>
      )}

      {/* UX优化62: 入口点标记 */}
      {isEntryPoint && (
        <div className={styles.blockNodeEntryBadge} title="起点">
          🚀
        </div>
      )}

      {validationSeverity && (
        <div
          className={`${styles.blockNodeValidationBadge} ${styles[`blockNodeValidationBadge${validationSeverity.charAt(0).toUpperCase() + validationSeverity.slice(1)}`]}`}
          title={validationMessage ?? ''}
          aria-label={validationSeverity === 'error' ? '节点存在错误' : '节点存在警告'}
        >
          {validationSeverity === 'error' ? '错' : '警'}
        </div>
      )}

      {/* UX优化63: 禁用状态覆盖层 */}
      {disabled && (
        <div className={styles.blockNodeDisabledOverlay} title="已禁用">
          🚫
        </div>
      )}

      <div className={styles.blockNodeHeader} style={{ backgroundColor: `${blockColor}20` }}>
        <span className={styles.blockNodeIcon}>{getBlockIcon()}</span>
        <span className={styles.blockNodeLabel}>{label}</span>
        <span className={styles.blockNodeTypeBadge}>{blockCategory === 'action' ? '动作' : '控制'}</span>
      </div>

      {configSummary && (
        <div className={styles.blockNodeContent}>
          <span className={styles.blockNodeConfig}>{configSummary}</span>
        </div>
      )}

      {validationMessage && (
        <div className={`${styles.blockNodeValidationMessage} ${styles[`blockNodeValidationMessage${(validationSeverity ?? 'warning').charAt(0).toUpperCase() + (validationSeverity ?? 'warning').slice(1)}`]}`}>
          <strong className="block-node__validation-label">
            {validationSeverity === 'error' ? '错误：' : '警告：'}
          </strong>
          <span>{validationMessage}</span>
        </div>
      )}

      {/* UX优化61: 悬停工具提示 */}
      {showTooltip && (
        <div className={styles.blockNodeTooltip}>
          {getFullDescription().split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="block-node__handle block-node__handle--output"
        onMouseEnter={() => setShowConnectionHint('output')}
        onMouseLeave={() => setShowConnectionHint(null)}
      />

      {/* UX优化141: 连接提示 */}
      {showConnectionHint === 'output' && (
        <div className={`${styles.blockNodeConnectionHint} ${styles.blockNodeConnectionHintOutput}`}>
          {outputHintMessage}
        </div>
      )}

      {/* Additional output handles for condition blocks */}
      {blockType === 'condition' && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: '30%' }}
            className={`${styles.blockNodeHandle} ${styles.blockNodeHandleTrue}`}
            onMouseEnter={() => setShowConnectionHint('condition-true')}
            onMouseLeave={() => setShowConnectionHint(null)}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: '70%' }}
            className={`${styles.blockNodeHandle} ${styles.blockNodeHandleFalse}`}
            onMouseEnter={() => setShowConnectionHint('condition-false')}
            onMouseLeave={() => setShowConnectionHint(null)}
          />
        </>
      )}

      {showConnectionHint === 'condition-true' && (
        <div className={`${styles.blockNodeConnectionHint} ${styles.blockNodeConnectionHintOutput}`}>
          真分支：仅连接 1 个直接节点
        </div>
      )}

      {showConnectionHint === 'condition-false' && (
        <div className={`${styles.blockNodeConnectionHint} ${styles.blockNodeConnectionHintOutput}`}>
          假分支：仅连接 1 个直接节点
        </div>
      )}

      {/* Executing indicator */}
      {executing && (
        <div className={styles.blockNodeExecutingIndicator}>
          <span className={styles.blockNodePulse} />
        </div>
      )}

      {recent && (
        <div className={styles.blockNodeRecentIndicator} aria-hidden="true">
          ✨
        </div>
      )}

      {/* UX优化155: 执行预览覆盖层 */}
      {executing && (
        <div className={styles.blockExecutionPreview}>
          <div className={styles.blockExecutionPreviewSpinner} />
          <span>执行中...</span>
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
