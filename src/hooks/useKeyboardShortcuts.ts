/**
 * useKeyboardShortcuts - Keyboard Shortcuts Hook
 * Handles global keyboard shortcuts for the Visual Automation Designer
 * 
 * Supports platform-specific modifiers (Ctrl on Windows/Linux, Cmd on Mac)
 * 
 * Shortcuts:
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Y / Cmd+Shift+Z: Redo
 * - Delete / Backspace: Delete selected
 * - F5: Execute flow
 * - F10: Step execution
 * - Shift+F5: Stop execution
 * - Ctrl+S / Cmd+S: Save flow
 * - Ctrl+O / Cmd+O: Open flow list
 * 
 * Validates: Requirements 2.6, 5.1, 5.5, 5.6, 7.1, 7.2
 */

import { useEffect, useCallback, useRef } from 'react';
import { isInputElement } from '../utils/dom';

/**
 * Check if the user is on macOS — cached at module level (platform never changes).
 */
const isMacOS: boolean = (() => {
  try {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  } catch {
    return false;
  }
})();

/**
 * Check if the meta/ctrl key is pressed (platform-specific)
 */
function isMetaOrCtrlPressed(event: KeyboardEvent): boolean {
  return isMacOS ? event.metaKey : event.ctrlKey;
}

export interface KeyboardShortcutHandlers {
  onNew?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onExecute?: () => void;
  onStep?: () => void;
  onStop?: () => void;
  onSave?: () => void;
  onOpen?: () => void;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  handlers: KeyboardShortcutHandlers;
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  hasFlow?: boolean;
  isExecuting?: boolean;
}

/**
 * useKeyboardShortcuts Hook
 * Listens for keyboard events and triggers corresponding handlers
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const {
    enabled = true,
    handlers,
    canUndo = false,
    canRedo = false,
    hasSelection = false,
    hasFlow = false,
    isExecuting = false,
  } = options;

  const stateRef = useRef({ handlers, canUndo, canRedo, hasSelection, hasFlow, isExecuting });
  stateRef.current = { handlers, canUndo, canRedo, hasSelection, hasFlow, isExecuting };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) {
      return;
    }

    // Don't trigger shortcuts when typing in input fields
    if (isInputElement(event.target)) {
      return;
    }

    const s = stateRef.current;
    const { key, shiftKey } = event;
    const isMetaPressed = isMetaOrCtrlPressed(event);

    // New: Ctrl+N / Cmd+N
    if (key === 'n' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      s.handlers.onNew?.();
      return;
    }

    // Undo: Ctrl+Z / Cmd+Z
    if (key === 'z' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (s.canUndo && s.handlers.onUndo) {
        s.handlers.onUndo();
      }
      return;
    }

    // Redo: Ctrl+Y / Cmd+Shift+Z
    // On Windows, Ctrl+Y is commonly used for redo
    // On Mac, Cmd+Shift+Z is the standard redo shortcut
    if (
      (key === 'y' && isMetaPressed && !shiftKey) || // Ctrl+Y / Cmd+Y
      (key === 'z' && isMetaPressed && shiftKey)     // Ctrl+Shift+Z / Cmd+Shift+Z
    ) {
      event.preventDefault();
      if (s.canRedo && s.handlers.onRedo) {
        s.handlers.onRedo();
      }
      return;
    }

    // Save: Ctrl+S / Cmd+S
    if (key === 's' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (s.hasFlow && s.handlers.onSave) {
        s.handlers.onSave();
      }
      return;
    }

    // Open: Ctrl+O / Cmd+O
    if (key === 'o' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (s.handlers.onOpen) {
        s.handlers.onOpen();
      }
      return;
    }

    // Delete selected: Delete / Backspace
    if ((key === 'Delete' || key === 'Backspace') && s.hasSelection) {
      event.preventDefault();
      if (s.handlers.onDelete) {
        s.handlers.onDelete();
      }
      return;
    }

    // F5: Execute flow (or resume if paused)
    if (key === 'F5' && !shiftKey) {
      event.preventDefault();
      if (s.hasFlow && s.handlers.onExecute && !s.isExecuting) {
        s.handlers.onExecute();
      }
      return;
    }

    // Shift+F5: Stop execution
    if (key === 'F5' && shiftKey) {
      event.preventDefault();
      if (s.isExecuting && s.handlers.onStop) {
        s.handlers.onStop();
      }
      return;
    }

    // F10: Step execution
    if (key === 'F10') {
      event.preventDefault();
      if (s.hasFlow && s.handlers.onStep && !s.isExecuting) {
        s.handlers.onStep();
      }
      return;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

export default useKeyboardShortcuts;
