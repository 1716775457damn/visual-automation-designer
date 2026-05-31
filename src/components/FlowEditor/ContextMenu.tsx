/**
 * ContextMenu - 右键上下文菜单组件
 * 提供节点、连接线和画布的右键菜单功能
 * 
 * Validates: Requirements 2.2, 2.4, 2.5
 */

import { memo, useEffect, useRef, useCallback } from 'react';
import styles from './FlowEditor.module.css';

/**
 * Context menu item definition
 */
export interface ContextMenuItem {
  /** Display label */
  label: string;
  /** Optional icon (emoji or icon class) */
  icon?: string;
  /** Click handler */
  action?: () => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether to show a divider after this item */
  divider?: boolean;
  /** Danger style (for delete actions) */
  danger?: boolean;
  /** Submenu items */
  submenu?: ContextMenuItem[];
}

/**
 * Context menu position
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  /** Menu position (screen coordinates) */
  position: ContextMenuPosition;
  /** Menu items */
  items: ContextMenuItem[];
  /** Callback when menu should close */
  onClose: () => void;
  /** Optional data-testid */
  testId?: string;
}

/**
 * ContextMenu 组件 - 通用右键菜单
 * 支持点击外部关闭、子菜单和禁用项
 */
function ContextMenuComponent({
  position,
  items,
  onClose,
  testId = 'context-menu',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Use setTimeout to avoid immediate close on the same click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle item click
  const handleItemClick = useCallback((item: ContextMenuItem) => {
    if (item.disabled || item.submenu) return;
    item.action?.();
    onClose();
  }, [onClose]);

  // Clear submenu timeout on unmount
  useEffect(() => {
    const timeoutRef = submenuTimeoutRef;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Adjust position to stay within viewport
  const adjustedPosition = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    if (position.x + rect.width > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - rect.width - 8;
    }
    if (position.y + rect.height > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - rect.height - 8;
    }
  }

  return (
    <div
      ref={menuRef}
      className={`${styles.contextMenu} ${testId}`}
      data-testid={testId}
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000,
      }}
    >
      <ul className={styles.contextMenuList}>
        {items.map((item, index) => (
          <li key={index} className={styles.contextMenuItemWrapper}>
            <button
              className={`${styles.contextMenuItem} ${item.disabled ? styles.contextMenuItemDisabled : ''} ${item.danger ? styles.contextMenuItemDanger : ''} ${item.submenu ? styles.contextMenuItemHasSubmenu : ''}`}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              data-testid={`context-menu-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.icon && <span className={styles.contextMenuItemIcon}>{item.icon}</span>}
              <span className={styles.contextMenuItemLabel}>{item.label}</span>
              {item.submenu && <span className={styles.contextMenuItemArrow}>▶</span>}
            </button>
            {item.submenu && (
              <ul className={styles.contextMenuSubmenu}>
                {item.submenu.map((subItem, subIndex) => (
                  <li key={subIndex} className={styles.contextMenuItemWrapper}>
                    <button
                      className={`${styles.contextMenuItem} ${subItem.disabled ? styles.contextMenuItemDisabled : ''} ${subItem.danger ? styles.contextMenuItemDanger : ''}`}
                      onClick={() => handleItemClick(subItem)}
                      disabled={subItem.disabled}
                    >
                      {subItem.icon && <span className={styles.contextMenuItemIcon}>{subItem.icon}</span>}
                      <span className={styles.contextMenuItemLabel}>{subItem.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {item.divider && <hr className="context-menu__divider" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ContextMenu = memo(ContextMenuComponent);

/**
 * Context menu target type
 */
export type ContextMenuTargetType = 'node' | 'edge' | 'canvas';

/**
 * Context menu context information
 */
export interface ContextMenuContext {
  /** Target type */
  type: ContextMenuTargetType;
  /** Target ID (node or edge ID) */
  targetId?: string;
  /** Position on canvas (for adding blocks) */
  canvasPosition?: { x: number; y: number };
  /** Screen position for menu rendering */
  screenPosition?: { x: number; y: number };
}

export default ContextMenu;
