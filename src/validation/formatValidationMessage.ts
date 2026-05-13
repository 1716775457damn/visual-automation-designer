import type { ValidationErrorResponse } from '../tauri/flow';

const VALIDATION_GUIDANCE_BY_CODE: Record<string, string> = {
  CONDITION_DEFAULT_OUTGOING_UNSUPPORTED:
    '条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。',
  CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED:
    '条件分支暂不支持在分支内串联多个节点。请先将该分支精简为一个直接连接的节点，或把复杂步骤拆到条件判断之后执行。',
  LOOP_SUBCHAIN_UNSUPPORTED:
    '循环暂不支持把多个子节点串成循环体。请先保留一个直接子节点作为循环内容，或把复杂步骤拆到循环块之后执行。',
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
