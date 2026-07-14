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
   * 统一包装异步操作：自动处理 loading 状态和错误捕获
   * @returns fn 的返回值，如果 fn 抛出则重新抛出标准化错误
   */
  async function withOperation<T>(fn: () => Promise<T>): Promise<T> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const normalizedError = toError(err);
      setError(normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }

  /**
   * 选择并上传单个图片
   */
  const selectAndUploadImage = useCallback(async (): Promise<ImageMetadata | null> => {
    return withOperation(async () => {
      const filePath = await selectImageFile();
      if (!filePath) {
        // 用户取消
        return null;
      }

      if (!validateImageFormat(filePath)) {
        throw new Error('不支持的图片格式。支持 PNG, JPG, BMP 格式。');
      }

      const defaultName = getFileName(filePath);
      const metadata = await tauriAddImage(filePath, defaultName);
      setImages((prev) => [...prev, metadata]);
      return metadata;
    });
  }, []);

  /**
   * 选择并上传多个图片
   */
  const selectAndUploadImages = useCallback(async (): Promise<ImageMetadata[]> => {
    return withOperation(async () => {
      const filePaths = await selectMultipleImageFiles();
      if (!filePaths || filePaths.length === 0) {
        return [];
      }

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

      if (uploadedImages.length > 0) {
        setImages((prev) => [...prev, ...uploadedImages]);
      }

      if (errors.length > 0) {
        setError(errors[0]);
      }

      return uploadedImages;
    });
  }, []);

  /**
   * 上传指定路径的图片
   */
  const uploadImage = useCallback(async (filePath: string, name?: string): Promise<ImageMetadata> => {
    return withOperation(async () => {
      if (!validateImageFormat(filePath)) {
        throw new Error('不支持的图片格式。支持 PNG, JPG, BMP 格式。');
      }

      const imageName = name || getFileName(filePath);
      const metadata = await tauriAddImage(filePath, imageName);
      setImages((prev) => [...prev, metadata]);
      return metadata;
    });
  }, []);

  /**
   * 从剪贴板粘贴图片
   */
  const pasteImageFromClipboard = useCallback(async (): Promise<ImageMetadata | null> => {
    return withOperation(async () => {
      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));

        if (imageType) {
          const blob = await item.getType(imageType);

          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const defaultName = `pasted_image_${Date.now()}`;
          const metadata = await tauriAddImageFromBase64(base64Data, defaultName);
          setImages((prev) => [...prev, metadata]);
          return metadata;
        }
      }

      console.warn('No image found in clipboard');
      return null;
    });
  }, []);

  /**
   * 删除图片
   */
  const deleteImage = useCallback(async (id: string): Promise<void> => {
    return withOperation(async () => {
      await tauriRemoveImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
    });
  }, []);

  /**
   * 重命名图片
   */
  const renameImage = useCallback(async (id: string, newName: string): Promise<void> => {
    return withOperation(async () => {
      await tauriRenameImage(id, newName);
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, name: newName } : img))
      );
    });
  }, []);

  /**
   * 刷新图片列表
   */
  const refreshImages = useCallback(async (): Promise<void> => {
    return withOperation(async () => {
      const imageList = await tauriListImages();
      setImages(imageList);
    });
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
