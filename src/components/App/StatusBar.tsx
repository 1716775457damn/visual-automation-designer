import type { ValidationErrorResponse } from '../../tauri';
import { ExecutionBar } from '../ExecutionStatus';

export interface StatusBarProps {
  executionStatus: 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'validation_blocked' | 'error';
  currentBlockId: string | null;
  nodesCount: number;
  edgesCount: number;
  completedBlocks: number;
  errorMessage: string | null;
  flowName?: string;
  loading: boolean;
  isDirty: boolean;
  flowError?: Error | null;
  flowValidationError?: ValidationErrorResponse | null;
  flowValidationWarning?: ValidationErrorResponse | null;
  placementLabel?: string | null;
}

export function StatusBar({
  executionStatus,
  currentBlockId,
  nodesCount,
  edgesCount,
  completedBlocks,
  errorMessage,
  flowName,
  loading,
  isDirty,
  flowError,
  flowValidationError,
  flowValidationWarning,
  placementLabel,
}: StatusBarProps) {
  const saveStatusLabel = loading ? '同步中' : isDirty ? '未保存' : '已同步';
  const validationMessage = flowValidationError?.message ?? flowValidationWarning?.message ?? null;
  const validationClassName = flowValidationError
    ? 'app__status-item app__status-item--error'
    : 'app__status-item app__status-item--warning';

  return (
    <div className="app__status">
      <div className="app__status-cluster app__status-cluster--primary">
        <ExecutionBar
          status={executionStatus}
          currentBlock={currentBlockId || undefined}
          totalBlocks={nodesCount}
          completedBlocks={completedBlocks}
          errorMessage={errorMessage || undefined}
        />
      </div>

      <div className="app__status-cluster app__status-cluster--meta">
        <span className="app__status-item app__status-item--stats">🧩 {nodesCount} 积木块</span>
        <span className="app__status-item app__status-item--stats">🔗 {edgesCount} 连接</span>
        {flowName && <span className="app__status-item app__status-item--flow">📋 {flowName}</span>}
        {placementLabel && <span className="app__status-item app__status-item--placement">📍 放置中: {placementLabel}</span>}
        {flowName && !loading && (
          <span className={`app__status-item app__status-item--autosave ${isDirty ? 'app__status-item--dirty' : 'app__status-item--clean'}`}>
            {saveStatusLabel}
          </span>
        )}
        {loading && <span className="app__status-item app__status-item--loading">⏳ 加载中...</span>}
        {flowError && <span className="app__status-item app__status-item--error">⚠️ {flowError.message}</span>}
        {!flowError && validationMessage && <span className={validationClassName}>⚠️ {validationMessage}</span>}
      </div>
    </div>
  );
}

export default StatusBar;
