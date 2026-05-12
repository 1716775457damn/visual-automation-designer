export interface NewFlowDialogProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function NewFlowDialog({ isOpen, value, onChange, onCancel, onConfirm }: NewFlowDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="confirm-dialog" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="confirm-dialog__content" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog__header">
          <span className="confirm-dialog__icon">📋</span>
          <h3 className="confirm-dialog__title">新建流程</h3>
        </div>
        <div className="app__dialog-body">
          <label className="app__dialog-label" htmlFor="new-flow-name">
            流程名称
          </label>
          <input
            id="new-flow-name"
            className="app__dialog-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
              }
            }}
            autoFocus
          />
        </div>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__btn" onClick={onCancel} type="button">
            取消
          </button>
          <button className="confirm-dialog__btn confirm-dialog__btn--info" onClick={onConfirm} type="button">
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewFlowDialog;
