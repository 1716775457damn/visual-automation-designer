/**
 * ExecutionBar - Execution Status Bar Component
 * Displays current execution status and progress
 * 
 * Validates: Requirements 5.2, 5.3
 */

import { useMemo } from 'react';

export type ExecutionStatusType = 'idle' | 'running' | 'paused' | 'completed' | 'error';

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
  error: '出错',
};

// UX优化: 使用更直观的emoji图标
const STATUS_EMOJIS: Record<ExecutionStatusType, string> = {
  idle: '⚪',
  running: '🔵',
  paused: '🟡',
  completed: '🟢',
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

      {/* Current Block Name - UX优化: 更清晰的显示 */}
      {currentBlock && showProgress && (
        <div className="execution-bar__current">
          ▶ {currentBlock}
        </div>
      )}

      {/* Error Message - UX优化: 更明显的错误提示 */}
      {status === 'error' && errorMessage && (
        <div 
          className="execution-bar__error" 
          data-testid="execution-error"
          role="alert"
        >
          ❌ {errorMessage}
        </div>
      )}
    </div>
  );
}

export default ExecutionBar;
