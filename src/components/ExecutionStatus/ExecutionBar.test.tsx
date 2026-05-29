import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionBar } from './ExecutionBar';

describe('ExecutionBar error classification', () => {
  it('labels validation-blocked runtime errors as runtime environment issues', () => {
    render(
      <ExecutionBar
        status="validation_blocked"
        errorMessage="Input backend is unavailable"
      />
    );

    expect(screen.getByTestId('execution-error')).toHaveTextContent('[运行环境] Input backend is unavailable');
  });

  it('labels validation-blocked validation errors as structural validation issues', () => {
    render(
      <ExecutionBar
        status="validation_blocked"
        errorMessage="Condition branch validation failed"
      />
    );

    expect(screen.getByTestId('execution-error')).toHaveTextContent('[结构校验] Condition branch validation failed');
  });

  it('labels status=error as execution errors', () => {
    render(
      <ExecutionBar
        status="error"
        errorMessage="Screenshot matching failed"
      />
    );

    expect(screen.getByTestId('execution-error')).toHaveTextContent('[执行错误] Screenshot matching failed');
  });
});
