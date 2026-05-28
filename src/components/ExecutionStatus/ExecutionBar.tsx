/**
 * ExecutionBar - Execution Status Bar Component
 * Displays current execution status and progress
 * 
 * Validates: Requirements 5.2, 5.3
 */

import { useMemo } from 'react';
import { classifyDiagnosticKind } from './diagnostics';

export type ExecutionStatusType = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'validation_blocked' | 'error';

export interface ExecutionBarProps {
  status?: ExecutionStatusType;
  currentBlock?: string;
  totalBlocks?: number;
  completedBlocks?: number;
  errorMessage?: string;
}

const STATUS_LABELS: Record<ExecutionStatusType, string> = {
  idle: '就绪',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
  validation_blocked: '校验阻断',
  error: '出错',
};

// UX优化: 使用更直观的emoji图标
const STATUS_EMOJIS: Record<ExecutionStatusType, string> = {
  idle: '⚪',
  running: '🔵',
  paused: '🟡',
  completed: '🟢',
  stopped: '⏹️',
  validation_blocked: '🚫',
  error: '🔴',
};

/**
 * ExecutionBar Component - Execution Status Bar
 * Shows execution status with visual indicator and progress bar
 */
export function ExecutionBar({
  status = 'idle',
  currentBlock,
  totalBlocks = 0,
  completedBlocks = 0,
  errorMessage,
}: ExecutionBarProps) {
  // Calculate progress percentage
  const progress = useMemo(() => {
    if (totalBlocks <= 0) return 0;
    return Math.round((completedBlocks / totalBlocks) * 100);
  }, [totalBlocks, completedBlocks]);

  // Determine if we should show progress bar
  const showProgress = status === 'running' || status === 'paused';

  // UX优化147: 计算进度环参数
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const errorCategory = errorMessage
    ? classifyDiagnosticKind({
        type: status === 'validation_blocked' ? 'validation_blocked' : status,
        message: errorMessage,
      })
    : null;

  return (
    <div
      className={`execution-bar execution-bar--${status}`}
      data-testid="execution-bar"
      role="status"
      aria-live="polite"
      aria-label={`执行状态: ${STATUS_LABELS[status]}`}
    >
      {/* Status Indicator - UX优化: 使用emoji */}
      <div className="execution-bar__status">
        <span 
          className="execution-bar__indicator" 
          aria-hidden="true"
        >
          {STATUS_EMOJIS[status]}
        </span>
        <span className="execution-bar__label">
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Progress Bar (only when running or paused) */}
      {showProgress && (
        <div className="execution-bar__progress">
          <div 
            className="execution-bar__progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`执行进度: ${progress}%`}
          >
            <div
              className="execution-bar__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="execution-bar__progress-text">
            {completedBlocks}/{totalBlocks} ({progress}%)
          </span>
        </div>
      )}

      {/* UX优化147: 进度环显示 (当有进度时) */}
      {showProgress && totalBlocks > 0 && (
        <div className="execution-progress-ring" aria-hidden="true">
          <svg className="execution-progress-ring__svg" width={48} height={48}>
            <circle
              className="execution-progress-ring__background"
              cx={24}
              cy={24}
              r={radius}
            />
            <circle
              className="execution-progress-ring__progress"
              cx={24}
              cy={24}
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <span className="execution-progress-ring__text">{progress}%</span>
        </div>
      )}

      {/* Current Block Name - UX优化: 更清晰的显示 */}
      {currentBlock && showProgress && (
        <div className="execution-bar__current">
          ▶ {currentBlock}
        </div>
      )}

      {/* Error Message - UX优化: 更明显的错误提示 */}
      {(status === 'error' || status === 'validation_blocked' || status === 'stopped') && errorMessage && (
        <div 
          className="execution-bar__error" 
          data-testid="execution-error"
          role="alert"
        >
          {status === 'stopped' ? '⏹️' : status === 'validation_blocked' ? '🚫' : '❌'} {errorCategory ? `[${errorCategory}] ` : ''}{errorMessage}
        </div>
      )}
    </div>
  );
}

export default ExecutionBar;
