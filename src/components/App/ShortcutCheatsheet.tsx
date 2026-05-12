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
      <div className="shortcut-cheatsheet__content" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-cheatsheet__header">
          <h3 className="shortcut-cheatsheet__title">⌨️ 快捷键速查</h3>
          <button className="shortcut-cheatsheet__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="shortcut-cheatsheet__content">
          <div className="shortcut-cheatsheet__category">
            <div className="shortcut-cheatsheet__category-title">📁 文件操作</div>
            <div className="shortcut-cheatsheet__item">
              <span>新建流程</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Ctrl</span>
                <span className="shortcut-cheatsheet__key">N</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>保存流程</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Ctrl</span>
                <span className="shortcut-cheatsheet__key">S</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>打开流程</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Ctrl</span>
                <span className="shortcut-cheatsheet__key">O</span>
              </div>
            </div>
          </div>
          <div className="shortcut-cheatsheet__category">
            <div className="shortcut-cheatsheet__category-title">✏️ 编辑操作</div>
            <div className="shortcut-cheatsheet__item">
              <span>撤销</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Ctrl</span>
                <span className="shortcut-cheatsheet__key">Z</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>重做</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Ctrl</span>
                <span className="shortcut-cheatsheet__key">Y</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>删除选中</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Delete</span>
              </div>
            </div>
          </div>
          <div className="shortcut-cheatsheet__category">
            <div className="shortcut-cheatsheet__category-title">▶️ 执行控制</div>
            <div className="shortcut-cheatsheet__item">
              <span>执行/继续</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">F5</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>停止执行</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Shift</span>
                <span className="shortcut-cheatsheet__key">F5</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>单步执行</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">F10</span>
              </div>
            </div>
          </div>
          <div className="shortcut-cheatsheet__category">
            <div className="shortcut-cheatsheet__category-title">🔧 其他</div>
            <div className="shortcut-cheatsheet__item">
              <span>显示快捷键帮助</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">?</span>
              </div>
            </div>
            <div className="shortcut-cheatsheet__item">
              <span>关闭弹窗</span>
              <div className="shortcut-cheatsheet__keys">
                <span className="shortcut-cheatsheet__key">Esc</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShortcutCheatsheet;
