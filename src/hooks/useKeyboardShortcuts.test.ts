/**
 * Unit tests for useKeyboardShortcuts hook
 * 
 * Validates: Requirements 2.6, 5.1, 5.5, 5.6, 7.1, 7.2
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let handlers: KeyboardShortcutHandlers;

  beforeEach(() => {
    handlers = {
      onUndo: vi.fn() as unknown as () => void,
      onRedo: vi.fn() as unknown as () => void,
      onDelete: vi.fn() as unknown as () => void,
      onExecute: vi.fn() as unknown as () => void,
      onStep: vi.fn() as unknown as () => void,
      onStop: vi.fn() as unknown as () => void,
      onSave: vi.fn() as unknown as () => void,
      onOpen: vi.fn() as unknown as () => void,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const dispatchKeyEvent = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
    return event;
  };

  describe('Undo/Redo shortcuts', () => {
    it('should trigger onUndo with Ctrl+Z', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canUndo: true,
        })
      );

      dispatchKeyEvent('z', { ctrlKey: true });
      expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    });

    it('should trigger onRedo with Ctrl+Y', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canRedo: true,
        })
      );

      dispatchKeyEvent('y', { ctrlKey: true });
      expect(handlers.onRedo).toHaveBeenCalledTimes(1);
    });

    it('should trigger onRedo with Ctrl+Shift+Z', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canRedo: true,
        })
      );

      dispatchKeyEvent('z', { ctrlKey: true, shiftKey: true });
      expect(handlers.onRedo).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onUndo when canUndo is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canUndo: false,
        })
      );

      dispatchKeyEvent('z', { ctrlKey: true });
      expect(handlers.onUndo).not.toHaveBeenCalled();
    });
  });

  describe('Delete shortcuts', () => {
    it('should trigger onDelete with Delete key when hasSelection is true', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasSelection: true,
        })
      );

      dispatchKeyEvent('Delete');
      expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it('should trigger onDelete with Backspace key when hasSelection is true', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasSelection: true,
        })
      );

      dispatchKeyEvent('Backspace');
      expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onDelete when hasSelection is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasSelection: false,
        })
      );

      dispatchKeyEvent('Delete');
      expect(handlers.onDelete).not.toHaveBeenCalled();
    });
  });

  describe('Execution shortcuts', () => {
    it('should trigger onExecute with F5', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: true,
          isExecuting: false,
        })
      );

      dispatchKeyEvent('F5');
      expect(handlers.onExecute).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onExecute when hasFlow is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: false,
          isExecuting: false,
        })
      );

      dispatchKeyEvent('F5');
      expect(handlers.onExecute).not.toHaveBeenCalled();
    });

    it('should not trigger onExecute when isExecuting is true', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: true,
          isExecuting: true,
        })
      );

      dispatchKeyEvent('F5');
      expect(handlers.onExecute).not.toHaveBeenCalled();
    });

    it('should trigger onStop with Shift+F5', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          isExecuting: true,
        })
      );

      dispatchKeyEvent('F5', { shiftKey: true });
      expect(handlers.onStop).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onStop when isExecuting is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          isExecuting: false,
        })
      );

      dispatchKeyEvent('F5', { shiftKey: true });
      expect(handlers.onStop).not.toHaveBeenCalled();
    });

    it('should trigger onStep with F10', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: true,
          isExecuting: false,
        })
      );

      dispatchKeyEvent('F10');
      expect(handlers.onStep).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onStep when hasFlow is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: false,
          isExecuting: false,
        })
      );

      dispatchKeyEvent('F10');
      expect(handlers.onStep).not.toHaveBeenCalled();
    });

    it('should not trigger onStep when isExecuting is true', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: true,
          isExecuting: true,
        })
      );

      dispatchKeyEvent('F10');
      expect(handlers.onStep).not.toHaveBeenCalled();
    });
  });

  describe('File operation shortcuts', () => {
    it('should trigger onSave with Ctrl+S', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: true,
        })
      );

      dispatchKeyEvent('s', { ctrlKey: true });
      expect(handlers.onSave).toHaveBeenCalledTimes(1);
    });

    it('should not trigger onSave when hasFlow is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          hasFlow: false,
        })
      );

      dispatchKeyEvent('s', { ctrlKey: true });
      expect(handlers.onSave).not.toHaveBeenCalled();
    });

    it('should trigger onOpen with Ctrl+O', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
        })
      );

      dispatchKeyEvent('o', { ctrlKey: true });
      expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('Input element handling', () => {
    it('should not trigger shortcuts when focus is on input element', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canUndo: true,
        })
      );

      // Create an input element and focus it
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      // Dispatch event with input as target
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);

      expect(handlers.onUndo).not.toHaveBeenCalled();

      // Cleanup
      document.body.removeChild(input);
    });

    it('should not trigger shortcuts when focus is on textarea element', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canUndo: true,
        })
      );

      // Create a textarea element and focus it
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      // Dispatch event with textarea as target
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: textarea });
      window.dispatchEvent(event);

      expect(handlers.onUndo).not.toHaveBeenCalled();

      // Cleanup
      document.body.removeChild(textarea);
    });
  });

  describe('Enable/disable behavior', () => {
    it('should not trigger any shortcuts when enabled is false', () => {
      renderHook(() => 
        useKeyboardShortcuts({
          enabled: false,
          handlers,
          canUndo: true,
          canRedo: true,
          hasSelection: true,
          hasFlow: true,
        })
      );

      dispatchKeyEvent('z', { ctrlKey: true });
      dispatchKeyEvent('y', { ctrlKey: true });
      dispatchKeyEvent('Delete');
      dispatchKeyEvent('F5');
      dispatchKeyEvent('s', { ctrlKey: true });

      expect(handlers.onUndo).not.toHaveBeenCalled();
      expect(handlers.onRedo).not.toHaveBeenCalled();
      expect(handlers.onDelete).not.toHaveBeenCalled();
      expect(handlers.onExecute).not.toHaveBeenCalled();
      expect(handlers.onSave).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup behavior', () => {
    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() => 
        useKeyboardShortcuts({
          enabled: true,
          handlers,
          canUndo: true,
        })
      );

      unmount();

      dispatchKeyEvent('z', { ctrlKey: true });
      expect(handlers.onUndo).not.toHaveBeenCalled();
    });
  });
});
