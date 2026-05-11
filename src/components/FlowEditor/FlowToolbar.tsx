/**
 * FlowToolbar - Toolbar Component
 * Provides save, execute, undo and other operation buttons
 * 
 * Validates: Requirements 2.6, 5.1, 5.5, 5.6, 7.1, 7.2
 */

export interface FlowToolbarProps {
  canUndo?: boolean;
  canRedo?: boolean;
  isExecuting?: boolean;
  isPaused?: boolean;
  onSave?: () => void;
  onLoad?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onExecute?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onStep?: () => void;
}

/**
 * FlowToolbar Component - Flow Editor Toolbar
 * Provides buttons for flow control, execution, and file operations
 */
export function FlowToolbar({
  canUndo = false,
  canRedo = false,
  isExecuting = false,
  isPaused = false,
  onSave,
  onLoad,
  onUndo,
  onRedo,
  onExecute,
  onPause,
  onStop,
  onStep,
}: FlowToolbarProps) {
  return (
    <div className="flow-toolbar" data-testid="flow-toolbar" role="toolbar" aria-label="流程编辑工具栏">
      {/* File Operations Group */}
      <div className="flow-toolbar__group flow-toolbar__group--file" role="group" aria-label="文件操作">
        <button
          className="flow-toolbar__btn"
          onClick={onSave}
          title="保存 (Ctrl+S)"
          data-testid="btn-save"
          type="button"
          aria-label="保存流程"
        >
          保存
        </button>
        <button
          className="flow-toolbar__btn"
          onClick={onLoad}
          title="打开 (Ctrl+O)"
          data-testid="btn-load"
          type="button"
          aria-label="打开流程"
        >
          打开
        </button>
      </div>

      {/* Edit Operations Group */}
      <div className="flow-toolbar__group flow-toolbar__group--edit" role="group" aria-label="编辑操作">
        <button
          className="flow-toolbar__btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
          data-testid="btn-undo"
          type="button"
          aria-label="撤销"
          aria-disabled={!canUndo}
        >
          撤销
        </button>
        <button
          className="flow-toolbar__btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Y)"
          data-testid="btn-redo"
          type="button"
          aria-label="重做"
          aria-disabled={!canRedo}
        >
          重做
        </button>
      </div>

      {/* Execution Control Group */}
      <div className="flow-toolbar__group flow-toolbar__group--execute" role="group" aria-label="执行控制">
        {!isExecuting ? (
          // Execute button (shown when not executing)
          <button
            className="flow-toolbar__btn flow-toolbar__btn--primary"
            onClick={onExecute}
            title="执行 (F5)"
            data-testid="btn-execute"
            type="button"
            aria-label="执行流程"
          >
            执行
          </button>
        ) : (
          // Pause/Resume and Stop buttons (shown when executing)
          <>
            <button
              className="flow-toolbar__btn"
              onClick={onPause}
              title={isPaused ? '继续 (F5)' : '暂停'}
              data-testid="btn-pause"
              type="button"
              aria-label={isPaused ? '继续执行' : '暂停执行'}
            >
              {isPaused ? '继续' : '暂停'}
            </button>
            <button
              className="flow-toolbar__btn flow-toolbar__btn--danger"
              onClick={onStop}
              title="停止 (Shift+F5)"
              data-testid="btn-stop"
              type="button"
              aria-label="停止执行"
            >
              停止
            </button>
          </>
        )}
        
        {/* Step button - always visible, disabled during running (not paused) execution */}
        <button
          className="flow-toolbar__btn"
          onClick={onStep}
          disabled={isExecuting && !isPaused}
          title="单步执行 (F10)"
          data-testid="btn-step"
          type="button"
          aria-label="单步执行"
          aria-disabled={isExecuting && !isPaused}
        >
          单步
        </button>
      </div>
    </div>
  );
}

export default FlowToolbar;
