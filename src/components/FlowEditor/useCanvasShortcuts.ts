/**
 * useCanvasShortcuts — 画布快捷键 Hook
 * 从 FlowCanvas.tsx 提取键盘事件处理（onKeyDown / onKeyUp / 快捷键绑定）。
 *
 * Phase 4b: 当前为存根，FlowCanvas.tsx 中无键盘处理逻辑。
 * 如需添加快捷键（如 Delete 删除选中节点、Ctrl+C/V 复制粘贴），在此扩展。
 */

export interface UseCanvasShortcutsReturn {
  /** 当前无快捷键绑定，返回空 handler 以保持接口兼容 */
}

export function useCanvasShortcuts(): UseCanvasShortcutsReturn {
  // 预留：onKeyDown / onKeyUp / 快捷键绑定
  return {};
}
