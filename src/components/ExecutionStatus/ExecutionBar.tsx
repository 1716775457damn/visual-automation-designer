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
  idle: '空闲',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  error: '错误',
};

const STATUS_ICONS: Record<ExecutionStatusType, string> = {
  idle: '○',
  running: '●',
  paused: '❚❚',
  completed: '✓',
  error: '✕',
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
      {/* Status Indicator */}
      <div className="execution-bar__status">
        <span 
          className="execution-bar__indicator" 
          aria-hidden="true"
        >
          {STATUS_ICONS[status]}
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
            {completedBlocks}/{totalBlocks}
          </span>
        </div>
      )}

      {/* Current Block Name */}
      {currentBlock && (
        <div className="execution-bar__current">
          当前: {currentBlock}
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && errorMessage && (
        <div 
          className="execution-bar__error" 
          data-testid="execution-error"
          role="alert"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

export default ExecutionBar;
