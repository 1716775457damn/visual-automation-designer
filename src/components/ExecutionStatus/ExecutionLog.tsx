/**
 * ExecutionLog - Execution Log Component
 * Listens to ExecutionEvent and displays execution log
 * 
 * Validates: Requirements 5.2, 5.4
 */

import { useEffect, useRef, useState } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  blockId?: string;
}

export interface ExecutionLogProps {
  entries?: LogEntry[];
  maxHeight?: number;
  autoScroll?: boolean;
  collapsed?: boolean;
}

// Event type to log type mapping
const EVENT_TYPE_TO_LOG_TYPE: Record<string, LogEntry['type']> = {
  started: 'info',
  block_started: 'info',
  block_completed: 'success',
  block_error: 'error',
  execution_failed: 'error',
  flow_completed: 'success',
  stopped: 'warning',
  paused: 'warning',
  resumed: 'info',
};

// Event type labels in Chinese
const EVENT_TYPE_LABELS: Record<string, string> = {
  started: '执行开始',
  block_started: '开始执行',
  block_completed: '执行完成',
  block_error: '执行错误',
  execution_failed: '执行失败',
  flow_completed: '流程完成',
  stopped: '已停止',
  paused: '已暂停',
  resumed: '继续执行',
};

// UX优化81: 日志类型图标
const LOG_TYPE_ICONS: Record<LogEntry['type'], string> = {
  info: 'ℹ️',
  success: '✅',
  error: '❌',
  warning: '⚠️',
};

/**
 * ExecutionLog Component - Execution Log Display
 * Shows a scrollable list of execution log entries
 * 
 * UX优化81-85: Enhanced execution log
 */
export function ExecutionLog({
  entries = [],
  maxHeight = 200,
  autoScroll = true,
  collapsed = false,
}: ExecutionLogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(autoScroll);
  // UX优化82: 筛选状态
  const [filter, setFilter] = useState<LogEntry['type'] | 'all'>('all');
  // UX优化83: 搜索查询
  const [searchQuery, setSearchQuery] = useState('');
  // UX优化84: 暂停自动滚动
  const [isPaused, setIsPaused] = useState(false);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (autoScroll && contentRef.current && shouldAutoScroll.current && !isPaused) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [entries, autoScroll, isPaused]);

  // Format time for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // UX优化82: 筛选日志
  const filteredEntries = entries.filter((entry) => {
    if (filter !== 'all' && entry.type !== filter) return false;
    if (searchQuery && !entry.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Empty state
  const isEmpty = filteredEntries.length === 0;

  // UX优化85: 统计各类型日志数量
  const counts = {
    all: entries.length,
    info: entries.filter(e => e.type === 'info').length,
    success: entries.filter(e => e.type === 'success').length,
    error: entries.filter(e => e.type === 'error').length,
    warning: entries.filter(e => e.type === 'warning').length,
  };

  return (
    <div
      className="execution-log"
      style={{ maxHeight }}
      data-testid="execution-log"
      role="log"
      aria-label="执行日志"
      aria-live="polite"
    >
      {/* Header */}
      <div className="execution-log__header">
        <h4>📋 执行日志</h4>
        <span className="execution-log__count" aria-label={`${entries.length} 条记录`}>
          {entries.length} 条
        </span>
      </div>

      {!collapsed && (
        <>
      {/* UX优化82: 筛选器 */}
      <div className="execution-log__filters">
        {(['all', 'info', 'success', 'error', 'warning'] as const).map((type) => (
          <button
            key={type}
            className={`execution-log__filter-btn ${filter === type ? 'execution-log__filter-btn--active' : ''}`}
            onClick={() => setFilter(type)}
            data-testid={`filter-${type}`}
          >
            {type === 'all' ? '📊' : LOG_TYPE_ICONS[type]} 
            {type === 'all' ? '全部' : type === 'info' ? '信息' : type === 'success' ? '成功' : type === 'error' ? '错误' : '警告'}
            <span className="execution-log__filter-count">{counts[type]}</span>
          </button>
        ))}
      </div>

      {/* UX优化83: 搜索框 */}
      <div className="execution-log__search">
        <input
          type="text"
          placeholder="🔍 搜索日志..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="execution-log__search-input"
        />
        {searchQuery && (
          <button
            className="execution-log__search-clear"
            onClick={() => setSearchQuery('')}
          >
            ×
          </button>
        )}
      </div>

      {/* Content */}
      <div 
        className="execution-log__content" 
        ref={contentRef}
        tabIndex={0}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {isEmpty ? (
          <div className="execution-log__empty" role="status">
            {searchQuery || filter !== 'all' ? '没有匹配的日志' : '暂无日志'}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className={`execution-log__entry execution-log__entry--${entry.type}`}
              data-testid={`log-entry-${entry.id}`}
              role="listitem"
            >
              {/* UX优化81: 类型图标 */}
              <span className="execution-log__icon" aria-hidden="true">
                {LOG_TYPE_ICONS[entry.type]}
              </span>
              <span className="execution-log__time" aria-label={`时间: ${formatTime(entry.timestamp)}`}>
                {formatTime(entry.timestamp)}
              </span>
              <span className="execution-log__message">
                {entry.message}
              </span>
              {entry.blockId && (
                <span className="execution-log__block-id" aria-label={`积木块ID: ${entry.blockId}`}>
                  [{entry.blockId.slice(0, 8)}]
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* UX优化84: 自动滚动提示 */}
      {isPaused && entries.length > 0 && (
        <div className="execution-log__pause-hint">
          ⏸️ 自动滚动已暂停
        </div>
      )}
        </>
      )}
    </div>
  );
}

/**
 * Convert internal execution event to log entry
 */
export function executionEventToLogEntry(
  event: { 
    type: string; 
    timestamp: Date; 
    blockId?: string; 
    error?: string;
    success?: boolean;
  },
  index: number
): LogEntry {
  const logType = event.error ? 'error' : EVENT_TYPE_TO_LOG_TYPE[event.type] || 'info';
  
  let message = EVENT_TYPE_LABELS[event.type] || event.type;
  
  // Add block ID to message if present
  if (event.blockId) {
    message = `${message}: 积木块 ${event.blockId.slice(0, 8)}`;
  }
  
  // Add error message if present
  if (event.error) {
    message = `${message} - ${event.error}`;
  }

  return {
    id: `log-${index}-${event.timestamp.getTime()}`,
    timestamp: event.timestamp,
    type: logType,
    message,
    blockId: event.blockId,
  };
}

export default ExecutionLog;
