/**
 * FlowToolbar - 工具栏组件
 * 提供保存、执行、撤销等操作按钮
 *
 * Validates: Requirements 2.6, 5.1, 5.5, 5.6, 7.1, 7.2
 */

import type { ThemeMode } from '../../hooks';
import { memo, useMemo } from 'react';
import styles from './FlowEditor.module.css';

export interface FlowToolbarProps {
  canUndo?: boolean;
  canRedo?: boolean;
  isExecuting?: boolean;
  isPaused?: boolean;
  hasFlow?: boolean;
  flowName?: string;
  themeMode?: ThemeMode;
  onSave?: () => void;
  onLoad?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onExecute?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onStep?: () => void;
  onNew?: () => void;
  onToggleTheme?: () => void;
  onHelp?: () => void;
}

/**
 * FlowToolbar 组件 - 流程编辑工具栏
 * 提供流程控制、执行和文件操作按钮
 */
export const FlowToolbar = memo(function FlowToolbar({
  canUndo = false,
  canRedo = false,
  isExecuting = false,
  isPaused = false,
  hasFlow = false,
  flowName,
  themeMode = 'auto',
  onSave,
  onLoad,
  onUndo,
  onRedo,
  onExecute,
  onPause,
  onStop,
  onStep,
  onNew,
  onToggleTheme,
  onHelp,
}: FlowToolbarProps) {
  const currentModeLabel = useMemo(
    () => isExecuting ? (isPaused ? '已暂停，可继续或单步' : '正在执行自动化流程') : '准备编辑并运行流程',
    [isExecuting, isPaused],
  );

  const themeIcon = useMemo(() => {
    switch (themeMode) {
      case 'light': return '☀️';
      case 'dark': return '🌙';
      case 'auto': return '🔄';
    }
  }, [themeMode]);

  const themeTitle = useMemo(() => {
    switch (themeMode) {
      case 'light': return '当前: 亮色主题 (点击切换)';
      case 'dark': return '当前: 暗色主题 (点击切换)';
      case 'auto': return '当前: 跟随系统 (点击切换)';
    }
  }, [themeMode]);

  return (
    <div className={styles.flowToolbar} data-testid="flow-toolbar" role="toolbar" aria-label="流程编辑工具栏">
      {/* Flow Name Display - UX优化1: 显示当前流程名称 */}
      {flowName && (
        <div className={styles.flowToolbarFlowName} title={flowName}>
          <span className={styles.flowToolbarFlowNameLabel}>当前流程</span>
          <span className={styles.flowToolbarFlowNameValue}>📁 {flowName}</span>
        </div>
      )}
      
      {/* File Operations Group */}
      <div className={`${styles.flowToolbarGroup} ${styles.flowToolbarGroupFile}`} role="group" aria-label="文件操作">
        {/* UX优化2: 添加新建按钮 */}
        <button
          className={styles.flowToolbarBtn}
          onClick={onNew}
          title="新建流程 (Ctrl+N)"
          data-testid="btn-new"
          type="button"
          aria-label="新建流程"
        >
          ➕ 新建
        </button>
        <button
          className={styles.flowToolbarBtn}
          onClick={onSave}
          disabled={!hasFlow}
          title="保存 (Ctrl+S)"
          data-testid="btn-save"
          type="button"
          aria-label="保存流程"
        >
          💾 保存
        </button>
        <button
          className={styles.flowToolbarBtn}
          onClick={onLoad}
          title="打开 (Ctrl+O)"
          data-testid="btn-load"
          type="button"
          aria-label="打开流程"
        >
          📂 打开
        </button>
      </div>

      {/* Edit Operations Group */}
      <div className={`${styles.flowToolbarGroup} ${styles.flowToolbarGroupEdit}`} role="group" aria-label="编辑操作">
        <button
          className={styles.flowToolbarBtn}
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
          data-testid="btn-undo"
          type="button"
          aria-label="撤销"
          aria-disabled={!canUndo}
        >
          ↩️ 撤销
        </button>
        <button
          className={styles.flowToolbarBtn}
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Y)"
          data-testid="btn-redo"
          type="button"
          aria-label="重做"
          aria-disabled={!canRedo}
        >
          ↪️ 重做
        </button>
      </div>

      {/* Execution Control Group */}
      <div className="flow-toolbar__group flow-toolbar__group--execute" role="group" aria-label="执行控制">
        <div className={styles.flowToolbarExecuteMeta} aria-live="polite">
          <span className={styles.flowToolbarExecuteMetaLabel}>运行状态</span>
          <span className={styles.flowToolbarExecuteMetaValue}>{currentModeLabel}</span>
        </div>
        {!isExecuting ? (
          // Execute button (shown when not executing)
          <button
            className={`${styles.flowToolbarBtn} ${styles.flowToolbarBtnPrimary}`}
            onClick={onExecute}
            disabled={!hasFlow}
            title={hasFlow ? "执行 (F5)" : "请先创建或加载流程"}
            data-testid="btn-execute"
            type="button"
            aria-label="执行流程"
          >
            ▶️ 执行
          </button>
        ) : (
          // Pause/Resume and Stop buttons (shown when executing)
          <>
            <button
              className={`${styles.flowToolbarBtn} ${isPaused ? styles.flowToolbarBtnPrimary : ''}`}
              onClick={onPause}
              title={isPaused ? '继续 (F5)' : '暂停'}
              data-testid="btn-pause"
              type="button"
              aria-label={isPaused ? '继续执行' : '暂停执行'}
              aria-pressed={isPaused}
            >
              {isPaused ? '▶️ 继续' : '⏸️ 暂停'}
            </button>
            <button
              className={`${styles.flowToolbarBtn} ${styles.flowToolbarBtnDanger}`}
              onClick={onStop}
              title="停止 (Shift+F5)"
              data-testid="btn-stop"
              type="button"
              aria-label="停止执行"
            >
              ⏹️ 停止
            </button>
          </>
        )}

        {/* Step button - always visible, disabled during running (not paused) execution */}
        <button
          className={styles.flowToolbarBtn}
          onClick={onStep}
          disabled={!hasFlow || (isExecuting && !isPaused)}
          title="单步执行 (F10)"
          data-testid="btn-step"
          type="button"
          aria-label="单步执行"
          aria-disabled={!hasFlow || (isExecuting && !isPaused)}
        >
          ⏭️ 单步
        </button>
      </div>

      {/* Help Group - UX优化41: 增强快捷键帮助 */}
      <div className={`${styles.flowToolbarGroup} ${styles.flowToolbarGroupHelp}`} role="group" aria-label="帮助">
        {/* UX优化103: 主题切换按钮 */}
        <button
          className={`${styles.flowToolbarBtn} ${styles.flowToolbarBtnTheme}`}
          onClick={onToggleTheme}
          title={themeTitle}
          data-testid="btn-theme"
          type="button"
          aria-label="切换主题"
        >
          {themeIcon}
        </button>
        <button
          className={`${styles.flowToolbarBtn} ${styles.flowToolbarBtnHelp}`}
          onClick={onHelp}
          title="查看快捷键"
          data-testid="btn-help"
          type="button"
          aria-label="帮助"
        >
          ❓
        </button>
      </div>
    </div>
  );
});

export default FlowToolbar;
