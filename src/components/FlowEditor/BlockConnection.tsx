/**
 * BlockConnection - 连接线组件
 * 渲染积木块之间的连接线
 * 使用 react-flow 的 smoothstep 连接类型
 * 
 * Validates: Requirements 2.4
 */

import { memo } from 'react';
import styles from './FlowEditor.module.css';
import {
  EdgeProps,
  getSmoothStepPath,
  BaseEdge,
} from 'reactflow';

export interface BlockConnectionProps {
  id: string;
  sourceId: string;
  targetId: string;
  animated?: boolean;
  label?: string;
}

/**
 * BlockConnection 组件 - 渲染积木块之间的连接线
 * 使用 smoothstep 类型实现折线连接
 */
function BlockConnectionComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  // Use smoothstep path for better visual
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: '#666',
      }}
    />
  );
}

export const BlockConnection = memo(BlockConnectionComponent);

/**
 * AnimatedBlockConnection - 带动画效果的连接线
 * 用于显示执行路径
 */
function AnimatedBlockConnectionComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      {/* Base path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: 'var(--color-primary, #00a0ff)',
        }}
      />
      {/* Animated overlay */}
      <path
        className={styles.blockConnectionAnimated}
        d={edgePath}
        fill="none"
        stroke="var(--color-primary, #00a0ff)"
        strokeWidth={3}
        strokeDasharray="8 4"
        style={{
          animation: 'dash-flow 0.5s linear infinite',
        }}
      />
    </>
  );
}

export const AnimatedBlockConnection = memo(AnimatedBlockConnectionComponent);

export default BlockConnection;
