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
      <div className={commonStyles.confirmDialogContent} onClick={(e) => e.stopPropagation()}>
        <div className={commonStyles.confirmDialogHeader}>
          <span className={commonStyles.confirmDialogIcon}>📋</span>
          <h3 className={commonStyles.confirmDialogTitle}>新建流程</h3>
        </div>
        <div className="app__dialog-body">
          <label className="app__dialog-label" htmlFor="new-flow-name">
            流程名称
          </label>
          <input
            id="new-flow-name"
            className={styles.appDialogInput}
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
        <div className={commonStyles.confirmDialogActions}>
          <button className={commonStyles.confirmDialogBtn} onClick={onCancel} type="button">
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
