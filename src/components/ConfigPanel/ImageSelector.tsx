/**
 * ImageSelector - 图片选择器组件
 * 从图片库选择图片，支持搜索和筛选
 * 
 * Validates: Requirements 3.6
 */

import { useState, useMemo, useCallback } from 'react';
import { useImageLibrary } from '../../hooks/useImageLibrary';

export interface ImageSelectorProps {
  /** Currently selected image ID */
  selectedId?: string;
  /** Callback when an image is selected */
  onSelect?: (imageId: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Whether to show upload button when empty */
  showUploadButton?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Custom class name */
  className?: string;
}

/**
 * ImageSelector 组件 - 图片选择器
 * 
 * Features:
 * - Display images from library
 * - Search/filter functionality
 * - Support for empty state with upload option
 * - Grid layout for image thumbnails
 */
export function ImageSelector({
  selectedId,
  onSelect,
  searchPlaceholder = '搜索图片...',
  showUploadButton = true,
  emptyMessage = '暂无图片',
  className = '',
}: ImageSelectorProps) {
  const {
    images,
    loading,
    error,
    selectAndUploadImage,
    refreshImages,
  } = useImageLibrary();

  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Filter images based on search query
  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) {
      return images;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return images.filter((img) =>
      img.name.toLowerCase().includes(lowerQuery)
    );
  }, [images, searchQuery]);

  const handleUpload = useCallback(async () => {
    setIsUploading(true);
    try {
      const metadata = await selectAndUploadImage();
      if (metadata) {
        onSelect?.(metadata.id);
      }
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      setIsUploading(false);
    }
  }, [selectAndUploadImage, onSelect]);

  const handleImageClick = useCallback((imageId: string) => {
    onSelect?.(imageId);
  }, [onSelect]);

  return (
    <div className={`image-selector ${className}`} data-testid="image-selector">
      {/* Search input */}
      <div className="image-selector__search">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="image-selector__search-input"
          data-testid="image-search-input"
        />
        {searchQuery && (
          <button
            className="image-selector__clear-btn"
            onClick={() => setSearchQuery('')}
            data-testid="clear-search-btn"
          >
            ×
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="image-selector__loading" data-testid="image-selector-loading">
          <span>加载中...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="image-selector__error" data-testid="image-selector-error">
          <span>加载失败</span>
          <button onClick={refreshImages} className="image-selector__retry-btn">
            重试
          </button>
        </div>
      )}

      {/* Image grid */}
      {!loading && !error && (
        <div className="image-selector__grid" data-testid="image-selector-grid">
          {filteredImages.map((image) => (
            <div
              key={image.id}
              className={`image-selector__item ${selectedId === image.id ? 'image-selector__item--selected' : ''}`}
              onClick={() => handleImageClick(image.id)}
              data-testid={`image-option-${image.id}`}
              title={image.name}
            >
              <div className="image-selector__thumbnail">
                {image.filePath ? (
                  <img 
                    src={image.filePath} 
                    alt={image.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="image-selector__placeholder">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21,15 16,10 5,21" />
                    </svg>
                  </div>
                )}
              </div>
              <span className="image-selector__name">{image.name}</span>
              {selectedId === image.id && (
                <div className="image-selector__check" data-testid={`selected-check-${image.id}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                </div>
              )}
            </div>
          ))}

          {/* Empty state */}
          {images.length === 0 && (
            <div className="image-selector__empty" data-testid="image-selector-empty">
              <p>{emptyMessage}</p>
              {showUploadButton && (
                <button
                  className="image-selector__upload-btn"
                  onClick={handleUpload}
                  disabled={isUploading}
                  data-testid="btn-upload-image"
                >
                  {isUploading ? '上传中...' : '上传图片'}
                </button>
              )}
            </div>
          )}

          {/* No search results */}
          {images.length > 0 && filteredImages.length === 0 && (
            <div className="image-selector__no-results" data-testid="image-selector-no-results">
              没有找到匹配 "{searchQuery}" 的图片
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageSelector;
