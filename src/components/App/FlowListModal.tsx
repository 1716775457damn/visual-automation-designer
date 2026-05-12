import type { FlowMetadata } from '../../tauri/flow';

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
    <div className="flow-list-modal" onClick={onClose}>
      <div className="flow-list-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="flow-list-modal__header">
          <h3>📋 流程列表</h3>
          <button className="flow-list-modal__close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="flow-list-modal__actions">
          <button className="flow-list-modal__btn flow-list-modal__btn--primary" onClick={onNew} type="button">
            ➕ 新建流程
          </button>
        </div>
        <div className="flow-list-modal__list">
          {flowList.length === 0 ? (
            <div className="flow-list-modal__empty">
              <p>📭 暂无保存的流程</p>
              <p className="flow-list-modal__empty-hint">点击"新建流程"开始创建</p>
            </div>
          ) : (
            flowList.map((meta) => (
              <div key={meta.id} className={`flow-list-modal__item ${currentFlowId === meta.id ? 'flow-list-modal__item--active' : ''}`}>
                <div className="flow-list-modal__item-info">
                  <span className="flow-list-modal__item-name">{meta.name}</span>
                  <span className="flow-list-modal__item-meta">
                    {meta.blockCount} 个积木块 · 更新于 {new Date(meta.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flow-list-modal__item-actions">
                  <button className="flow-list-modal__item-btn" onClick={() => onLoad(meta.id)} disabled={currentFlowId === meta.id} type="button">
                    {currentFlowId === meta.id ? '✓ 当前' : '打开'}
                  </button>
                  <button className="flow-list-modal__item-btn flow-list-modal__item-btn--danger" onClick={() => onDelete(meta.id)} type="button">
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
