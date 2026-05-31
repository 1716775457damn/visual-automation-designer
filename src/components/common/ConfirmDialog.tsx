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
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    // Store the currently focused element for focus restoration
    triggerRef.current = document.activeElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Auto-focus the confirm button when dialog opens
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      // Return focus to the element that triggered the dialog
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
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
        className={commonStyles.confirmDialogContent}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className={commonStyles.confirmDialogHeader}>
          <span className={commonStyles.confirmDialogIcon}>{getIcon()}</span>
          <h3 className={commonStyles.confirmDialogTitle}>{title}</h3>
        </div>
        <p className={commonStyles.confirmDialogMessage}>{message}</p>
        <div className={commonStyles.confirmDialogActions}>
          <button className={commonStyles.confirmDialogBtn} onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`${commonStyles.confirmDialogBtn} ${commonStyles[`confirmDialogBtn${variant.charAt(0).toUpperCase() + variant.slice(1)}`]}`}
            onClick={onConfirm}
            ref={confirmBtnRef}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
