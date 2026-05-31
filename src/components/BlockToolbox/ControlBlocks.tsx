/**
 * ControlBlocks - 控制积木块列表组件
 * 展示循环、无限循环、条件判断等控制积木块
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */

import { useState } from 'react';
import styles from './BlockToolbox.module.css';

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
  onArmPlacement?: (type: ControlType) => void;
  searchQuery?: string;
}

/**
 * ControlBlocks 组件 - 控制积木块列表
 */
export function ControlBlocks({ onSelect, onArmPlacement, searchQuery = '' }: ControlBlocksProps) {
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
      <div className={styles.controlBlocksEmpty}>
        没有匹配的控制积木块
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent, block: ControlBlockItem) => {
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
    <div className={styles.controlBlocks} data-testid="control-blocks" role="listbox" aria-label="控制积木块列表">
      {filteredBlocks.map((block) => (
        <div
          key={block.type}
          className={`${styles.controlBlocksItem} ${draggingType === block.type ? 'control-blocks__item--dragging' : ''}`}
          role="option"
          aria-label={`${block.label}：${block.description}`}
          tabIndex={0}
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
          onKeyDown={(e) => handleKeyDown(e, block)}
          onClick={() => onSelect?.(block.type)}
          data-testid={`control-block-${block.type}`}
          title={block.description}
        >
          <span className={styles.controlBlocksIcon}>{block.icon}</span>
          <div className={styles.controlBlocksText}>
            <span className={styles.controlBlocksLabel}>{block.label}</span>
            <span className={styles.controlBlocksDescription}>{block.description}</span>
          </div>
          {block.shortcut && (
            <span className={styles.controlBlocksShortcut} title={`快捷键: ${block.shortcut}`}>
              {block.shortcut}
            </span>
          )}
          <button
            className={styles.controlBlocksPlaceBtn}
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

export default ControlBlocks;
