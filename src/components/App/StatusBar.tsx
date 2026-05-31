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
  flowValidationErrors?: ValidationErrorResponse[];
  flowValidationWarnings?: ValidationErrorResponse[];
  primaryFlowValidationError?: ValidationErrorResponse | null;
  primaryFlowValidationWarning?: ValidationErrorResponse | null;
  placementLabel?: string | null;
  onFocusNode?: (blockId: string) => void;
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
  flowValidationErrors = [],
  flowValidationWarnings = [],
  primaryFlowValidationError,
  primaryFlowValidationWarning,
  placementLabel,
  onFocusNode,
}: StatusBarProps) {
  const saveStatusLabel = loading ? '同步中' : isDirty ? '未保存' : '已同步';
  const validationMessage = primaryFlowValidationError?.message ?? primaryFlowValidationWarning?.message ?? null;
  const validationClassName = primaryFlowValidationError
    ? 'app__status-item app__status-item--error'
    : 'app__status-item app__status-item--warning';
  const validationSummary = [
    flowValidationErrors.length > 0 ? `错误 ${flowValidationErrors.length}` : null,
    flowValidationWarnings.length > 0 ? `警告 ${flowValidationWarnings.length}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="app__status" role="status" aria-live="polite" aria-label="状态栏">
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
        {!flowError && validationMessage && (
          (primaryFlowValidationError?.blockId || primaryFlowValidationWarning?.blockId) && onFocusNode ? (
            <button
              className={`${validationClassName} app__status-item--clickable`}
              onClick={() => {
                const blockId = primaryFlowValidationError?.blockId ?? primaryFlowValidationWarning?.blockId;
                if (blockId) onFocusNode(blockId);
              }}
              title={`定位到积木块 ${primaryFlowValidationError?.blockId ?? primaryFlowValidationWarning?.blockId ?? ''}`}
              type="button"
            >
              ⚠️ {validationMessage}
              {validationSummary ? `（${validationSummary}）` : ''}
            </button>
          ) : (
            <span className={validationClassName}>
              ⚠️ {validationMessage}
              {validationSummary ? `（${validationSummary}）` : ''}
            </span>
          )
        )}
      </div>
    </div>
  );
}

export default StatusBar;
