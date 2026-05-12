/**
 * Toolbox - 工具箱容器组件
 * 展示可用的积木块类型，支持拖拽创建
 *
 * Validates: Requirements 2.1
 */

import { useState } from 'react';
import { ActionBlocks } from './ActionBlocks';
import { ControlBlocks } from './ControlBlocks';

export interface ToolboxProps {
  onBlockSelect?: (type: string, category: string) => void;
}

/**
 * Toolbox 组件 - 积木块工具箱容器
 */
export function Toolbox({ onBlockSelect }: ToolboxProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showActions, setShowActions] = useState(true);
  const [showControls, setShowControls] = useState(true);

  return (
    <div className="toolbox" data-testid="toolbox">
      <div className="toolbox__header">
        <h3>🧩 积木块</h3>
        <span className="toolbox__subtitle">拖拽或点击添加到白板</span>
      </div>
      
      {/* UX优化21: 添加搜索框 */}
      <div className="toolbox__search">
        <input
          type="text"
          placeholder="🔍 搜索积木块..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="toolbox__search-input"
        />
        {searchQuery && (
          <button
            className="toolbox__search-clear"
            onClick={() => setSearchQuery('')}
          >
            ×
          </button>
        )}
      </div>
      
      <div className="toolbox__content">
        {/* 动作积木块 */}
        <div className="toolbox__section">
          <div 
            className="toolbox__section-header"
            onClick={() => setShowActions(!showActions)}
          >
            <h4 className="toolbox__section-title">⚡ 动作</h4>
            <span className="toolbox__section-toggle">
              {showActions ? '▼' : '▶'}
            </span>
          </div>
          {showActions && (
            <ActionBlocks
              onSelect={(type) => onBlockSelect?.(type, 'action')}
              searchQuery={searchQuery}
            />
          )}
        </div>
        
        {/* 控制积木块 */}
        <div className="toolbox__section">
          <div 
            className="toolbox__section-header"
            onClick={() => setShowControls(!showControls)}
          >
            <h4 className="toolbox__section-title">🔄 控制</h4>
            <span className="toolbox__section-toggle">
              {showControls ? '▼' : '▶'}
            </span>
          </div>
          {showControls && (
            <ControlBlocks
              onSelect={(type) => onBlockSelect?.(type, 'control')}
              searchQuery={searchQuery}
            />
          )}
        </div>
      </div>
      
      {/* UX优化22: 添加提示信息 */}
      <div className="toolbox__footer">
        <p className="toolbox__tip">💡 提示：右键画布可快速添加</p>
        <p className="toolbox__tip toolbox__tip--accent">单击会优先添加到当前视口中心</p>
      </div>
    </div>
  );
}

export default Toolbox;
