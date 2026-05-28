import { describe, expect, it } from 'vitest';
import { formatValidationMessage, formatValidationResponse } from './formatValidationMessage';
import type { ValidationErrorResponse } from '../tauri/flow';

describe('formatValidationMessage', () => {
  it.each([
    [
      'CONDITION_DEFAULT_OUTGOING_UNSUPPORTED',
      '条件判断暂不支持默认出口连接。请删除条件块底部的普通连线，只使用“真/假”两个分支出口连接后续节点。',
    ],
    [
      'CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED',
      '条件分支暂不支持在分支内串联多个节点。请先将该分支精简为一个直接连接的节点，或把复杂步骤拆到条件判断之后执行。',
    ],
    [
      'LOOP_SUBCHAIN_UNSUPPORTED',
      '循环暂不支持把多个子节点串成循环体。请先保留一个直接子节点作为循环内容，或把复杂步骤拆到循环块之后执行。',
    ],
    [
      'CYCLE_DETECTED',
      '检测到流程中存在循环连接（回路）。积木块不能形成首尾相连的环路。请删除导致环路的连线，避免执行时陷入死循环。',
    ],
    [
      'NO_ENTRY',
      '当前流程未设置启动入口。请右键任意一个节点并选择“设为入口”，以指定自动化执行的起点。',
    ],
  ])('returns actionable Chinese guidance for %s', (code, expectedMessage) => {
    expect(formatValidationMessage({ code, message: 'raw backend message' })).toBe(expectedMessage);
  });

  it('preserves unknown validation messages', () => {
    expect(formatValidationMessage({ code: 'SOME_UNKNOWN_CODE_KEY', message: 'Wait time is zero' })).toBe('Wait time is zero');
  });

  it('preserves metadata while replacing supported messages', () => {
    const validation: ValidationErrorResponse = {
      code: 'LOOP_SUBCHAIN_UNSUPPORTED',
      message: 'Loop subchains are unsupported',
      blockId: 'loop-1',
      connectionId: 'edge-1',
    };

    expect(formatValidationResponse(validation)).toEqual({
      ...validation,
      message: '循环暂不支持把多个子节点串成循环体。请先保留一个直接子节点作为循环内容，或把复杂步骤拆到循环块之后执行。',
    });
  });
});
