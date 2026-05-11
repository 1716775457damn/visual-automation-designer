/**
 * ControlBlocks - 控制积木块列表组件
 * 展示循环、无限循环、条件判断等控制积木块
 * 
 * Validates: Requirements 4.1, 4.2, 4.3
 */



export type ControlType = 'loop' | 'loop_infinite' | 'condition';

export interface ControlBlockItem {
  type: ControlType;
  label: string;
  icon: string;
}

const CONTROL_BLOCKS: ControlBlockItem[] = [
  { type: 'loop', label: '循环', icon: '🔁' },
  { type: 'loop_infinite', label: '无限循环', icon: '♾️' },
  { type: 'condition', label: '条件判断', icon: '❓' },
];

export interface ControlBlocksProps {
  onSelect?: (type: ControlType) => void;
}

/**
 * ControlBlocks 组件 - 控制积木块列表
 */
export function ControlBlocks({ onSelect }: ControlBlocksProps) {
  return (
    <div className="control-blocks" data-testid="control-blocks">
      {CONTROL_BLOCKS.map((block) => (
        <div
          key={block.type}
          className="control-blocks__item"
          draggable
          onDragStart={(e) => {
            console.log('Drag start:', block.type, 'control');
            e.dataTransfer.setData('blockType', block.type);
            e.dataTransfer.setData('blockCategory', 'control');
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => onSelect?.(block.type)}
          data-testid={`control-block-${block.type}`}
        >
          <span className="control-blocks__icon">{block.icon}</span>
          <span className="control-blocks__label">{block.label}</span>
        </div>
      ))}
    </div>
  );
}

export default ControlBlocks;
