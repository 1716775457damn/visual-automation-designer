/**
 * LibraryView - 图片库视图组件
 * 显示图片缩略图和名称列表
 * 
 * Validates: Requirements 1.4
 */

import { useState, useMemo } from 'react';
import { ImageCard } from './ImageCard';
import { ImageUploader } from './ImageUploader';
import { useImageLibrary } from '../../hooks/useImageLibrary';
import type { ImageMetadata } from '../../types/image';
import styles from './ImageLibrary.module.css';

export interface LibraryViewProps {
  /** Optional callback when an image is selected */
  onImageSelect?: (image: ImageMetadata) => void;
  /** Optional filter for search */
  searchFilter?: string;
}

/**
 * LibraryView 组件 - 图片库主视图
 * 
 * Features:
 * - Display image thumbnails and names
 * - Support image upload via drag-drop or button
 * - Loading and error states
 * - Search/filter functionality
 */
export function LibraryView({ 
  onImageSelect,
  searchFilter: externalSearchFilter,
}: LibraryViewProps) {
  const {
    images,
    loading,
    error,
    selectAndUploadImage,
    deleteImage,
    renameImage,
    refreshImages,
  } = useImageLibrary();

  const [internalSearchFilter, setInternalSearchFilter] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Use external search filter if provided, otherwise use internal
  const searchFilter = externalSearchFilter ?? internalSearchFilter;

  // Filter images based on search
  const filteredImages = useMemo(() => {
    if (!searchFilter.trim()) {
      return images;
    }
    const lowerFilter = searchFilter.toLowerCase();
    return images.filter((img) =>
      img.name.toLowerCase().includes(lowerFilter)
    );
  }, [images, searchFilter]);

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      await selectAndUploadImage();
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageSelect = (id: string) => {
    setSelectedImageId(id);
    const selectedImage = images.find((img) => img.id === id);
    if (selectedImage && onImageSelect) {
      onImageSelect(selectedImage);
    }
  };

  const handleImageDelete = async (id: string) => {
    try {
      await deleteImage(id);
      if (selectedImageId === id) {
        setSelectedImageId(null);
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  const handleImageRename = async (id: string, newName: string) => {
    try {
      await renameImage(id, newName);
    } catch (err) {
      console.error('Failed to rename image:', err);
    }
  };

  return (
    <div className={styles.libraryView} data-testid="library-view">
      <div className={styles.libraryViewHeader}>
        <h2>图片库</h2>
        <span className={styles.libraryViewCount}>
          {images.length} 张图片
        </span>
      </div>

      {/* Search input */}
      {externalSearchFilter === undefined && (
        <div className={styles.libraryViewSearch}>
          <input
            type="text"
            placeholder="搜索图片..."
            value={internalSearchFilter}
            onChange={(e) => setInternalSearchFilter(e.target.value)}
            className={styles.libraryViewSearchInput}
            data-testid="library-search-input"
          />
        </div>
      )}

      {/* Upload section */}
      <div className={styles.libraryViewUpload}>
        <button
          className={styles.libraryViewUploadBtn}
          onClick={handleUpload}
          disabled={loading || isUploading}
          data-testid="btn-add-image"
        >
          {isUploading ? '上传中...' : '+ 添加图片'}
        </button>
      </div>

      {/* Content area */}
      <div className={styles.libraryViewContent}>
        {/* Loading state */}
        {loading && (
          <div className={styles.libraryViewLoading} data-testid="library-loading">
            <span>加载中...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className={styles.libraryViewError} data-testid="library-error">
            <span>错误: {error.message}</span>
            <button onClick={refreshImages} className={styles.libraryViewRetryBtn}>
              重试
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && images.length === 0 && (
          <div className={styles.libraryViewEmpty} data-testid="library-empty">
            <ImageUploader
              onUploadSuccess={(metadata) => {
                setSelectedImageId(metadata.id);
              }}
              disabled={isUploading}
            />
          </div>
        )}

        {/* Image grid */}
        {!loading && !error && images.length > 0 && (
          <div className={styles.libraryViewGrid} data-testid="library-grid">
            {filteredImages.map((image) => (
              <ImageCard
                key={image.id}
                id={image.id}
                name={image.name}
                thumbnail={image.filePath}
                width={image.width}
                height={image.height}
                format={image.format}
                selected={selectedImageId === image.id}
                onSelect={handleImageSelect}
                onDelete={handleImageDelete}
                onRename={handleImageRename}
              />
            ))}
            {filteredImages.length === 0 && searchFilter && (
              <div className={styles.libraryViewNoResults} data-testid="library-no-results">
                没有找到匹配 "{searchFilter}" 的图片
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LibraryView;
