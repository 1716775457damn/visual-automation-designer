/**
 * ActionBlockConfig — 动作类积木配置组件
 * 从 BlockConfig.tsx 提取：click / wait_image / wait_time / input_text 的配置 UI。
 */

import type { ClickMode } from '../../types/block';
import { ImageSelector } from './ImageSelector';
import styles from './ConfigPanel.module.css';

interface ConfigUIProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

// ── Click ──────────────────────────────────────────────────────────

export function ClickConfigUI({ config, onChange }: ConfigUIProps) {
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
      onChange({ ...config, mode: { ...currentMode, [field]: value } });
    }
  };

  const handleImageSelect = (imageId: string) => {
    const currentMode = mode as { mode: 'image'; imageId: string };
    if (currentMode.mode === 'image') {
      onChange({ ...config, mode: { ...currentMode, imageId } });
    }
  };

  return (
    <div className={styles.blockConfigSection} data-testid="click-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>点击模式</label>
        <div className={styles.blockConfigModeSelector}>
          <button
            className={`${styles.blockConfigModeBtn} ${mode.mode === 'coordinates' ? styles.active : ''}`}
            onClick={() => handleModeChange('coordinates')}
            data-testid="mode-coordinates"
          >
            坐标模式
          </button>
          <button
            className={`${styles.blockConfigModeBtn} ${mode.mode === 'image' ? styles.active : ''}`}
            onClick={() => handleModeChange('image')}
            data-testid="mode-image"
          >
            图片模式
          </button>
        </div>
      </div>

      {mode.mode === 'coordinates' && (
        <div className={styles.blockConfigFieldGroup}>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="click-x">X 坐标</label>
            <input
              id="click-x"
              type="number"
              className={styles.blockConfigInput}
              value={(mode as { mode: 'coordinates'; x: number; y: number }).x}
              onChange={(e) => handleCoordinateChange('x', Number(e.target.value))}
              min={0}
              data-testid="input-x"
              aria-required="true"
            />
          </div>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="click-y">Y 坐标</label>
            <input
              id="click-y"
              type="number"
              className={styles.blockConfigInput}
              value={(mode as { mode: 'coordinates'; x: number; y: number }).y}
              onChange={(e) => handleCoordinateChange('y', Number(e.target.value))}
              min={0}
              data-testid="input-y"
              aria-required="true"
            />
          </div>
        </div>
      )}

      {mode.mode === 'image' && (
        <div className={styles.blockConfigField}>
          <label className={styles.blockConfigLabel}>选择图片</label>
          <ImageSelector
            selectedId={(mode as { mode: 'image'; imageId: string }).imageId}
            onSelect={handleImageSelect}
            showUploadButton={true}
            emptyMessage="请选择或上传图片"
          />
        </div>
      )}

      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="click-count">点击次数</label>
        <input
          id="click-count"
          type="number"
          className={styles.blockConfigInput}
          value={count}
          onChange={(e) => onChange({ ...config, count: Number(e.target.value) })}
          min={1}
          max={3}
          data-testid="input-count"
          aria-required="true"
        />
      </div>
    </div>
  );
}

// ── Wait Image ─────────────────────────────────────────────────────

export function WaitImageConfigUI({ config, onChange }: ConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const timeoutMs = (config.timeoutMs as number) ?? 5000;

  return (
    <div className={styles.blockConfigSection} data-testid="wait-image-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>等待图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={(newImageId: string) => onChange({ ...config, imageId: newImageId })}
          showUploadButton={true}
          emptyMessage="请选择或上传要等待的图片"
        />
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="waitimage-timeout">超时时间 (毫秒)</label>
        <input
          id="waitimage-timeout"
          type="number"
          className={styles.blockConfigInput}
          value={timeoutMs}
          onChange={(e) => onChange({ ...config, timeoutMs: Number(e.target.value) })}
          min={100}
          step={100}
          data-testid="input-timeout"
        />
        <span className={styles.blockConfigHint}>默认 5000 毫秒</span>
      </div>
    </div>
  );
}

// ── Wait Time ──────────────────────────────────────────────────────

export function WaitTimeConfigUI({ config, onChange }: ConfigUIProps) {
  const durationMs = (config.durationMs as number) ?? 1000;

  return (
    <div className={styles.blockConfigSection} data-testid="wait-time-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="waittime-duration">等待时间 (毫秒)</label>
        <input
          id="waittime-duration"
          type="number"
          className={styles.blockConfigInput}
          value={durationMs}
          onChange={(e) => onChange({ ...config, durationMs: Number(e.target.value) })}
          min={0}
          step={100}
          data-testid="input-duration"
        />
        <span className={styles.blockConfigHint}>1000 毫秒 = 1 秒</span>
      </div>
    </div>
  );
}

// ── Input Text ─────────────────────────────────────────────────────

export function InputTextConfigUI({ config, onChange }: ConfigUIProps) {
  const text = (config.text as string) || '';
  const intervalMs = (config.intervalMs as number) ?? 50;

  return (
    <div className={styles.blockConfigSection} data-testid="input-text-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="inputtext-text">输入文本</label>
        <textarea
          id="inputtext-text"
          className={styles.blockConfigTextarea}
          value={text}
          onChange={(e) => onChange({ ...config, text: e.target.value })}
          placeholder="输入要模拟输入的文本内容"
          rows={3}
          data-testid="input-text"
          aria-required="true"
        />
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="inputtext-interval">输入间隔 (毫秒)</label>
        <input
          id="inputtext-interval"
          type="number"
          className={styles.blockConfigInput}
          value={intervalMs}
          onChange={(e) => onChange({ ...config, intervalMs: Number(e.target.value) })}
          min={0}
          max={1000}
          step={10}
          data-testid="input-interval"
        />
        <span className={styles.blockConfigHint}>字符之间的输入间隔，默认 50 毫秒</span>
      </div>
    </div>
  );
}
