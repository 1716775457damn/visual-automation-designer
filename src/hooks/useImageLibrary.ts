/**
 * useImageLibrary - 图片库 Hook
 * 封装图片库相关的 Tauri Command 调用
 *
 * Validates: Requirements 1.1, 1.2, 1.5, 1.6
 */

import { useState, useCallback, useEffect } from 'react';
import type { ImageMetadata } from '../types/image';
import { toError } from '../utils/error';
import {
  addImage as tauriAddImage,
  addImageFromBase64 as tauriAddImageFromBase64,
  removeImage as tauriRemoveImage,
  renameImage as tauriRenameImage,
  listImages as tauriListImages,
  selectImageFile,
  selectMultipleImageFiles,
  validateImageFormat,
  getFileName,
} from '../tauri/commands';

export interface UseImageLibraryReturn {
  images: ImageMetadata[];
  loading: boolean;
  error: Error | null;
  selectAndUploadImage: () => Promise<ImageMetadata | null>;
  selectAndUploadImages: () => Promise<ImageMetadata[]>;
  uploadImage: (filePath: string, name?: string) => Promise<ImageMetadata>;
  pasteImageFromClipboard: () => Promise<ImageMetadata | null>;
  deleteImage: (id: string) => Promise<void>;
  renameImage: (id: string, newName: string) => Promise<void>;
  refreshImages: () => Promise<void>;
}

/**
 * useImageLibrary Hook - 图片库管理
 */
export function useImageLibrary(): UseImageLibraryReturn {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 选择并上传单个图片
   */
  const selectAndUploadImage = useCallback(async (): Promise<ImageMetadata | null> => {
    setLoading(true);
    setError(null);

    try {
      // 打开文件选择对话框
      const filePath = await selectImageFile();
      if (!filePath) {
        // 用户取消
        setLoading(false);
        return null;
      }

      // 验证格式
      if (!validateImageFormat(filePath)) {
        throw new Error('不支持的图片格式。支持 PNG, JPG, BMP 格式。');
      }

      // 获取默认文件名
      const defaultName = getFileName(filePath);
      // 调用后端添加图片
      const metadata = await tauriAddImage(filePath, defaultName);
      // 更新列表
      setImages((prev) => [...prev, metadata]);
      return metadata;
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 选择并上传多个图片
   */
  const selectAndUploadImages = useCallback(async (): Promise<ImageMetadata[]> => {
    setLoading(true);
    setError(null);

    try {
      // 打开文件选择对话框
      const filePaths = await selectMultipleImageFiles();
      if (!filePaths || filePaths.length === 0) {
        // 用户取消
        setLoading(false);
        return [];
      }

      // 上传所有图片
      const uploadedImages: ImageMetadata[] = [];
      const errors: Error[] = [];

      for (const filePath of filePaths) {
        try {
          if (!validateImageFormat(filePath)) {
            errors.push(new Error(`跳过不支持格式的文件: ${filePath}`));
            continue;
          }

          const defaultName = getFileName(filePath);
          const metadata = await tauriAddImage(filePath, defaultName);
          uploadedImages.push(metadata);
        } catch (err) {
          errors.push(toError(err));
        }
      }

      // 更新列表
      if (uploadedImages.length > 0) {
        setImages((prev) => [...prev, ...uploadedImages]);
      }

      // 如果有错误，设置第一个错误
      if (errors.length > 0) {
        setError(errors[0]);
      }

      return uploadedImages;
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 上传指定路径的图片
   */
  const uploadImage = useCallback(async (filePath: string, name?: string): Promise<ImageMetadata> => {
    setLoading(true);
    setError(null);

    try {
      // 验证格式
      if (!validateImageFormat(filePath)) {
        throw new Error('不支持的图片格式。支持 PNG, JPG, BMP 格式。');
      }

      // 使用提供的名称或默认文件名
      const imageName = name || getFileName(filePath);
      // 调用后端添加图片
      const metadata = await tauriAddImage(filePath, imageName);
      // 更新列表
      setImages((prev) => [...prev, metadata]);
      return metadata;
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 从剪贴板粘贴图片
   */
  const pasteImageFromClipboard = useCallback(async (): Promise<ImageMetadata | null> => {
    setLoading(true);
    setError(null);

    try {
      // 尝试从剪贴板读取图片
      const clipboardItems = await navigator.clipboard.read();
      
      for (const item of clipboardItems) {
        // 查找图片类型
        const imageType = item.types.find(type => type.startsWith('image/'));
        
        if (imageType) {
          const blob = await item.getType(imageType);
          
          // 转换为 base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          // 生成默认名称
          const defaultName = `pasted_image_${Date.now()}`;
          
          // 调用后端添加图片
          const metadata = await tauriAddImageFromBase64(base64Data, defaultName);
          
          // 更新列表
          setImages((prev) => [...prev, metadata]);
          
          return metadata;
        }
      }
      
      // 没有找到图片
      console.warn('No image found in clipboard');
      return null;
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 删除图片
   */
  const deleteImage = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await tauriRemoveImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 重命名图片
   */
  const renameImage = useCallback(async (id: string, newName: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await tauriRenameImage(id, newName);
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, name: newName } : img))
      );
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 刷新图片列表
   */
  const refreshImages = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const imageList = await tauriListImages();
      setImages(imageList);
    } catch (err) {
      const error = toError(err);
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化时加载图片列表
  useEffect(() => {
    refreshImages().catch(console.error);
  }, [refreshImages]);

  return {
    images,
    loading,
    error,
    selectAndUploadImage,
    selectAndUploadImages,
    uploadImage,
    pasteImageFromClipboard,
    deleteImage,
    renameImage,
    refreshImages,
  };
}

export default useImageLibrary;
