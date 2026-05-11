/**
 * ConfirmDialog - 确认对话框组件
 * 用于需要用户确认的操作（如删除）
 */

import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Focus the dialog when it opens
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return '🗑️';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return '❓';
    }
  };

  return (
    <div className="confirm-dialog" onClick={onCancel} role="dialog" aria-modal="true">
      <div
        ref={dialogRef}
        className="confirm-dialog__content"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="confirm-dialog__header">
          <span className="confirm-dialog__icon">{getIcon()}</span>
          <h3 className="confirm-dialog__title">{title}</h3>
        </div>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`confirm-dialog__btn confirm-dialog__btn--${variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
