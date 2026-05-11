/**
 * ImageCard - 图片卡片组件
 * 展示单个图片的缩略图和信息
 * 
 * Validates: Requirements 1.4
 */

import React, { useState, useCallback } from 'react';

export interface ImageCardProps {
  /** Image ID */
  id: string;
  /** Image name */
  name: string;
  /** Thumbnail URL or file path */
  thumbnail?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Image format (png, jpg, bmp) */
  format?: string;
  /** Whether the card is selected */
  selected?: boolean;
  /** Callback when image is selected */
  onSelect?: (id: string) => void;
  /** Callback when image is deleted */
  onDelete?: (id: string) => void;
  /** Callback when image is renamed */
  onRename?: (id: string, newName: string) => void;
  /** Whether to show actions on hover only */
  showActionsOnHover?: boolean;
}

/**
 * ImageCard 组件 - 图片卡片
 * 
 * Features:
 * - Display thumbnail and image info
 * - Support selection, rename, and delete
 * - Show dimensions and format
 */
export function ImageCard({
  id,
  name,
  thumbnail,
  width,
  height,
  format,
  selected = false,
  onSelect,
  onDelete,
  onRename,
  showActionsOnHover = true,
}: ImageCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const handleStartRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(name);
  }, [name]);

  const handleRenameSubmit = useCallback(() => {
    if (editName.trim() && editName !== name) {
      onRename?.(id, editName.trim());
    }
    setIsEditing(false);
  }, [editName, id, name, onRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(name);
    }
  }, [handleRenameSubmit, name]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定删除图片 "${name}" 吗？`)) {
      onDelete?.(id);
    }
  }, [id, name, onDelete]);

  return (
    <div
      className={`image-card ${selected ? 'image-card--selected' : ''} ${showActionsOnHover ? 'image-card--hover-actions' : ''}`}
      onClick={() => onSelect?.(id)}
      data-testid={`image-card-${id}`}
    >
      {/* Thumbnail */}
      <div className="image-card__thumbnail">
        {thumbnail ? (
          <img 
            src={thumbnail} 
            alt={name}
            onError={(e) => {
              // Fallback if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="image-card__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="image-card__info">
        {isEditing ? (
          <input
            type="text"
            className="image-card__name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            data-testid={`rename-input-${id}`}
          />
        ) : (
          <span className="image-card__name" title={name}>{name}</span>
        )}
        
        {(width && height) && (
          <span className="image-card__dimensions">{width}×{height}</span>
        )}
        
        {format && (
          <span className="image-card__format">{format.toUpperCase()}</span>
        )}
      </div>

      {/* Actions */}
      <div className="image-card__actions">
        <button
          className="image-card__btn image-card__btn--rename"
          onClick={handleStartRename}
          title="重命名"
          data-testid={`btn-rename-${id}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          className="image-card__btn image-card__btn--delete"
          onClick={handleDelete}
          title="删除"
          data-testid={`btn-delete-${id}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ImageCard;
