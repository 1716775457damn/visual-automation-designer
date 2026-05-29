export type DiagnosticEventSource = 'frontend' | 'backend';

export interface DiagnosticEventLike {
  type: string;
  source?: DiagnosticEventSource;
  error?: string;
  message?: string;
}

export function classifyDiagnosticSource(event: DiagnosticEventLike): string | null {
  if (event.source === 'frontend') {
    return '前端';
  }

  if (event.source === 'backend') {
    return event.type === 'block_error' || event.type === 'execution_failed' ? '执行器' : '后端';
  }

  return null;
}

export function classifyDiagnosticKind(event: DiagnosticEventLike): string | null {
  const text = event.error ?? event.message ?? '';
  const normalized = text.toLowerCase();

  if (!text) {
    return null;
  }

  if (event.type === 'execution_failed' || event.type === 'block_error' || event.type === 'error') {
    return '执行错误';
  }

  if (event.type === 'stopped') {
    return '执行已停止';
  }

  if (
    normalized.includes('runtime environment') ||
    normalized.includes('input backend') ||
    normalized.includes('screen capture') ||
    normalized.includes('accessibility') ||
    normalized.includes('permission')
  ) {
    return '运行环境';
  }

  if (
    normalized.includes('condition branch') ||
    normalized.includes('loop subchain') ||
    normalized.includes('validation') ||
    normalized.includes('empty condition branches')
  ) {
    return '结构校验';
  }

  return null;
}
