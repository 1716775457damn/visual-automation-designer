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
 * Check if a keyboard event is from an input element
 * (input, textarea, or contenteditable)
 */
function isInputElement(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  
  // If no target or target is not an element, it's not an input
  if (!target || !target.tagName) {
    return false;
  }
  
  const tagName = target.tagName.toLowerCase();
  
  // Check for input and textarea elements
  if (tagName === 'input' || tagName === 'textarea') {
    return true;
  }
  
  // Check for contenteditable elements
  if (target.isContentEditable) {
    return true;
  }
  
  return false;
}

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

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  const hasSelectionRef = useRef(hasSelection);
  hasSelectionRef.current = hasSelection;
  const hasFlowRef = useRef(hasFlow);
  hasFlowRef.current = hasFlow;
  const isExecutingRef = useRef(isExecuting);
  isExecutingRef.current = isExecuting;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) {
      return;
    }

    // Don't trigger shortcuts when typing in input fields
    if (isInputElement(event)) {
      return;
    }

    const h = handlersRef.current;
    const { key, shiftKey } = event;
    const isMetaPressed = isMetaOrCtrlPressed(event);

    // New: Ctrl+N / Cmd+N
    if (key === 'n' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      h.onNew?.();
      return;
    }

    // Undo: Ctrl+Z / Cmd+Z
    if (key === 'z' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (canUndoRef.current && h.onUndo) {
        h.onUndo();
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
      if (canRedoRef.current && h.onRedo) {
        h.onRedo();
      }
      return;
    }

    // Save: Ctrl+S / Cmd+S
    if (key === 's' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (hasFlowRef.current && h.onSave) {
        h.onSave();
      }
      return;
    }

    // Open: Ctrl+O / Cmd+O
    if (key === 'o' && isMetaPressed && !shiftKey) {
      event.preventDefault();
      if (h.onOpen) {
        h.onOpen();
      }
      return;
    }

    // Delete selected: Delete / Backspace
    if ((key === 'Delete' || key === 'Backspace') && hasSelectionRef.current) {
      event.preventDefault();
      if (h.onDelete) {
        h.onDelete();
      }
      return;
    }

    // F5: Execute flow (or resume if paused)
    if (key === 'F5' && !shiftKey) {
      event.preventDefault();
      if (hasFlowRef.current && h.onExecute && !isExecutingRef.current) {
        h.onExecute();
      }
      return;
    }

    // Shift+F5: Stop execution
    if (key === 'F5' && shiftKey) {
      event.preventDefault();
      if (isExecutingRef.current && h.onStop) {
        h.onStop();
      }
      return;
    }

    // F10: Step execution
    if (key === 'F10') {
      event.preventDefault();
      if (hasFlowRef.current && h.onStep && !isExecutingRef.current) {
        h.onStep();
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
