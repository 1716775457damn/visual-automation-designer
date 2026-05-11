/**
 * ExecutionLog - Execution Log Component
 * Listens to ExecutionEvent and displays execution log
 * 
 * Validates: Requirements 5.2, 5.4
 */

import { useEffect, useRef } from 'react';

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
}

// Event type to log type mapping
const EVENT_TYPE_TO_LOG_TYPE: Record<string, LogEntry['type']> = {
  started: 'info',
  block_started: 'info',
  block_completed: 'success',
  block_error: 'error',
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
  flow_completed: '流程完成',
  stopped: '已停止',
  paused: '已暂停',
  resumed: '继续执行',
};

/**
 * Get message for log entry based on event
 * (Reserved for future use with custom message formatting)
 */
// function getLogMessage(entry: LogEntry): string {
//   const typeLabel = EVENT_TYPE_LABELS[entry.type] || entry.type;
//   
//   if (entry.blockId) {
//     return `${typeLabel}: 积木块 ${entry.blockId.slice(0, 8)}`;
//   }
//   
//   return typeLabel;
// }

/**
 * ExecutionLog Component - Execution Log Display
 * Shows a scrollable list of execution log entries
 */
export function ExecutionLog({
  entries = [],
  maxHeight = 200,
  autoScroll = true,
}: ExecutionLogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(autoScroll);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (autoScroll && contentRef.current && shouldAutoScroll.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Format time for display
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Empty state
  const isEmpty = entries.length === 0;

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
        <h4>执行日志</h4>
        <span className="execution-log__count" aria-label={`${entries.length} 条记录`}>
          {entries.length} 条记录
        </span>
      </div>

      {/* Content */}
      <div 
        className="execution-log__content" 
        ref={contentRef}
        tabIndex={0}
      >
        {isEmpty ? (
          <div className="execution-log__empty" role="status">
            暂无日志
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`execution-log__entry execution-log__entry--${entry.type}`}
              data-testid={`log-entry-${entry.id}`}
              role="listitem"
            >
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
