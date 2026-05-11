/**
 * BlockConfig - 积木块配置面板容器组件
 * 根据积木块类型显示不同的配置选项
 * 
 * Validates: Requirements 3.5
 */

import { useState, useCallback, useMemo } from 'react';
import { ImageSelector } from './ImageSelector';
import type { 
  BlockConfig as BlockConfigType, 
  ClickMode, 
  ConditionOp
} from '../../types/block';

export interface BlockConfigProps {
  blockId: string;
  blockType: string;
  config?: Record<string, unknown>;
  onSave?: (config: Record<string, unknown>) => void;
  onCancel?: () => void;
}

/**
 * 获取积木块类型的显示名称
 */
function getBlockTypeName(blockType: string): string {
  const typeNames: Record<string, string> = {
    'click': '点击',
    'wait_image': '等待图片',
    'wait_time': '等待时间',
    'input_text': '输入文本',
    'loop': '循环',
    'loop_infinite': '无限循环',
    'condition': '条件判断',
  };
  return typeNames[blockType] || blockType;
}

/**
 * ClickBlock 配置组件
 */
interface ClickConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function ClickConfigUI({ config, onChange }: ClickConfigUIProps) {
  const mode = (config.mode as ClickMode) || { mode: 'coordinates', x: 0, y: 0 };
  const count = (config.count as number) ?? 1;

  const handleModeChange = (newMode: 'coordinates' | 'image') => {
    if (newMode === 'coordinates') {
      onChange({ ...config, mode: { mode: 'coordinates', x: 0, y: 0 } });
    } else {
      onChange({ ...config, mode: { mode: 'image', imageId: '' } });
    }
  };

  const handleCoordinateChange = (field: 'x' | 'y', value: number) => {
    const currentMode = mode as { mode: 'coordinates'; x: number; y: number };
    if (currentMode.mode === 'coordinates') {
      onChange({
        ...config,
        mode: { ...currentMode, [field]: value },
      });
    }
  };

  const handleImageSelect = (imageId: string) => {
    const currentMode = mode as { mode: 'image'; imageId: string };
    if (currentMode.mode === 'image') {
      onChange({
        ...config,
        mode: { ...currentMode, imageId },
      });
    }
  };

  return (
    <div className="block-config__section" data-testid="click-config">
      <div className="block-config__field">
        <label className="block-config__label">点击模式</label>
        <div className="block-config__mode-selector">
          <button
            className={`block-config__mode-btn ${mode.mode === 'coordinates' ? 'active' : ''}`}
            onClick={() => handleModeChange('coordinates')}
            data-testid="mode-coordinates"
          >
            坐标模式
          </button>
          <button
            className={`block-config__mode-btn ${mode.mode === 'image' ? 'active' : ''}`}
            onClick={() => handleModeChange('image')}
            data-testid="mode-image"
          >
            图片模式
          </button>
        </div>
      </div>

      {mode.mode === 'coordinates' && (
        <div className="block-config__field-group">
          <div className="block-config__field">
            <label className="block-config__label">X 坐标</label>
            <input
              type="number"
              className="block-config__input"
              value={(mode as { mode: 'coordinates'; x: number; y: number }).x}
              onChange={(e) => handleCoordinateChange('x', Number(e.target.value))}
              min={0}
              data-testid="input-x"
            />
          </div>
          <div className="block-config__field">
            <label className="block-config__label">Y 坐标</label>
            <input
              type="number"
              className="block-config__input"
              value={(mode as { mode: 'coordinates'; x: number; y: number }).y}
              onChange={(e) => handleCoordinateChange('y', Number(e.target.value))}
              min={0}
              data-testid="input-y"
            />
          </div>
        </div>
      )}

      {mode.mode === 'image' && (
        <div className="block-config__field">
          <label className="block-config__label">选择图片</label>
          <ImageSelector
            selectedId={(mode as { mode: 'image'; imageId: string }).imageId}
            onSelect={handleImageSelect}
            showUploadButton={true}
            emptyMessage="请选择或上传图片"
          />
        </div>
      )}

      <div className="block-config__field">
        <label className="block-config__label">点击次数</label>
        <input
          type="number"
          className="block-config__input"
          value={count}
          onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}
          min={1}
          max={3}
          data-testid="input-count"
        />
      </div>
    </div>
  );
}

/**
 * WaitImageBlock 配置组件
 */
interface WaitImageConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function WaitImageConfigUI({ config, onChange }: WaitImageConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const timeoutMs = (config.timeoutMs as number) ?? 5000;

  const handleImageSelect = (newImageId: string) => {
    onChange({ ...config, imageId: newImageId });
  };

  return (
    <div className="block-config__section" data-testid="wait-image-config">
      <div className="block-config__field">
        <label className="block-config__label">等待图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={handleImageSelect}
          showUploadButton={true}
          emptyMessage="请选择或上传要等待的图片"
        />
      </div>

      <div className="block-config__field">
        <label className="block-config__label">超时时间 (毫秒)</label>
        <input
          type="number"
          className="block-config__input"
          value={timeoutMs}
          onChange={(e) => onChange({ ...config, timeoutMs: Number(e.target.value) })}
          min={100}
          step={100}
          data-testid="input-timeout"
        />
        <span className="block-config__hint">默认 5000 毫秒</span>
      </div>
    </div>
  );
}

/**
 * WaitTimeBlock 配置组件
 */
interface WaitTimeConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function WaitTimeConfigUI({ config, onChange }: WaitTimeConfigUIProps) {
  const durationMs = (config.durationMs as number) ?? 1000;

  return (
    <div className="block-config__section" data-testid="wait-time-config">
      <div className="block-config__field">
        <label className="block-config__label">等待时间 (毫秒)</label>
        <input
          type="number"
          className="block-config__input"
          value={durationMs}
          onChange={(e) => onChange({ ...config, durationMs: Number(e.target.value) })}
          min={0}
          step={100}
          data-testid="input-duration"
        />
        <span className="block-config__hint">1000 毫秒 = 1 秒</span>
      </div>
    </div>
  );
}

/**
 * InputTextBlock 配置组件
 */
interface InputTextConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function InputTextConfigUI({ config, onChange }: InputTextConfigUIProps) {
  const text = (config.text as string) || '';
  const intervalMs = (config.intervalMs as number) ?? 50;

  return (
    <div className="block-config__section" data-testid="input-text-config">
      <div className="block-config__field">
        <label className="block-config__label">输入文本</label>
        <textarea
          className="block-config__textarea"
          value={text}
          onChange={(e) => onChange({ ...config, text: e.target.value })}
          placeholder="输入要模拟输入的文本内容"
          rows={3}
          data-testid="input-text"
        />
      </div>

      <div className="block-config__field">
        <label className="block-config__label">输入间隔 (毫秒)</label>
        <input
          type="number"
          className="block-config__input"
          value={intervalMs}
          onChange={(e) => onChange({ ...config, intervalMs: Number(e.target.value) })}
          min={0}
          max={1000}
          step={10}
          data-testid="input-interval"
        />
        <span className="block-config__hint">字符之间的输入间隔，默认 50 毫秒</span>
      </div>
    </div>
  );
}

/**
 * LoopBlock 配置组件
 */
interface LoopConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function LoopConfigUI({ config, onChange }: LoopConfigUIProps) {
  const count = (config.count as number) ?? 1;

  return (
    <div className="block-config__section" data-testid="loop-config">
      <div className="block-config__field">
        <label className="block-config__label">循环次数</label>
        <input
          type="number"
          className="block-config__input"
          value={count}
          onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}
          min={1}
          data-testid="input-loop-count"
        />
      </div>
      <p className="block-config__info">
        将子积木块拖入此循环块内部来定义循环内容
      </p>
    </div>
  );
}

/**
 * LoopInfiniteBlock 配置组件
 */
function LoopInfiniteConfigUI() {
  return (
    <div className="block-config__section" data-testid="loop-infinite-config">
      <p className="block-config__info">
        无限循环将持续执行内部积木块，直到用户手动停止。
      </p>
      <p className="block-config__info">
        将子积木块拖入此循环块内部来定义循环内容。
      </p>
    </div>
  );
}

/**
 * ConditionalBlock 配置组件
 */
interface ConditionConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function ConditionConfigUI({ config, onChange }: ConditionConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const condition = (config.condition as ConditionOp) || 'image_exists';

  const handleImageSelect = (newImageId: string) => {
    onChange({ ...config, imageId: newImageId });
  };

  const handleConditionChange = (newCondition: ConditionOp) => {
    onChange({ ...config, condition: newCondition });
  };

  return (
    <div className="block-config__section" data-testid="condition-config">
      <div className="block-config__field">
        <label className="block-config__label">判断条件</label>
        <select
          className="block-config__select"
          value={condition}
          onChange={(e) => handleConditionChange(e.target.value as ConditionOp)}
          data-testid="select-condition"
        >
          <option value="image_exists">图片存在</option>
          <option value="image_not_exists">图片不存在</option>
        </select>
      </div>

      <div className="block-config__field">
        <label className="block-config__label">检测图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={handleImageSelect}
          showUploadButton={true}
          emptyMessage="请选择或上传用于条件判断的图片"
        />
      </div>

      <div className="block-config__branches">
        <p className="block-config__info">
          <strong>真分支：</strong>
          当条件满足时，执行连接到「真」端口的积木块
        </p>
        <p className="block-config__info">
          <strong>假分支：</strong>
          当条件不满足时，执行连接到「假」端口的积木块
        </p>
      </div>
    </div>
  );
}

/**
 * 根据积木块类型渲染配置界面
 */
interface BlockSpecificConfigProps {
  blockType: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function BlockSpecificConfig({ blockType, config, onChange }: BlockSpecificConfigProps) {
  switch (blockType) {
    case 'click':
      return <ClickConfigUI config={config} onChange={onChange} />;
    case 'wait_image':
      return <WaitImageConfigUI config={config} onChange={onChange} />;
    case 'wait_time':
      return <WaitTimeConfigUI config={config} onChange={onChange} />;
    case 'input_text':
      return <InputTextConfigUI config={config} onChange={onChange} />;
    case 'loop':
      return <LoopConfigUI config={config} onChange={onChange} />;
    case 'loop_infinite':
      return <LoopInfiniteConfigUI />;
    case 'condition':
      return <ConditionConfigUI config={config} onChange={onChange} />;
    default:
      return (
        <div className="block-config__section">
          <p className="block-config__info">未知积木块类型: {blockType}</p>
        </div>
      );
  }
}

/**
 * BlockConfig 组件 - 积木块配置面板
 */
export function BlockConfig({
  blockId,
  blockType,
  config = {},
  onSave,
  onCancel,
}: BlockConfigProps) {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(() => ({ ...config }));

  const handleConfigChange = useCallback((newConfig: Record<string, unknown>) => {
    setLocalConfig(newConfig);
  }, []);

  const handleSave = useCallback(() => {
    // 构建符合 BlockConfig 类型的配置对象
    let finalConfig: BlockConfigType;
    
    // 根据类型构建正确的配置对象
    switch (blockType) {
      case 'click':
        finalConfig = {
          type: 'click',
          mode: localConfig.mode as ClickMode,
          count: (localConfig.count as number) ?? 1,
        };
        break;
      case 'wait_image':
        finalConfig = {
          type: 'wait_image',
          imageId: localConfig.imageId as string,
          timeoutMs: (localConfig.timeoutMs as number) ?? 5000,
        };
        break;
      case 'wait_time':
        finalConfig = {
          type: 'wait_time',
          durationMs: (localConfig.durationMs as number) ?? 1000,
        };
        break;
      case 'input_text':
        finalConfig = {
          type: 'input_text',
          text: (localConfig.text as string) ?? '',
          intervalMs: (localConfig.intervalMs as number) ?? 50,
        };
        break;
      case 'loop':
        finalConfig = {
          type: 'loop',
          count: (localConfig.count as number) ?? 1,
        };
        break;
      case 'loop_infinite':
        finalConfig = {
          type: 'loop_infinite',
        };
        break;
      case 'condition':
        finalConfig = {
          type: 'condition',
          imageId: localConfig.imageId as string,
          condition: (localConfig.condition as ConditionOp) ?? 'image_exists',
          trueBranch: (localConfig.trueBranch as string[]) ?? [],
          falseBranch: (localConfig.falseBranch as string[]) ?? [],
        };
        break;
      default:
        finalConfig = {
          type: 'wait_time',
          durationMs: 1000,
        };
    }
    
    onSave?.(finalConfig as unknown as Record<string, unknown>);
  }, [blockType, localConfig, onSave]);

  const handleCancel = useCallback(() => {
    setLocalConfig({ ...config });
    onCancel?.();
  }, [config, onCancel]);

  // 验证配置是否有效
  const isValid = useMemo(() => {
    switch (blockType) {
      case 'click': {
        const mode = localConfig.mode as ClickMode | undefined;
        if (!mode) return false;
        if (mode.mode === 'coordinates') {
          return typeof (mode as { x: number; y: number }).x === 'number' && 
                 typeof (mode as { x: number; y: number }).y === 'number';
        }
        if (mode.mode === 'image') {
          return !!(mode as { imageId: string }).imageId;
        }
        return false;
      }
      case 'wait_image':
        return !!localConfig.imageId;
      case 'wait_time':
        return typeof localConfig.durationMs === 'number' && localConfig.durationMs >= 0;
      case 'input_text':
        return typeof localConfig.text === 'string' && localConfig.text.length > 0;
      case 'loop':
        return typeof localConfig.count === 'number' && localConfig.count >= 1;
      case 'loop_infinite':
        return true;
      case 'condition':
        return !!localConfig.imageId && !!localConfig.condition;
      default:
        return false;
    }
  }, [blockType, localConfig]);

  return (
    <div className="block-config" data-testid={`block-config-${blockId}`}>
      <div className="block-config__header">
        <h3>配置积木块</h3>
        <span className="block-config__type">{getBlockTypeName(blockType)}</span>
      </div>
      
      <div className="block-config__content">
        <BlockSpecificConfig 
          blockType={blockType} 
          config={localConfig} 
          onChange={handleConfigChange} 
        />
      </div>
      
      <div className="block-config__actions">
        <button
          className="block-config__btn block-config__btn--primary"
          onClick={handleSave}
          disabled={!isValid}
          data-testid="btn-save-config"
        >
          保存
        </button>
        <button
          className="block-config__btn"
          onClick={handleCancel}
          data-testid="btn-cancel-config"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export default BlockConfig;
