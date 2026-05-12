/**
 * ActionBlocks - 动作积木块列表组件
 * 展示点击、等待图片、等待时间、输入文本等动作积木块
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { useState } from 'react';

export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text';

export interface ActionBlockItem {
  type: ActionType;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
}

const ACTION_BLOCKS: ActionBlockItem[] = [
  { type: 'click', label: '点击', icon: '🖱️', description: '模拟鼠标点击', shortcut: 'C' },
  { type: 'wait_image', label: '等待图片', icon: '🖼️', description: '等待指定图片出现', shortcut: 'W' },
  { type: 'wait_time', label: '等待时间', icon: '⏱️', description: '等待指定时间', shortcut: 'T' },
  { type: 'input_text', label: '输入文本', icon: '⌨️', description: '模拟键盘输入', shortcut: 'I' },
];

export interface ActionBlocksProps {
  onSelect?: (type: ActionType) => void;
  searchQuery?: string;
}

/**
 * ActionBlocks 组件 - 动作积木块列表
 */
export function ActionBlocks({ onSelect, searchQuery = '' }: ActionBlocksProps) {
  const [draggingType, setDraggingType] = useState<string | null>(null);

  const createDragPayload = (type: ActionType) => JSON.stringify({
    blockType: type,
    blockCategory: 'action',
  });

  const filteredBlocks = ACTION_BLOCKS.filter((block) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      block.label.toLowerCase().includes(query) ||
      block.description.toLowerCase().includes(query)
    );
  });

  if (filteredBlocks.length === 0) {
    return (
      <div className="action-blocks__empty">
        没有匹配的动作积木块
      </div>
    );
  }

  return (
    <div className="action-blocks" data-testid="action-blocks">
      {filteredBlocks.map((block) => (
        <div
          key={block.type}
          className={`action-blocks__item ${draggingType === block.type ? 'action-blocks__item--dragging' : ''}`}
          draggable
          onDragStart={(e) => {
            setDraggingType(block.type);
            e.dataTransfer.setData('blockType', block.type);
            e.dataTransfer.setData('blockCategory', 'action');
            e.dataTransfer.setData('text/plain', createDragPayload(block.type));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDraggingType(null);
          }}
          onClick={() => onSelect?.(block.type)}
          data-testid={`action-block-${block.type}`}
          title={block.description}
        >
          <span className="action-blocks__icon">{block.icon}</span>
          <div className="action-blocks__text">
            <span className="action-blocks__label">{block.label}</span>
            <span className="action-blocks__description">{block.description}</span>
          </div>
          {block.shortcut && (
            <span className="action-blocks__shortcut" title={`快捷键: ${block.shortcut}`}>
              {block.shortcut}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default ActionBlocks;
