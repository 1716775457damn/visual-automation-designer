/**
 * ActionBlocks - 动作积木块列表组件
 * 展示点击、等待图片、等待时间、输入文本等动作积木块
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { useState } from 'react';
import styles from './BlockToolbox.module.css';

export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text' | 'screenshot_assert' | 'text_extract';

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
  { type: 'screenshot_assert', label: '截图断言', icon: '📸', description: '截图后与参考图比对', shortcut: 'S' },
  { type: 'text_extract', label: '文本提取', icon: '👁️', description: '从屏幕区域提取文字', shortcut: 'X' },
];

export interface ActionBlocksProps {
  onSelect?: (type: ActionType) => void;
  onArmPlacement?: (type: ActionType) => void;
  searchQuery?: string;
}

/**
 * ActionBlocks 组件 - 动作积木块列表
 */
export function ActionBlocks({ onSelect, onArmPlacement, searchQuery = '' }: ActionBlocksProps) {
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
      <div className={styles.actionBlocksEmpty}>
        没有匹配的动作积木块
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent, block: ActionBlockItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(block.type);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = e.currentTarget.parentElement?.querySelectorAll('[role="option"]');
      if (!items) return;
      const currentIndex = Array.from(items).indexOf(e.currentTarget);
      const nextIndex = e.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, items.length - 1)
        : Math.max(currentIndex - 1, 0);
      (items[nextIndex] as HTMLElement).focus();
    } else if (e.key === 'Escape') {
      (e.currentTarget as HTMLElement).blur();
    }
  };

  return (
    <div className={styles.actionBlocks} data-testid="action-blocks" role="listbox" aria-label="动作积木块列表">
      {filteredBlocks.map((block) => (
        <div
          key={block.type}
          className={`${styles.actionBlocksItem} ${draggingType === block.type ? 'action-blocks__item--dragging' : ''}`}
          role="option"
          aria-label={`${block.label}：${block.description}`}
          tabIndex={0}
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
          onKeyDown={(e) => handleKeyDown(e, block)}
          onClick={() => onSelect?.(block.type)}
          data-testid={`action-block-${block.type}`}
          title={block.description}
        >
          <span className={styles.actionBlocksIcon}>{block.icon}</span>
          <div className={styles.actionBlocksText}>
            <span className={styles.actionBlocksLabel}>{block.label}</span>
            <span className={styles.actionBlocksDescription}>{block.description}</span>
          </div>
          {block.shortcut && (
            <span className={styles.actionBlocksShortcut} title={`快捷键: ${block.shortcut}`}>
              {block.shortcut}
            </span>
          )}
          <button
            className={styles.actionBlocksPlaceBtn}
            type="button"
            title="在白板上指定位置放置"
            aria-label={`在白板上指定位置放置 ${block.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onArmPlacement?.(block.type);
            }}
          >
            ◎
          </button>
        </div>
      ))}
    </div>
  );
}

export default ActionBlocks;
