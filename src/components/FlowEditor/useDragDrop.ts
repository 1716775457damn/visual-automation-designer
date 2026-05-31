/**
 * useDragDrop — 画布拖放 Hook
 * 从 FlowCanvas.tsx 提取：onDragOver / onDragLeave / onDrop 及 isDropActive 状态。
 */

import { useCallback, useRef, useState } from 'react';
import { Node } from 'reactflow';
import { ReactFlowInstance } from 'reactflow';

// ── Pure helpers (module-level, no re-creation) ────────────────────

function getBlockLabelFromLookup(blockType: string, blockCategory: string): string {
  const BLOCK_LABELS: Record<string, Record<string, string>> = {
    action: {
      click: '点击',
      wait_image: '等待图片',
      wait_time: '等待时间',
      input_text: '输入文本',
    },
    control: {
      loop: '循环',
      loop_infinite: '无限循环',
      condition: '条件判断',
    },
  };
  return BLOCK_LABELS[blockCategory]?.[blockType] || blockType;
}

function parseDropPayload(event: React.DragEvent): { blockType: string; blockCategory: string } | null {
  const blockType = event.dataTransfer.getData('blockType');
  const blockCategory = event.dataTransfer.getData('blockCategory');

  if (blockType) {
    return { blockType, blockCategory };
  }

  const fallback = event.dataTransfer.getData('text/plain');
  if (!fallback) return null;

  try {
    const parsed = JSON.parse(fallback) as { blockType?: string; blockCategory?: string };
    if (!parsed.blockType) return null;
    return { blockType: parsed.blockType, blockCategory: parsed.blockCategory ?? '' };
  } catch {
    return null;
  }
}

// ── Hook params / return ───────────────────────────────────────────

export interface UseDragDropParams {
  reactFlowInstance: ReactFlowInstance | null;
  reactFlowWrapper: React.MutableRefObject<HTMLDivElement | null>;
  externalNodes: Node[] | undefined;
  onAddNode?: (type: string, category: string, position: { x: number; y: number }) => void;
  setInternalNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}

export interface UseDragDropReturn {
  isDropActive: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useDragDrop(params: UseDragDropParams): UseDragDropReturn {
  const { reactFlowInstance, reactFlowWrapper, externalNodes, onAddNode, setInternalNodes } = params;

  const [isDropActive, setIsDropActive] = useState(false);
  const isDropActiveRef = useRef(false);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!isDropActiveRef.current) {
      isDropActiveRef.current = true;
      setIsDropActive(true);
    }
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget === event.target) {
      setIsDropActive(false);
      isDropActiveRef.current = false;
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDropActive(false);
      isDropActiveRef.current = false;

      const payload = parseDropPayload(event);
      const blockType = payload?.blockType ?? '';
      const blockCategory = payload?.blockCategory ?? '';

      if (!blockType) return;

      if (!reactFlowInstance || !reactFlowWrapper.current) {
        console.warn('No reactFlowInstance or wrapper');
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const snappedPosition = {
        x: Math.round(position.x / 20) * 20,
        y: Math.round(position.y / 20) * 20,
      };

      if (onAddNode) {
        onAddNode(blockType, blockCategory, snappedPosition);
      } else {
        const newNode: Node = {
          id: `node-${Date.now()}`,
          type: 'blockNode',
          position: snappedPosition,
          data: {
            label: getBlockLabelFromLookup(blockType, blockCategory),
            blockType,
            blockCategory,
            config: {},
            executing: false,
          },
        };
        if (externalNodes === undefined) {
          setInternalNodes((nds) => [...nds, newNode]);
        }
      }
    },
    [reactFlowInstance, reactFlowWrapper, externalNodes, onAddNode, setInternalNodes]
  );

  return { isDropActive, onDragOver, onDragLeave, onDrop };
}
