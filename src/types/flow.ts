/**
 * 流程相关类型定义
 * 对应后端 src-tauri/src/models/flow.rs
 * 
 * Validates: Requirements 2.7, 7.1
 */

import type { BlockId, BlockNode } from './block';

/**
 * 流程 ID
 */
export type FlowId = string;

/**
 * 连接 ID
 */
export type ConnectionId = string;

/**
 * 流程连接线
 */
export interface Connection {
  /** 连接 ID */
  id: ConnectionId;
  /** 源积木块 ID */
  source: BlockId;
  /** 目标积木块 ID */
  target: BlockId;
  /** 连接点标识（用于条件分支） */
  sourceHandle?: string;
}

/**
 * 流程定义
 */
export interface Flow {
  /** 流程 ID */
  id: FlowId;
  /** 流程名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 积木块映射 */
  blocks: Record<BlockId, BlockNode>;
  /** 连接列表 */
  connections: Connection[];
  /** 入口积木块 */
  entryBlock?: BlockId;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 流程元数据（用于列表显示）
 */
export interface FlowMetadata {
  /** 流程 ID */
  id: FlowId;
  /** 流程名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 积木块数量 */
  blockCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}
