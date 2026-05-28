import type { ValidationErrorResponse } from '../tauri/flow';

const VALIDATION_GUIDANCE_BY_CODE: Record<string, string> = {
  CONDITION_DEFAULT_OUTGOING_UNSUPPORTED:
    '条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。',
  CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED:
    '条件分支暂不支持在分支内串联多个节点。请先将该分支精简为一个直接连接的节点，或把复杂步骤拆到条件判断之后执行。',
  LOOP_SUBCHAIN_UNSUPPORTED:
    '循环暂不支持把多个子节点串成循环体。请先保留一个直接子节点作为循环内容，或把复杂步骤拆到循环块之后执行。',
  CYCLE_DETECTED:
    '检测到流程中存在循环连接（回路）。积木块不能形成首尾相连的环路。请删除导致环路的连线，避免执行时陷入死循环。',
  ORPHAN_BLOCK:
    '该积木块处于孤立状态，未连接到任何其他节点。请用连线将其接入主流程，或者删除不需要的节点。',
  EMPTY_CONDITION_BRANCHES:
    '条件判断的“真”与“假”分支均为空。请从条件块底部的“真/假”出口拉出连线，连接至对应要执行的积木块。',
  INVALID_CLICK_COUNT:
    '点击次数必须至少为 1 次。请在右侧配置面板中将点击次数修改为大于等于 1 的数值。',
  TIMEOUT_OUT_OF_RANGE:
    '等待超时时间超出合理范围。超时时间应设定在 100ms 到 60000ms（1分钟）之间。',
  ZERO_WAIT_TIME:
    '等待时间不能为 0ms。请设置一个大于 0 的有效等待毫秒数。',
  EMPTY_INPUT_TEXT:
    '输入文本内容不能为空。请在右侧配置面板输入您希望自动键入的文本内容。',
  ZERO_LOOP_COUNT:
    '循环次数必须至少为 1 次。请在右侧配置面板中将循环次数修改为大于等于 1 的数值。',
  NO_ENTRY:
    '当前流程未设置启动入口。请右键任意一个节点并选择“设为入口”，以指定自动化执行的起点。',
  INVALID_IMAGE_REFERENCE:
    '未配置有效的图片引用。请在配置区为该步骤重新捕获或选择一张目标图片。',
};

export function formatValidationMessage(validation: ValidationErrorResponse): string {
  return VALIDATION_GUIDANCE_BY_CODE[validation.code] ?? validation.message;
}

export function formatValidationResponse<T extends ValidationErrorResponse>(validation: T): T {
  const formattedMessage = formatValidationMessage(validation);

  if (formattedMessage === validation.message) {
    return validation;
  }

  return {
    ...validation,
    message: formattedMessage,
  };
}
