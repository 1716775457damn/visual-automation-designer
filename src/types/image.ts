/**
 * 图片相关类型定义
 * 对应后端 src-tauri/src/models/image.rs
 * 
 * Validates: Requirements 1.1, 1.2, 1.3
 */

/**
 * 图片 ID
 */
export type ImageId = string;

/**
 * 图片格式
 */
export type ImageFormat = 'png' | 'jpg' | 'bmp';

/**
 * 图片元数据
 */
export interface ImageMetadata {
  /** 图片 ID */
  id: ImageId;
  /** 图片名称 */
  name: string;
  /** 文件路径 */
  filePath: string;
  /** 图片宽度 */
  width: number;
  /** 图片高度 */
  height: number;
  /** 图片格式 */
  format: ImageFormat;
  /** 创建时间 */
  createdAt: string;
  /** 图片哈希（用于去重） */
  hash: string;
}

/**
 * 图片库
 */
export interface ImageLibrary {
  /** 图片列表 */
  images: ImageMetadata[];
  /** 总大小（字节） */
  totalSizeBytes: number;
}
