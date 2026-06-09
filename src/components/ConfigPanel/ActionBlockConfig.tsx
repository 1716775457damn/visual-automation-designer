/**
 * ActionBlockConfig — 动作类积木配置组件
 * 从 BlockConfig.tsx 提取：click / wait_image / wait_time / input_text / screenshot_assert / text_extract 的配置 UI。
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

// ── Screenshot Assert ──────────────────────────────────────────────

export function ScreenshotAssertConfigUI({ config, onChange }: ConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const threshold = (config.threshold as number) ?? 0.0;
  const strictMode = (config.strictMode as boolean) ?? false;
  const region = config.region as { x: number; y: number; width: number; height: number } | undefined;

  const handleRegionChange = (field: string, value: number) => {
    const currentRegion = region ?? { x: 0, y: 0, width: 0, height: 0 };
    onChange({ ...config, region: { ...currentRegion, [field]: value } });
  };

  return (
    <div className={styles.blockConfigSection} data-testid="screenshot-assert-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>参考图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={(newImageId: string) => onChange({ ...config, imageId: newImageId })}
          showUploadButton={true}
          emptyMessage="请选择或上传参考图片"
        />
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="screenshot-threshold">比对阈值</label>
        <input
          id="screenshot-threshold"
          type="number"
          className={styles.blockConfigInput}
          value={threshold}
          onChange={(e) => onChange({ ...config, threshold: Number(e.target.value) })}
          min={0}
          max={1}
          step={0.05}
          data-testid="input-threshold"
        />
        <span className={styles.blockConfigHint}>0.0 = 完全一致, 1.0 = 完全忽略差异</span>
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>
          <input
            type="checkbox"
            checked={strictMode}
            onChange={(e) => onChange({ ...config, strictMode: e.target.checked })}
            data-testid="checkbox-strict"
          />
          {' '}严格模式
        </label>
        <span className={styles.blockConfigHint}>开启后任何像素差异都将视为失败</span>
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>裁剪区域（可选）</label>
        <div className={styles.blockConfigFieldGroup}>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="screenshot-region-x">X</label>
            <input
              id="screenshot-region-x"
              type="number"
              className={styles.blockConfigInput}
              value={region?.x ?? 0}
              onChange={(e) => handleRegionChange('x', Number(e.target.value))}
              min={0}
              data-testid="input-region-x"
            />
          </div>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="screenshot-region-y">Y</label>
            <input
              id="screenshot-region-y"
              type="number"
              className={styles.blockConfigInput}
              value={region?.y ?? 0}
              onChange={(e) => handleRegionChange('y', Number(e.target.value))}
              min={0}
              data-testid="input-region-y"
            />
          </div>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="screenshot-region-w">宽度</label>
            <input
              id="screenshot-region-w"
              type="number"
              className={styles.blockConfigInput}
              value={region?.width ?? 0}
              onChange={(e) => handleRegionChange('width', Number(e.target.value))}
              min={0}
              data-testid="input-region-w"
            />
          </div>
          <div className={styles.blockConfigField}>
            <label className={styles.blockConfigLabel} htmlFor="screenshot-region-h">高度</label>
            <input
              id="screenshot-region-h"
              type="number"
              className={styles.blockConfigInput}
              value={region?.height ?? 0}
              onChange={(e) => handleRegionChange('height', Number(e.target.value))}
              min={0}
              data-testid="input-region-h"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Text Extract ───────────────────────────────────────────────────

export function TextExtractConfigUI({ config, onChange }: ConfigUIProps) {
  const imageId = (config.imageId as string) || '';
  const language = (config.language as string) || 'chi_sim';

  return (
    <div className={styles.blockConfigSection} data-testid="text-extract-config">
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel}>提取区域图片</label>
        <ImageSelector
          selectedId={imageId}
          onSelect={(newImageId: string) => onChange({ ...config, imageId: newImageId })}
          showUploadButton={true}
          emptyMessage="选择要提取文字的图片区域（可选，留空则全屏提取）"
        />
      </div>
      <div className={styles.blockConfigField}>
        <label className={styles.blockConfigLabel} htmlFor="text-extract-lang">识别语言</label>
        <select
          id="text-extract-lang"
          className={styles.blockConfigSelect}
          value={language}
          onChange={(e) => onChange({ ...config, language: e.target.value })}
          data-testid="select-language"
        >
          <option value="chi_sim">简体中文</option>
          <option value="chi_tra">繁体中文</option>
          <option value="eng">英语</option>
          <option value="jpn">日语</option>
          <option value="kor">韩语</option>
        </select>
        <span className={styles.blockConfigHint}>选择 OCR 识别语言</span>
      </div>
    </div>
  );
}
