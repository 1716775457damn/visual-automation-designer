/**
 * Toolbox - 工具箱容器组件
 * 展示可用的积木块类型，支持拖拽创建
 *
 * Validates: Requirements 2.1
 */

import { useState } from 'react';
import { ActionBlocks } from './ActionBlocks';
import { ControlBlocks } from './ControlBlocks';
import styles from './BlockToolbox.module.css';

export interface ToolboxProps {
  onBlockSelect?: (type: string, category: string) => void;
  onArmPlacement?: (type: string, category: string) => void;
  pendingPlacementLabel?: string | null;
  onCancelPlacement?: () => void;
}

/**
 * Toolbox 组件 - 积木块工具箱容器
 */
export function Toolbox({ onBlockSelect, onArmPlacement, pendingPlacementLabel, onCancelPlacement }: ToolboxProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showActions, setShowActions] = useState(true);
  const [showControls, setShowControls] = useState(true);

  return (
    <div className={styles.toolbox} data-testid="toolbox">
      <div className={styles.toolboxHeader}>
        <h3>🧩 积木块</h3>
        <span className={styles.toolboxSubtitle}>拖拽或点击添加到白板</span>
      </div>
      
      {/* UX优化21: 添加搜索框 */}
      <div className={styles.toolboxSearch}>
        <input
          type="text"
          placeholder="🔍 搜索积木块..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.toolboxSearchInput}
        />
        {searchQuery && (
          <button
            className={styles.toolboxSearchClear}
            onClick={() => setSearchQuery('')}
          >
            ×
          </button>
        )}
      </div>
      
      <div className={styles.toolboxContent}>
        {/* 动作积木块 */}
        <div className={styles.toolboxSection}>
          <div 
            className={styles.toolboxSectionHeader}
            onClick={() => setShowActions(!showActions)}
          >
            <h4 className={styles.toolboxSectionTitle}>⚡ 动作</h4>
            <span className={styles.toolboxSectionToggle}>
              {showActions ? '▼' : '▶'}
            </span>
          </div>
          {showActions && (
            <ActionBlocks
              onSelect={(type) => onBlockSelect?.(type, 'action')}
              onArmPlacement={(type) => onArmPlacement?.(type, 'action')}
              searchQuery={searchQuery}
            />
          )}
        </div>
        
        {/* 控制积木块 */}
        <div className={styles.toolboxSection}>
          <div 
            className={styles.toolboxSectionHeader}
            onClick={() => setShowControls(!showControls)}
          >
            <h4 className={styles.toolboxSectionTitle}>🔄 控制</h4>
            <span className={styles.toolboxSectionToggle}>
              {showControls ? '▼' : '▶'}
            </span>
          </div>
          {showControls && (
            <ControlBlocks
              onSelect={(type) => onBlockSelect?.(type, 'control')}
              onArmPlacement={(type) => onArmPlacement?.(type, 'control')}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </div>
      
      {/* UX优化22: 添加提示信息 */}
      <div className={styles.toolboxFooter}>
        <p className={styles.toolboxTip}>💡 提示：右键画布可快速添加</p>
        <p className={`${styles.toolboxTip} ${styles.toolboxTipAccent}`}>单击会优先添加到当前视口中心</p>
        {pendingPlacementLabel && (
          <button className={styles.toolboxPlacementBanner} type="button" onClick={onCancelPlacement}>
            当前放置: {pendingPlacementLabel} · 点击取消
          </button>
        )}
      </div>
    </div>
  );
}

export default Toolbox;
