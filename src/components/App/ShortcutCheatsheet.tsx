export interface ShortcutCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutCheatsheet({ isOpen, onClose }: ShortcutCheatsheetProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="shortcut-cheatsheet" onClick={onClose}>
      <div className={styles.shortcutCheatsheetContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.shortcutCheatsheetHeader}>
          <h3 className={styles.shortcutCheatsheetTitle}>⌨️ 快捷键速查</h3>
          <button className={styles.shortcutCheatsheetClose} onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className={styles.shortcutCheatsheetContent}>
          <div className={styles.shortcutCheatsheetCategory}>
            <div className={styles.shortcutCheatsheetCategoryTitle}>📁 文件操作</div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>新建流程</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Ctrl</span>
                <span className={styles.shortcutCheatsheetKey}>N</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>保存流程</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Ctrl</span>
                <span className={styles.shortcutCheatsheetKey}>S</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>打开流程</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Ctrl</span>
                <span className={styles.shortcutCheatsheetKey}>O</span>
              </div>
            </div>
          </div>
          <div className={styles.shortcutCheatsheetCategory}>
            <div className={styles.shortcutCheatsheetCategoryTitle}>✏️ 编辑操作</div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>撤销</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Ctrl</span>
                <span className={styles.shortcutCheatsheetKey}>Z</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>重做</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Ctrl</span>
                <span className={styles.shortcutCheatsheetKey}>Y</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>删除选中</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Delete</span>
              </div>
            </div>
          </div>
          <div className={styles.shortcutCheatsheetCategory}>
            <div className={styles.shortcutCheatsheetCategoryTitle}>▶️ 执行控制</div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>执行/继续</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>F5</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>停止执行</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Shift</span>
                <span className={styles.shortcutCheatsheetKey}>F5</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>单步执行</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>F10</span>
              </div>
            </div>
          </div>
          <div className={styles.shortcutCheatsheetCategory}>
            <div className={styles.shortcutCheatsheetCategoryTitle}>🔧 其他</div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>显示快捷键帮助</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>?</span>
              </div>
            </div>
            <div className={styles.shortcutCheatsheetItem}>
              <span>关闭弹窗</span>
              <div className={styles.shortcutCheatsheetKeys}>
                <span className={styles.shortcutCheatsheetKey}>Esc</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShortcutCheatsheet;
