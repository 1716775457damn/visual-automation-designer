/**
 * Tauri Command 封装
 * 提供类型安全的 Tauri Command 调用接口
 * 
 * Validates: Requirements 8.4
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { ImageMetadata } from '../types/image';
import type { Flow, FlowMetadata } from '../types/flow';
import type { BlockId } from '../types/block';

// ============================================================================
// 图片格式验证
// ============================================================================

/** 支持的图片格式 */
export const SUPPORTED_IMAGE_FORMATS = ['png', 'jpg', 'jpeg', 'bmp'] as const;
export type SupportedImageFormat = typeof SUPPORTED_IMAGE_FORMATS[number];

/** 支持的图片 MIME 类型 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/bmp',
] as const;

/**
 * 验证图片格式是否受支持
 * @param filePath 文件路径
 * @returns 如果格式受支持返回 true
 */
export function validateImageFormat(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_IMAGE_FORMATS.includes(extension as SupportedImageFormat);
}

/**
 * 获取文件扩展名
 * @param filePath 文件路径
 * @returns 文件扩展名（小写），如果没有扩展名则返回空字符串
 */
export function getFileExtension(filePath: string): string {
  const lastDotIndex = filePath.lastIndexOf('.');
  
  // 如果没有点，或者点后面没有内容
  if (lastDotIndex === -1 || lastDotIndex === filePath.length - 1) {
    return '';
  }
  
  // 确保点不在路径分隔符之后（即点是文件名的一部分）
  const lastSeparator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSeparator > lastDotIndex) {
    return '';
  }
  
  // 检查点是否在文件名开头（隐藏文件如 .hidden）
  // 这种情况下，如果文件名只有点开头且没有其他点，则没有扩展名
  const fileName = filePath.substring(lastSeparator + 1);
  if (fileName.startsWith('.') && fileName.indexOf('.', 1) === -1) {
    return '';
  }
  
  return filePath.substring(lastDotIndex + 1).toLowerCase();
}

/**
 * 获取文件名（不含扩展名）
 * @param filePath 文件路径
 * @returns 文件名
 */
export function getFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const fileName = parts.pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}

// ============================================================================
// 图片库相关命令
// ============================================================================

/**
 * 选择图片文件（打开文件选择对话框）
 * @returns 选择的文件路径，如果取消则返回 null
 */
export async function selectImageFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'bmp'],
      },
    ],
  });
  
  return selected;
}

/**
 * 选择多个图片文件（打开文件选择对话框）
 * @returns 选择的文件路径数组，如果取消则返回 null
 */
export async function selectMultipleImageFiles(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'bmp'],
      },
    ],
  });
  
  if (selected === null) {
    return null;
  }
  
  // 单选时返回的是 string，多选时返回的是 string[]
  if (typeof selected === 'string') {
    return [selected];
  }
  
  return selected;
}

/**
 * 添加图片
 */
export async function addImage(filePath: string, name: string): Promise<ImageMetadata> {
  // 验证格式
  if (!validateImageFormat(filePath)) {
    throw new Error(`不支持的图片格式。支持的格式: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`);
  }
  
  return invoke<ImageMetadata>('add_image', { filePath, name });
}

/**
 * 删除图片
 */
export async function removeImage(id: ImageId): Promise<void> {
  return invoke('remove_image', { id });
}

/**
 * 重命名图片
 */
export async function renameImage(id: ImageId, newName: string): Promise<void> {
  return invoke('rename_image', { id, newName });
}

/**
 * 列出所有图片
 */
export async function listImages(): Promise<ImageMetadata[]> {
  return invoke<ImageMetadata[]>('list_images');
}

// ============================================================================
// 流程管理相关命令
// ============================================================================

/**
 * 创建流程
 */
export async function createFlow(name: string): Promise<Flow> {
  return invoke<Flow>('create_flow', { name });
}

/**
 * 保存流程
 */
export async function saveFlow(flow: Flow): Promise<void> {
  return invoke('save_flow', { flow });
}

/**
 * 加载流程
 */
export async function loadFlow(id: string): Promise<Flow> {
  return invoke<Flow>('load_flow', { id });
}

/**
 * 列出所有流程
 */
export async function listFlows(): Promise<FlowMetadata[]> {
  return invoke<FlowMetadata[]>('list_flows');
}

/**
 * 删除流程
 */
export async function deleteFlow(id: string): Promise<void> {
  return invoke('delete_flow', { id });
}

/**
 * 验证流程
 */
export async function validateFlow(flow: Flow): Promise<ValidationResult> {
  return invoke<ValidationResult>('validate_flow', { flow });
}

// ============================================================================
// 积木块操作相关命令
// ============================================================================

import type { BlockConfig, BlockNode, BlockPosition, BlockType } from '../types/block';

/**
 * 创建积木块
 */
export async function createBlock(
  flowId: string,
  blockType: BlockType,
  config: BlockConfig,
  position: BlockPosition
): Promise<BlockNode> {
  return invoke<BlockNode>('create_block', { flowId, blockType, config, position });
}

/**
 * 更新积木块位置
 */
export async function updateBlockPosition(
  flowId: string,
  blockId: BlockId,
  position: BlockPosition
): Promise<void> {
  return invoke('update_block_position', { flowId, blockId, position });
}

/**
 * 更新积木块配置
 */
export async function updateBlockConfig(
  flowId: string,
  blockId: BlockId,
  config: BlockConfig
): Promise<void> {
  return invoke('update_block_config', { flowId, blockId, config });
}

/**
 * 删除积木块
 */
export async function deleteBlock(flowId: string, blockId: BlockId): Promise<void> {
  return invoke('delete_block', { flowId, blockId });
}

/**
 * 设置入口积木块
 */
export async function setEntryBlock(
  flowId: string,
  blockId: BlockId | null
): Promise<void> {
  return invoke('set_entry_block', { flowId, blockId });
}

/**
 * 创建连接
 */
export async function createConnection(
  flowId: string,
  source: BlockId,
  target: BlockId,
  sourceHandle?: string
): Promise<Connection> {
  return invoke<Connection>('create_connection', { flowId, source, target, sourceHandle });
}

/**
 * 删除连接
 */
export async function deleteConnection(flowId: string, connectionId: string): Promise<void> {
  return invoke('delete_connection', { flowId, connectionId });
}

// ============================================================================
// 类型定义
// ============================================================================

import type { Connection } from '../types/flow';

type ImageId = string;

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  code: string;
  message: string;
  blockId?: BlockId;
  connectionId?: string;
}

type ValidationWarning = ValidationError;
