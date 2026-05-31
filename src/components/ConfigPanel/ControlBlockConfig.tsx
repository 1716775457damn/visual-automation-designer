/**
 * ControlBlockConfig — 控制流积木配置组件
 * 从 BlockConfig.tsx 提取：loop / loop_infinite / condition 的配置 UI。
 */

import type { ConditionOp } from '../../types/block';
import { ImageSelector } from './ImageSelector';

interface ConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

// ── Loop ───────────────────────────────────────────────────────────

export function LoopConfigUI({ config, onChange }: ConfigUIProps) {
  const count = (config.count as number) ?? 1;

  return (
    <div className="block-config__section" data-testid="loop-config">
      <div className="block-config__field">
        <label className="block-config__label" htmlFor="loop-count">循环次数</label>
        <input
          id="loop-count"
          type="number"
          className="block-config__input"
          value={count}
          onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}
          min={1}
          data-testid="input-loop-count"
          aria-required="true"
        />
      </div>
      <p className="block-config__info">
        将子积木块拖入此循环块内部来定义循环内容
      </p>
    </div>
  );
}

// ── Loop Infinite ──────────────────────────────────────────────────

export function LoopInfiniteConfigUI() {
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

// ── Condition ──────────────────────────────────────────────────────

export function ConditionConfigUI({ config, onChange }: ConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const condition = (config.condition as ConditionOp) || 'image_exists';

  return (
    <div className="block-config__section" data-testid="condition-config">
      <div className="block-config__field">
        <label className="block-config__label" htmlFor="condition-op">判断条件</label>
        <select
          id="condition-op"
          className="block-config__select"
          value={condition}
          onChange={(e) => onChange({ ...config, condition: e.target.value as ConditionOp })}
          data-testid="select-condition"
          aria-required="true"
        >
          <option value="image_exists">图片存在</option>
          <option value="image_not_exists">图片不存在</option>
        </select>
      </div>

      <div className="block-config__field">
        <label className="block-config__label">检测图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={(newImageId: string) => onChange({ ...config, imageId: newImageId })}
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
