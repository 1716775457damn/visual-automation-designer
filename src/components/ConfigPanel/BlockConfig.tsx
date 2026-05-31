/**
 * BlockConfig - 积木块配置面板容器组件（Phase 4c 拆分）
 * 根据积木块类型分发到 ActionBlockConfig / ControlBlockConfig 子组件。
 *
 * Validates: Requirements 3.5
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  BlockConfig as BlockConfigType,
  ClickMode,
  ConditionOp,
} from '../../types/block';
import {
  ClickConfigUI,
  WaitImageConfigUI,
  WaitTimeConfigUI,
  InputTextConfigUI,
} from './ActionBlockConfig';
import {
import styles from './ConfigPanel.module.css';
  LoopConfigUI,
  LoopInfiniteConfigUI,
  ConditionConfigUI,
} from './ControlBlockConfig';

export interface BlockConfigProps {
  blockId: string;
  blockType: string;
  config?: Record<string, unknown>;
  externalValidationSeverity?: 'error' | 'warning';
  externalValidationMessage?: string | null;
  onSave?: (config: Record<string, unknown>) => void;
  onCancel?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function getBlockTypeName(blockType: string): string {
  const typeNames: Record<string, string> = {
    click: '点击',
    wait_image: '等待图片',
    wait_time: '等待时间',
    input_text: '输入文本',
    loop: '循环',
    loop_infinite: '无限循环',
    condition: '条件判断',
  };
  return typeNames[blockType] || blockType;
}

// ── Block-specific router ──────────────────────────────────────────

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
        <div className={styles.blockConfigSection}>
          <p className={styles.blockConfigInfo}>未知积木块类型: {blockType}</p>
        </div>
      );
  }
}

// ── Main component ─────────────────────────────────────────────────

export function BlockConfig({
  blockId,
  blockType,
  config = {},
  externalValidationSeverity,
  externalValidationMessage,
  onSave,
  onCancel,
}: BlockConfigProps) {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(() => ({ ...config }));
  const [hasChanges, setHasChanges] = useState(false);

  const handleConfigChange = useCallback((newConfig: Record<string, unknown>) => {
    setLocalConfig(newConfig);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    let finalConfig: BlockConfigType;

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
        finalConfig = { type: 'loop', count: (localConfig.count as number) ?? 1 };
        break;
      case 'loop_infinite':
        finalConfig = { type: 'loop_infinite' };
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
        finalConfig = { type: 'wait_time', durationMs: 1000 };
    }

    onSave?.(finalConfig as unknown as Record<string, unknown>);
    setHasChanges(false);
  }, [blockType, localConfig, onSave]);

  const handleCancel = useCallback(() => {
    setLocalConfig({ ...config });
    setHasChanges(false);
    onCancel?.();
  }, [config, onCancel]);

  const isValid = useMemo(() => {
    switch (blockType) {
      case 'click': {
        const mode = localConfig.mode as ClickMode | undefined;
        if (!mode) return false;
        if (mode.mode === 'coordinates') {
          return (
            typeof (mode as { x: number; y: number }).x === 'number' &&
            typeof (mode as { x: number; y: number }).y === 'number'
          );
        }
        if (mode.mode === 'image') return !!(mode as { imageId: string }).imageId;
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

  const validationMessage = useMemo(() => {
    if (isValid) return null;
    switch (blockType) {
      case 'click':
        return '请设置点击坐标或选择图片';
      case 'wait_image':
        return '请选择要等待的图片';
      case 'wait_time':
        return '请输入有效的等待时间';
      case 'input_text':
        return '请输入要模拟的文本';
      case 'loop':
        return '请输入有效的循环次数';
      case 'condition':
        return '请选择条件判断的图片';
      default:
        return '请完成配置';
    }
  }, [blockType, isValid]);

  return (
    <div className={styles.blockConfig} data-testid={`block-config-${blockId}`}>
      <div className={styles.blockConfigHeader}>
        <div className={styles.blockConfigHeaderMain}>
          <h3>配置积木块</h3>
          <span className={styles.blockConfigMeta}>ID: {blockId.slice(0, 8)}</span>
        </div>
        <span className={styles.blockConfigType}>{getBlockTypeName(blockType)}</span>
      </div>

      {externalValidationMessage && (
        <div
          className={`${styles.blockConfigValidationSummary} ${styles[`blockConfigValidationSummary${externalValidationSeverity ?? 'warning'.charAt(0).toUpperCase() + externalValidationSeverity ?? 'warning'.slice(1)}`]}`}
        >
          <strong>{externalValidationSeverity === 'error' ? '结构错误：' : '结构警告：'}</strong>
          <span>{externalValidationMessage}</span>
        </div>
      )}

      {hasChanges && <div className={styles.blockConfigChangesIndicator}>有未保存的更改</div>}

      <div className={styles.blockConfigContent}>
        <div className={styles.blockConfigSummary}>
          <span className={styles.blockConfigSummaryLabel}>当前类型</span>
          <span className={styles.blockConfigSummaryValue}>{getBlockTypeName(blockType)}积木块</span>
        </div>
        <div className={styles.blockConfigSummaryGrid}>
          <div className={styles.blockConfigSummaryCard}>
            <span className={styles.blockConfigSummaryCardLabel}>状态</span>
            <span className={styles.blockConfigSummaryCardValue}>{hasChanges ? '待保存' : '已同步'}</span>
          </div>
          <div className={styles.blockConfigSummaryCard}>
            <span className={styles.blockConfigSummaryCardLabel}>校验</span>
            <span className={styles.blockConfigSummaryCardValue}>{isValid ? '通过' : '待完善'}</span>
          </div>
        </div>
        <BlockSpecificConfig blockType={blockType} config={localConfig} onChange={handleConfigChange} />
      </div>

      <div className={styles.blockConfigActions}>
        <button
          className={`${styles.blockConfigBtn} ${styles.blockConfigBtnPrimary}`}
          onClick={handleSave}
          disabled={!isValid}
          data-testid="btn-save-config"
        >
          ✓ 保存
        </button>
        <button className={styles.blockConfigBtn} onClick={handleCancel} data-testid="btn-cancel-config">
          ✕ 取消
        </button>
      </div>

      {!isValid && validationMessage && (
        <div className={styles.blockConfigValidationError}>{validationMessage}</div>
      )}
    </div>
  );
}

export default BlockConfig;
