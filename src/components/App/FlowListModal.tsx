import type { FlowMetadata } from '../../tauri/flow';
import styles from './App.module.css';

export interface FlowListModalProps {
  isOpen: boolean;
  flowList: FlowMetadata[];
  currentFlowId?: string;
  onClose: () => void;
  onNew: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export function FlowListModal({ isOpen, flowList, currentFlowId, onClose, onNew, onLoad, onDelete }: FlowListModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.flowListModal} onClick={onClose}>
      <div className={styles.flowListModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.flowListModalHeader}>
          <h3>📋 流程列表</h3>
          <button className={styles.flowListModalClose} onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className={styles.flowListModalActions}>
          <button className="flow-list-modal__btn flow-list-modal__btn--primary" onClick={onNew} type="button">
            ➕ 新建流程
          </button>
        </div>
        <div className={styles.flowListModalList}>
          {flowList.length === 0 ? (
            <div className={styles.flowListModalEmpty}>
              <p>📭 暂无保存的流程</p>
              <p className={styles.flowListModalEmptyHint}>点击"新建流程"开始创建</p>
            </div>
          ) : (
            flowList.map((meta) => (
              <div key={meta.id} className={`${styles.flowListModalItem} ${currentFlowId === meta.id ? styles.flowListModalItemActive : ''}`}>
                <div className={styles.flowListModalItemInfo}>
                  <span className={styles.flowListModalItemName}>{meta.name}</span>
                  <span className={styles.flowListModalItemMeta}>
                    {meta.blockCount} 个积木块 · 更新于 {new Date(meta.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div className={styles.flowListModalItemActions}>
                  <button className={styles.flowListModalItemBtn} onClick={() => onLoad(meta.id)} disabled={currentFlowId === meta.id} type="button">
                    {currentFlowId === meta.id ? '✓ 当前' : '打开'}
                  </button>
                  <button className={`${styles.flowListModalItemBtn} ${styles.flowListModalItemBtnDanger}`} onClick={() => onDelete(meta.id)} type="button">
                    🗑️ 删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowListModal;
