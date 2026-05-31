/**
 * AppProviders — React Context Provider 嵌套层
 * Phase 4d: 从 App.tsx 提取，集中管理所有全局 Provider。
 */

import { ToastProvider } from './components/common';

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return <ToastProvider>{children}</ToastProvider>;
}

export default AppProviders;
