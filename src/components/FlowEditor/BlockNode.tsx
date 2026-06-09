/**
 * BlockNode - 积木块节点渲染组件
 * 渲染单个积木块节点，支持选中、高亮状态
 * 使用 react-flow 的自定义节点接口
 *
 * 端口渲染基于端口系统（Phase A）：每个节点类型从 PortDefinitions
 * 读取输入/输出端口信息，动态渲染手柄。
 *
 * Validates: Requirements 2.2, 5.2, Phase A
 */

import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { getPortDefinitions, type PortSchema } from '../../types/port';
import styles from './FlowEditor.module.css';

// Block types
export type BlockCategory = 'action' | 'control';
export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text' | 'text_extract' | 'screenshot_assert';
export type ControlType = 'loop' | 'loop_infinite' | 'condition' | 'text_check';

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

// ── Module-level pure helpers ──────────────────────────────────────

function getBlockColor(blockType: string, blockCategory: string): string {
  if (blockCategory === 'action') {
    switch (blockType) {
      case 'click':
        return 'var(--color-block-click, #ff9800)';
      case 'wait_image':
      case 'wait_time':
        return 'var(--color-block-wait, #9c27b0)';
      case 'input_text':
        return 'var(--color-block-action, #4caf50)';
      case 'text_extract':
        return 'var(--color-block-ocr, #795548)';
      case 'screenshot_assert':
        return 'var(--color-block-screenshot, #f44336)';
      default:
        return 'var(--color-block-action, #4caf50)';
    }
  } else {
    switch (blockType) {
      case 'loop':
      case 'loop_infinite':
        return 'var(--color-block-loop, #00bcd4)';
      case 'condition':
        return 'var(--color-block-condition, #e91e63)';
      case 'text_check':
        return 'var(--color-block-ocr-check, #795548)';
      default:
        return 'var(--color-block-control, #2196f3)';
    }
  }
}

function getBlockIcon(blockType: string, blockCategory: string): string {
  if (blockCategory === 'action') {
    switch (blockType) {
      case 'click': return '👆';
      case 'wait_image': return '🔍';
      case 'wait_time': return '⏱️';
      case 'input_text': return '⌨️';
      case 'text_extract': return '👁️';
      case 'screenshot_assert': return '📸';
      default: return '▶️';
    }
  } else {
    switch (blockType) {
      case 'loop':
      case 'loop_infinite': return '🔄';
      case 'condition': return '❓';
      case 'text_check': return '🔤';
      default: return '🔀';
    }
  }
}

function getConfigSummary(blockType: string, blockCategory: string, config?: Record<string, unknown>): string | null {
  if (!config) return null;

  if (blockCategory === 'action') {
    switch (blockType) {
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
      case 'text_extract':
        return (config as { language?: string }).language
          ? `语言: ${(config as { language?: string }).language}`
          : null;
      case 'screenshot_assert': {
        const threshold = (config as { threshold?: number }).threshold;
        const strict = (config as { strictMode?: boolean }).strictMode;
        const parts: string[] = [];
        if (threshold !== undefined) parts.push(`阈值: ${threshold}`);
        if (strict) parts.push('严格模式');
        return parts.length > 0 ? parts.join(', ') : '截图比对';
      }
      default:
        return null;
    }
  } else {
    switch (blockType) {
      case 'loop':
        return (config as { count?: number }).count
          ? `${(config as { count?: number }).count} 次`
          : null;
      case 'text_check':
        return (config as { keyword?: string }).keyword
          ? `"${(config as { keyword?: string }).keyword}"`
          : null;
      default:
        return null;
    }
  }
}

// ── Port type color mapping (Phase A) ─────────────────────────────

const PORT_TYPE_COLORS: Record<string, string> = {
  string: '#4caf50',
  number: '#2196f3',
  boolean: '#ff9800',
  image_ref: '#e91e63',
  coordinate: '#9c27b0',
  any: '#607d8b',
};

function getPortColor(portType: string): string {
  return PORT_TYPE_COLORS[portType] ?? '#607d8b';
}

// ── Existing helpers ───────────────────────────────────────────────

function getFullDescription(blockType: string, label: string, config?: Record<string, unknown>): string {
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
    } else if (blockType === 'text_extract') {
      const lang = (config as { language?: string }).language;
      lines.push(lang ? `OCR 语言: ${lang}` : 'OCR (全屏)');
    } else if (blockType === 'screenshot_assert') {
      const sc = config as { imageId?: string; threshold?: number; strictMode?: boolean; region?: { x: number; y: number; width: number; height: number } };
      lines.push(`阈值: ${sc.threshold ?? 0.0}`);
      lines.push(`严格模式: ${sc.strictMode ? '是' : '否'}`);
      if (sc.region) { lines.push(`区域: (${sc.region.x},${sc.region.y}) ${sc.region.width}x${sc.region.height}`); }
    } else if (blockType === 'text_check') {
      const kw = (config as { keyword?: string }).keyword;
      lines.push(kw ? `检测文字: "${kw}"` : '检测文字');
    }
  }

  return lines.join('\n');
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

  const blockColor = getBlockColor(blockType, blockCategory);
  const configSummary = getConfigSummary(blockType, blockCategory, config);

  // Port definitions (Phase A)
  const portDefs = (() => {
    const defs = getPortDefinitions(blockType);
    return defs ? { inputs: defs.inputs, outputs: defs.outputs } : { inputs: [] as PortSchema[], outputs: [] as PortSchema[] };
  })();

  const outputHintMessage = (() => {
    if (blockType === 'condition' || blockType === 'text_check') {
      return '不支持默认出口；请使用"真/假"分支';
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
      className={`block-node block-node--${blockCategory} ${styles.blockNode} ${styles[`blockNode${blockCategory.charAt(0).toUpperCase() + blockCategory.slice(1)}`]} ${selected ? `block-node--selected ${styles.blockNodeSelected}` : ''} ${executing ? `block-node--executing ${styles.blockNodeExecuting}` : ''} ${disabled ? `block-node--disabled ${styles.blockNodeDisabled}` : ''} ${recent ? `block-node--recent ${styles.blockNodeRecent}` : ''} ${validationSeverity ? `block-node--validation-${validationSeverity} ${styles[`blockNodeValidation${validationSeverity.charAt(0).toUpperCase() + validationSeverity.slice(1)}`]}` : ''}`}
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
      {/* Input handles (动态渲染自端口定义, Phase A) */}
      {portDefs.inputs.length > 0 ? (
        portDefs.inputs.map((port, idx) => (
          <Handle
            key={port.name}
            type="target"
            position={Position.Top}
            id={port.name}
            className={`${styles.blockNodeHandle} ${styles.reactFlowHandle} ${styles.reactFlowHandleTop}`}
            style={{
              left: `${((idx + 1) * 100) / (portDefs.inputs.length + 1)}%`,
              backgroundColor: getPortColor(port.portType),
              width: 12,
              height: 12,
              border: '2px solid #fff',
            }}
            title={`${port.label} (${port.portType})`}
            onMouseEnter={() => setShowConnectionHint('input')}
            onMouseLeave={() => setShowConnectionHint(null)}
          />
        ))
      ) : (
        <Handle
          type="target"
          position={Position.Top}
          className={`${styles.blockNodeHandle} ${styles.reactFlowHandle} ${styles.reactFlowHandleTop} ${styles.blockNodeHandleHidden}`}
          style={{ opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        />
      )}

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
        <span className={styles.blockNodeIcon}>{getBlockIcon(blockType, blockCategory)}</span>
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
          {getFullDescription(blockType, label, config).split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Output handles (动态渲染自端口定义, Phase A) */}
      {portDefs.outputs.map((port, idx, arr) => {
        // Special positioning for condition branch handles
        let leftStyle = arr.length > 1 ? `${((idx + 1) * 100) / (arr.length + 1)}%` : '50%';
        let handleHint: 'output' | 'condition-true' | 'condition-false' = 'output';
        if (blockType === 'condition' || blockType === 'text_check') {
          if (port.name === 'true') { leftStyle = '30%'; handleHint = 'condition-true'; }
          if (port.name === 'false') { leftStyle = '70%'; handleHint = 'condition-false'; }
        }
        return (
          <Handle
            key={port.name}
            type="source"
            position={Position.Bottom}
            id={port.name}
            className={`${styles.blockNodeHandle} ${styles.reactFlowHandle} ${styles.reactFlowHandleBottom} ${
              port.name === 'true' ? styles.blockNodeHandleTrue : ''
            } ${port.name === 'false' ? styles.blockNodeHandleFalse : ''}`}
            style={{
              left: leftStyle,
              backgroundColor: getPortColor(port.portType),
              width: 12,
              height: 12,
              border: '2px solid #fff',
            }}
            title={`${port.label} (${port.portType})`}
            onMouseEnter={() => setShowConnectionHint(handleHint)}
            onMouseLeave={() => setShowConnectionHint(null)}
          />
        );
      })}

      {/* UX优化141: 连接提示 */}
      {showConnectionHint === 'output' && (
        <div className={`${styles.blockNodeConnectionHint} ${styles.blockNodeConnectionHintOutput}`}>
          {outputHintMessage}
        </div>
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
