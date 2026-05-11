/**
 * Toolbox - 工具箱容器组件
 * 展示可用的积木块类型，支持拖拽创建
 * 
 * Validates: Requirements 2.1
 */

import { ActionBlocks } from './ActionBlocks';
import { ControlBlocks } from './ControlBlocks';

export interface ToolboxProps {
  onBlockSelect?: (type: string, category: string) => void;
}

/**
 * Toolbox 组件 - 积木块工具箱容器
 */
export function Toolbox({ onBlockSelect }: ToolboxProps) {
  return (
    <div className="toolbox" data-testid="toolbox">
      <div className="toolbox__header">
        <h3>积木块</h3>
      </div>
      <div className="toolbox__content">
        {/* 动作积木块 */}
        <div className="toolbox__section">
          <h4 className="toolbox__section-title">动作</h4>
          <ActionBlocks 
            onSelect={(type) => onBlockSelect?.(type, 'action')} 
          />
        </div>
        {/* 控制积木块 */}
        <div className="toolbox__section">
          <h4 className="toolbox__section-title">控制</h4>
          <ControlBlocks 
            onSelect={(type) => onBlockSelect?.(type, 'control')} 
          />
        </div>
      </div>
    </div>
  );
}

export default Toolbox;
