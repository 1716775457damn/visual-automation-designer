/**
 * useTheme - 主题管理钩子
 * 支持亮色/暗色/自动主题切换
 *
 * UX优化103: 主题切换功能
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

/**
 * 获取系统主题偏好
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 获取存储的主题模式
 */
function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

/**
 * 主题管理钩子
 */
export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // 计算实际主题
  const theme = mode === 'auto' ? systemTheme : mode;
  const isDark = theme === 'dark';

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // 应用主题到 DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 设置主题模式
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(THEME_STORAGE_KEY, newMode);
  }, []);

  // 切换主题 (light -> dark -> auto -> light)
  const toggleTheme = useCallback(() => {
    const modes: ThemeMode[] = ['light', 'dark', 'auto'];
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMode(modes[nextIndex]);
  }, [mode, setMode]);

  return {
    theme,
    mode,
    setMode,
    toggleTheme,
    isDark,
  };
}

export default useTheme;
