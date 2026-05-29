import { invoke } from '@tauri-apps/api/core';

export interface RuntimeIssuePayload {
  source: string;
  message: string;
  details?: string;
}

export async function logRuntimeIssue(payload: RuntimeIssuePayload): Promise<void> {
  await invoke('log_runtime_issue', { payload });
}
