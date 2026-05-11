/**
 * ActionBlocks - 动作积木块列表组件
 * 展示点击、等待图片、等待时间、输入文本等动作积木块
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

export type ActionType = 'click' | 'wait_image' | 'wait_time' | 'input_text';

export interface ActionBlockItem {
  type: ActionType;
  label: string;
  icon: string;
}

const ACTION_BLOCKS: ActionBlockItem[] = [
  { type: 'click', label: '点击', icon: '🖱️' },
  { type: 'wait_image', label: '等待图片', icon: '🖼️' },
  { type: 'wait_time', label: '等待时间', icon: '⏱️' },
  { type: 'input_text', label: '输入文本', icon: '⌨️' },
];

export interface ActionBlocksProps {
  onSelect?: (type: ActionType) => void;
}

/**
 * ActionBlocks 组件 - 动作积木块列表
 */
export function ActionBlocks({ onSelect }: ActionBlocksProps) {
  return (
    <div className="action-blocks" data-testid="action-blocks">
      {ACTION_BLOCKS.map((block) => (
        <div
          key={block.type}
          className="action-blocks__item"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('blockType', block.type);
            e.dataTransfer.setData('blockCategory', 'action');
          }}
          onClick={() => onSelect?.(block.type)}
          data-testid={`action-block-${block.type}`}
        >
          <span className="action-blocks__icon">{block.icon}</span>
          <span className="action-blocks__label">{block.label}</span>
        </div>
      ))}
    </div>
  );
}

export default ActionBlocks;
