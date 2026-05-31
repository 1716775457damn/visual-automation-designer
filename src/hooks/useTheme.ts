/**
 * useTheme — 主题管理钩子 (Phase 2: Class-based Design Token System)
 *
 * 将主题状态持久化到 localStorage，通过 <html> 的 class (theme-dark / theme-light)
 * 驱动 --vad-* CSS 变量体系，同时保留 data-theme 属性兼容旧版 variables.css。
 */

import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface UseThemeReturn {
  /** 当前实际主题 (light 或 dark) */
  theme: 'light' | 'dark';
  /** 用户选择的模式 */
  mode: ThemeMode;
  /** 设置主题模式 */
  setMode: (mode: ThemeMode) => void;
  /** 切换主题 */
  toggleTheme: () => void;
  /** 是否为暗色主题 */
  isDark: boolean;
}

const THEME_STORAGE_KEY = 'vad-theme-mode';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored;
    }
  } catch {
    // localStorage unavailable (incognito / SSR), fall through
  }
  return 'dark';
}

function applyThemeClass(theme: 'light' | 'dark'): void {
  const root = document.documentElement;

  // Phase 2: class-based tokens (.theme-dark / .theme-light)
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');

  // Backward compat: keep data-theme for legacy variables.css
  root.setAttribute('data-theme', theme);
}

export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  const theme: 'light' | 'dark' = mode === 'auto' ? systemTheme : mode;
  const isDark = theme === 'dark';

  // Listen for OS-level theme changes (auto mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Apply theme classes & data-theme to <html>
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {
      // Ignore write failures
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode =
      mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark';
    setMode(next);
  }, [mode, setMode]);

  return { theme, mode, setMode, toggleTheme, isDark };
}

export default useTheme;
