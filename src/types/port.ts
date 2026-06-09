/**
 * 端口系统类型定义
 * 对应后端 src-tauri/src/models/port.rs
 *
 * 端口系统定义每个积木块节点的输入/输出端口规范，
 * 前端据此渲染端口手柄、校验连接兼容性。
 *
 * Validates: Phase A — Port System
 */

/**
 * 端口方向
 */
export type PortDirection = 'input' | 'output';

/**
 * 端口数据类型
 */
export type PortType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'image_ref'
  | 'coordinate'
  | 'any';

/**
 * 单个端口模式定义
 */
export interface PortSchema {
  /** 端口标识符（在节点类型内唯一） */
  name: string;
  /** UI 显示标签 */
  label: string;
  /** 数据类型 */
  portType: PortType;
  /** 方向 */
  direction: PortDirection;
  /** 描述 */
  description: string;
  /** 是否必须连接/产生值 */
  required: boolean;
  /** 可选的默认值 */
  default?: unknown;
}

/**
 * 端口兼容性检查
 */
export function isPortCompatible(source: PortSchema, target: PortSchema): boolean {
  if (source.direction !== 'output' || target.direction !== 'input') {
    return false;
  }
  if (source.portType === 'any' || target.portType === 'any') {
    return true;
  }
  return source.portType === target.portType;
}

/**
 * 节点类型的端口定义集合
 */
export interface PortDefinitions {
  /** 积木块类型标识 */
  blockType: string;
  /** 输入端口 */
  inputs: PortSchema[];
  /** 输出端口 */
  outputs: PortSchema[];
}

/**
 * 运行时端口值
 */
export type PortValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'imageRef'; value: string }
  | { type: 'coordinate'; value: { x: number; y: number } }
  | { type: 'array'; value: PortValue[] }
  | { type: 'null' };

// ── 所有节点类型的端口定义 ────────────────────────────────

/** 获取所有已知端口定义 */
export function getAllPortDefinitions(): PortDefinitions[] {
  return [
    clickPorts(),
    waitImagePorts(),
    waitTimePorts(),
    inputTextPorts(),
    screenshotPorts(),
    loopPorts(),
    loopInfinitePorts(),
    conditionPorts(),
    textExtractPorts(),
    textCheckPorts(),
    screenshotAssertPorts(),
  ];
}

/** 查找特定节点类型的端口定义 */
export function getPortDefinitions(blockType: string): PortDefinitions | undefined {
  return getAllPortDefinitions().find((p) => p.blockType === blockType);
}

function clickPorts(): PortDefinitions {
  return {
    blockType: 'click',
    inputs: [
      {
        name: 'imageRef',
        label: '目标图片',
        portType: 'image_ref',
        direction: 'input',
        description: '点击目标的参考图片（与坐标模式二选一）',
        required: false,
      },
      {
        name: 'coordinates',
        label: '屏幕坐标',
        portType: 'coordinate',
        direction: 'input',
        description: '精确点击坐标（与图片模式二选一）',
        required: false,
      },
      {
        name: 'count',
        label: '点击次数',
        portType: 'number',
        direction: 'input',
        description: '点击次数，默认为 1',
        required: false,
        default: 1,
      },
    ],
    outputs: [
      {
        name: 'result',
        label: '点击结果',
        portType: 'any',
        direction: 'output',
        description: '包含执行状态和实际点击坐标',
        required: false,
      },
    ],
  };
}

function waitImagePorts(): PortDefinitions {
  return {
    blockType: 'wait_image',
    inputs: [
      {
        name: 'imageRef',
        label: '目标图片',
        portType: 'image_ref',
        direction: 'input',
        description: '等待出现的参考图片',
        required: true,
      },
      {
        name: 'timeout',
        label: '超时(ms)',
        portType: 'number',
        direction: 'input',
        description: '最长等待时间（毫秒），默认 5000',
        required: false,
        default: 5000,
      },
      {
        name: 'region',
        label: '搜索区域',
        portType: 'any',
        direction: 'input',
        description: '限制搜索区域 {x, y, width, height}，默认全屏',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'found',
        label: '是否找到',
        portType: 'boolean',
        direction: 'output',
        description: 'true=图片出现，false=超时未出现',
        required: true,
      },
      {
        name: 'matchPosition',
        label: '匹配位置',
        portType: 'coordinate',
        direction: 'output',
        description: '图片匹配到的屏幕坐标',
        required: false,
      },
    ],
  };
}

function waitTimePorts(): PortDefinitions {
  return {
    blockType: 'wait_time',
    inputs: [
      {
        name: 'durationMs',
        label: '等待时长(ms)',
        portType: 'number',
        direction: 'input',
        description: '等待的毫秒数',
        required: true,
        default: 1000,
      },
    ],
    outputs: [],
  };
}

function inputTextPorts(): PortDefinitions {
  return {
    blockType: 'input_text',
    inputs: [
      {
        name: 'text',
        label: '输入文本',
        portType: 'string',
        direction: 'input',
        description: '要输入的文本内容',
        required: true,
      },
      {
        name: 'intervalMs',
        label: '按键间隔(ms)',
        portType: 'number',
        direction: 'input',
        description: '每个字符之间的输入间隔',
        required: false,
        default: 0,
      },
    ],
    outputs: [
      {
        name: 'result',
        label: '输入结果',
        portType: 'any',
        direction: 'output',
        description: '输入操作执行结果',
        required: false,
      },
    ],
  };
}

function screenshotPorts(): PortDefinitions {
  return {
    blockType: 'screenshot',
    inputs: [
      {
        name: 'region',
        label: '截取区域',
        portType: 'any',
        direction: 'input',
        description: '截取区域 {x, y, width, height}，默认全屏',
        required: false,
      },
      {
        name: 'name',
        label: '截图名称',
        portType: 'string',
        direction: 'input',
        description: '保存截图的文件名标识',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'screenshotRef',
        label: '截图引用',
        portType: 'image_ref',
        direction: 'output',
        description: '截图的引用标识，可供后续节点使用',
        required: true,
      },
    ],
  };
}

function loopPorts(): PortDefinitions {
  return {
    blockType: 'loop',
    inputs: [
      {
        name: 'count',
        label: '循环次数',
        portType: 'number',
        direction: 'input',
        description: '循环执行的次数',
        required: true,
      },
    ],
    outputs: [
      {
        name: 'iterationIndex',
        label: '当前轮次',
        portType: 'number',
        direction: 'output',
        description: '当前执行的轮次（从 0 开始）',
        required: true,
      },
    ],
  };
}

function loopInfinitePorts(): PortDefinitions {
  return {
    blockType: 'loop_infinite',
    inputs: [],
    outputs: [
      {
        name: 'iterationIndex',
        label: '当前轮次',
        portType: 'number',
        direction: 'output',
        description: '当前执行的轮次（从 0 开始）',
        required: true,
      },
    ],
  };
}

function textExtractPorts(): PortDefinitions {
  return {
    blockType: 'text_extract',
    inputs: [
      {
        name: 'imageRef',
        label: '目标图片',
        portType: 'image_ref',
        direction: 'input',
        description: '要识别文字的图片区域（可选，默认全屏）',
        required: false,
      },
      {
        name: 'language',
        label: '语言代码',
        portType: 'string',
        direction: 'input',
        description: 'OCR 语言代码（如 zh-CN、en），留空则自动检测',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'text',
        label: '识别文字',
        portType: 'string',
        direction: 'output',
        description: 'OCR 识别出的文字内容',
        required: true,
      },
    ],
  };
}

function screenshotAssertPorts(): PortDefinitions {
  return {
    blockType: 'screenshot_assert',
    inputs: [
      {
        name: 'imageRef',
        label: '参考图片',
        portType: 'image_ref',
        direction: 'input',
        description: '要比对的参考图片',
        required: true,
      },
      {
        name: 'threshold',
        label: '差异阈值',
        portType: 'number',
        direction: 'input',
        description: '允许的差异比例 0.0~1.0（0=完全一致，1=忽略全部差异）',
        required: false,
        default: 0.0,
      },
      {
        name: 'region',
        label: '比对区域',
        portType: 'any',
        direction: 'input',
        description: '限制比对区域 {x, y, width, height}，默认全屏',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'passed',
        label: '是否通过',
        portType: 'boolean',
        direction: 'output',
        description: 'true=图片一致（差异在阈值内），false=差异超阈值',
        required: true,
      },
      {
        name: 'diffImageRef',
        label: '差异图引用',
        portType: 'image_ref',
        direction: 'output',
        description: '差异热力图的引用标识，仅在差异 > 0 时有值',
        required: false,
      },
      {
        name: 'diffPercentage',
        label: '差异比例',
        portType: 'number',
        direction: 'output',
        description: '实际像素差异比例 0.0~1.0',
        required: true,
      },
    ],
  };
}

function textCheckPorts(): PortDefinitions {
  return {
    blockType: 'text_check',
    inputs: [
      {
        name: 'imageRef',
        label: '目标图片',
        portType: 'image_ref',
        direction: 'input',
        description: '要检测文字的图片区域',
        required: true,
      },
      {
        name: 'keyword',
        label: '关键字',
        portType: 'string',
        direction: 'input',
        description: '要搜索的关键字（不区分大小写，部分匹配）',
        required: true,
      },
    ],
    outputs: [
      {
        name: 'true',
        label: '真分支',
        portType: 'any',
        direction: 'output',
        description: '关键字存在时执行的分支',
        required: true,
      },
      {
        name: 'false',
        label: '假分支',
        portType: 'any',
        direction: 'output',
        description: '关键字不存在时执行的分支',
        required: true,
      },
    ],
  };
}

function conditionPorts(): PortDefinitions {
  return {
    blockType: 'condition',
    inputs: [
      {
        name: 'imageRef',
        label: '判断图片',
        portType: 'image_ref',
        direction: 'input',
        description: '要判断是否出现的参考图片',
        required: true,
      },
      {
        name: 'operator',
        label: '判断方式',
        portType: 'string',
        direction: 'input',
        description: 'image_exists=图片存在, image_not_exists=图片不存在',
        required: false,
        default: 'image_exists',
      },
    ],
    outputs: [
      {
        name: 'true',
        label: '真分支',
        portType: 'any',
        direction: 'output',
        description: '条件成立时执行的分支',
        required: true,
      },
      {
        name: 'false',
        label: '假分支',
        portType: 'any',
        direction: 'output',
        description: '条件不成立时执行的分支',
        required: true,
      },
    ],
  };
}
