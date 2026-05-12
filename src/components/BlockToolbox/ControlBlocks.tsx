/**
 * ControlBlocks - 控制积木块列表组件
 * 展示循环、无限循环、条件判断等控制积木块
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { useState } from 'react';

export type ControlType = 'loop' | 'loop_infinite' | 'condition';

export interface ControlBlockItem {
  type: ControlType;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
}

const CONTROL_BLOCKS: ControlBlockItem[] = [
  { type: 'loop', label: '循环', icon: '🔁', description: '重复执行指定次数', shortcut: 'L' },
  { type: 'loop_infinite', label: '无限循环', icon: '♾️', description: '无限重复执行', shortcut: 'U' },
  { type: 'condition', label: '条件判断', icon: '❓', description: '根据条件分支执行', shortcut: 'F' },
];

export interface ControlBlocksProps {
  onSelect?: (type: ControlType) => void;
  searchQuery?: string;
}

/**
 * ControlBlocks 组件 - 控制积木块列表
 */
export function ControlBlocks({ onSelect, searchQuery = '' }: ControlBlocksProps) {
  const [draggingType, setDraggingType] = useState<string | null>(null);

  const createDragPayload = (type: ControlType) => JSON.stringify({
    blockType: type,
    blockCategory: 'control',
  });

  const filteredBlocks = CONTROL_BLOCKS.filter((block) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      block.label.toLowerCase().includes(query) ||
      block.description.toLowerCase().includes(query)
    );
  });

  if (filteredBlocks.length === 0) {
    return (
      <div className="control-blocks__empty">
        没有匹配的控制积木块
      </div>
    );
  }

  return (
    <div className="control-blocks" data-testid="control-blocks">
      {filteredBlocks.map((block) => (
        <div
          key={block.type}
          className={`control-blocks__item ${draggingType === block.type ? 'control-blocks__item--dragging' : ''}`}
          draggable
          onDragStart={(e) => {
            setDraggingType(block.type);
            e.dataTransfer.setData('blockType', block.type);
            e.dataTransfer.setData('blockCategory', 'control');
            e.dataTransfer.setData('text/plain', createDragPayload(block.type));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDraggingType(null);
          }}
          onClick={() => onSelect?.(block.type)}
          data-testid={`control-block-${block.type}`}
          title={block.description}
        >
          <span className="control-blocks__icon">{block.icon}</span>
          <div className="control-blocks__text">
            <span className="control-blocks__label">{block.label}</span>
            <span className="control-blocks__description">{block.description}</span>
          </div>
          {block.shortcut && (
            <span className="control-blocks__shortcut" title={`快捷键: ${block.shortcut}`}>
              {block.shortcut}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default ControlBlocks;
