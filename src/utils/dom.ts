/**
 * DOM 工具函数
 */

/**
 * 判断事件目标是否为输入类元素（input / textarea / contenteditable），
 * 用于键盘快捷键判断，避免在用户输入时触发全局快捷键。
 */
export function isInputElement(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable;
}
