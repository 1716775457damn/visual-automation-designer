/**
 * 错误处理工具函数
 * 将任意 catch 到的值统一转换为 Error 对象，避免散落重复的 instanceof 判断。
 */

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
