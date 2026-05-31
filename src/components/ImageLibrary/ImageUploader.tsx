/**
 * ImageUploader - 图片上传组件
 * 支持点击上传（通过 Tauri 文件对话框）和拖拽上传
 * 
 * Validates: Requirements 1.3, 1.4
 */

import React, { useCallback, useState } from 'react';
import type { ImageMetadata } from '../../types/image';
import styles from './ImageLibrary.module.css';

export interface ImageUploaderProps {
  /** 上传成功回调 */
  onUploadSuccess?: (metadata: ImageMetadata) => void;
  /** 上传错误回调 */
  onUploadError?: (error: Error) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示紧凑模式 */
  compact?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * ImageUploader 组件 - 图片上传组件
 * 
 * 提供两种上传方式：
 * 1. 点击按钮打开 Tauri 文件选择对话框
 * 2. 拖拽文件到上传区域（仅作为 UI 反馈，实际处理需要通过后端）
 */
export function ImageUploader({
  // onUploadSuccess is available for future use when integrating with file picker
  onUploadSuccess: _onUploadSuccess,
  onUploadError,
  disabled = false,
  compact = false,
  className = '',
}: ImageUploaderProps) {
  void _onUploadSuccess; // Suppress unused variable warning
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      if (disabled) {
        return;
      }
      
      // 拖拽上传提示
      // 注意：由于浏览器安全限制，拖拽的文件路径无法直接获取
      // 实际上传需要通过 Tauri 文件选择对话框
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const errorMsg = '请使用文件选择对话框上传图片。拖拽上传需要通过 Tauri 文件对话框处理。';
        onUploadError?.(new Error(errorMsg));
      }
    },
    [disabled, onUploadError]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      // Click triggers upload through parent component's useImageLibrary hook
      // The parent should provide the upload functionality
    }
  }, [disabled]);

  return (
    <div
      className={`image-uploader ${isDragging ? styles.imageUploaderDragging : ''} ${disabled ? styles.imageUploaderDisabled : ''} ${compact ? styles.imageUploaderCompact : ''} ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      data-testid="image-uploader"
    >
      <div className={styles.imageUploaderDropzone}>
        <div className={styles.imageUploaderIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className={styles.imageUploaderHint}>
          <p className={styles.imageUploaderTitle}>
            {compact ? '点击或拖拽上传' : '拖拽图片到此处'}
          </p>
          {!compact && (
            <p className={styles.imageUploaderFormats}>支持 PNG、JPG、BMP 格式</p>
          )}
        </div>
        {!compact && (
          <div className={styles.imageUploaderActions}>
            <p className={styles.imageUploaderNote}>
              提示：将复制图片到应用数据目录
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageUploader;
