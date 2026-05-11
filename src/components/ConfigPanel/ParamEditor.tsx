/**
 * ParamEditor - 参数编辑器组件
 * 提供通用参数编辑功能
 * 
 * Validates: Requirements 3.5
 */

{}

export type ParamType = 'string' | 'number' | 'boolean' | 'select';

export interface ParamSchema {
  key: string;
  label: string;
  type: ParamType;
  defaultValue?: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface ParamEditorProps {
  schema: ParamSchema[];
  values?: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
}

/**
 * ParamEditor 组件 - 参数编辑器
 */
export function ParamEditor({
  schema,
  values = {},
  onChange,
}: ParamEditorProps) {
  const getValue = (key: string, defaultValue: unknown) => {
    return values[key] !== undefined ? values[key] : defaultValue;
  };

  const renderField = (param: ParamSchema) => {
    const value = getValue(param.key, param.defaultValue);

    switch (param.type) {
      case 'string':
        return (
          <input
            type="text"
            value={value as string}
            onChange={(e) => onChange?.(param.key, e.target.value)}
            data-testid={`param-${param.key}`}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            min={param.min}
            max={param.max}
            onChange={(e) => onChange?.(param.key, Number(e.target.value))}
            data-testid={`param-${param.key}`}
          />
        );
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange?.(param.key, e.target.checked)}
            data-testid={`param-${param.key}`}
          />
        );
      case 'select':
        return (
          <select
            value={value as string}
            onChange={(e) => onChange?.(param.key, e.target.value)}
            data-testid={`param-${param.key}`}
          >
            {param.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="param-editor" data-testid="param-editor">
      {schema.map((param) => (
        <div key={param.key} className="param-editor__field">
          <label className="param-editor__label">{param.label}</label>
          {renderField(param)}
        </div>
      ))}
    </div>
  );
}

export default ParamEditor;
