/**
 * 前端错误处理模块
 * 
 * 定义错误类型枚举、错误响应接口和错误转换函数，
 * 用于统一处理后端返回的错误信息。
 * 
 * Validates: Requirements 5.4
 */

// ============================================================================
// 错误码枚举
// ============================================================================

/**
 * 错误码枚举
 * 与后端 src-tauri/src/error.rs 中的 AppError::code() 保持一致
 */
export enum ErrorCode {
  // 流程相关错误
  FLOW_NOT_FOUND = 'FLOW_NOT_FOUND',
  INVALID_FLOW = 'INVALID_FLOW',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // 积木块相关错误
  BLOCK_NOT_FOUND = 'BLOCK_NOT_FOUND',

  // 图片相关错误
  IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND',
  IMAGE_ERROR = 'IMAGE_ERROR',

  // 执行相关错误
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  // IO 和序列化错误
  IO_ERROR = 'IO_ERROR',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',

  // 平台相关错误
  PLATFORM_ERROR = 'PLATFORM_ERROR',

  // 内部错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // 未知错误（前端兜底）
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// 错误响应接口
// ============================================================================

/**
 * 错误响应接口
 * 与后端 ErrorResponse 结构体对应
 */
export interface ErrorResponse {
  /** 错误码 */
  code: string;
  /** 错误消息 */
  message: string;
}

/**
 * 扩展错误响应接口
 * 包含额外的错误详情
 */
export interface ExtendedErrorResponse extends ErrorResponse {
  /** 额外的错误详情 */
  details?: unknown;
}

// ============================================================================
// 用户友好的错误信息
// ============================================================================

/**
 * 用户可执行的操作类型
 */
export type UserErrorAction =
  | 'return_to_list'    // 返回列表页
  | 'retry_or_skip'     // 重试或跳过
  | 'check_flow'        // 检查流程配置
  | 'check_image'       // 检查图片资源
  | 'contact_support'   // 联系支持
  | 'retry'             // 重试操作
  | 'unknown';          // 未知操作

/**
 * 用户友好的错误信息
 * 用于在 UI 中显示给用户
 */
export interface UserFriendlyError {
  /** 错误标题 */
  title: string;
  /** 错误描述 */
  message: string;
  /** 建议用户采取的操作 */
  action: UserErrorAction;
  /** 原始错误响应（可选，用于调试） */
  originalError?: ErrorResponse;
}

// ============================================================================
// 错误转换函数
// ============================================================================

/**
 * 将 Tauri 错误响应转换为用户友好的错误信息
 * 
 * @param error - 来自 Tauri 后端的错误响应
 * @returns 用户友好的错误信息
 * 
 * @example
 * ```typescript
 * try {
 *   await loadFlow(flowId);
 * } catch (error) {
 *   const userError = handleTauriError(error as ErrorResponse);
 *   showErrorDialog(userError);
 * }
 * ```
 */
export function handleTauriError(error: ErrorResponse): UserFriendlyError {
  const code = Object.values(ErrorCode).includes(error.code as ErrorCode)
    ? (error.code as ErrorCode)
    : ErrorCode.UNKNOWN_ERROR;

  switch (code) {
    case ErrorCode.FLOW_NOT_FOUND:
      return {
        title: '流程未找到',
        message: '请求的流程文件不存在或已被删除',
        action: 'return_to_list',
        originalError: error,
      };

    case ErrorCode.INVALID_FLOW:
      return {
        title: '流程无效',
        message: `流程数据格式不正确：${error.message}`,
        action: 'check_flow',
        originalError: error,
      };

    case ErrorCode.VALIDATION_ERROR:
      return {
        title: '流程验证失败',
        message: `流程配置存在问题：${error.message}`,
        action: 'check_flow',
        originalError: error,
      };

    case ErrorCode.BLOCK_NOT_FOUND:
      return {
        title: '积木块未找到',
        message: '流程中的积木块不存在，请检查流程配置',
        action: 'check_flow',
        originalError: error,
      };

    case ErrorCode.IMAGE_NOT_FOUND:
      return {
        title: '图片未找到',
        message: '指定的图片不存在于图片库中，请检查图片资源',
        action: 'check_image',
        originalError: error,
      };

    case ErrorCode.IMAGE_ERROR:
      return {
        title: '图片处理失败',
        message: `处理图片时发生错误：${error.message}`,
        action: 'check_image',
        originalError: error,
      };

    case ErrorCode.EXECUTION_FAILED:
      return {
        title: '执行失败',
        message: `流程执行过程中发生错误：${error.message}`,
        action: 'retry_or_skip',
        originalError: error,
      };

    case ErrorCode.IO_ERROR:
      return {
        title: '文件操作失败',
        message: '无法读取或写入文件，请检查文件权限',
        action: 'retry',
        originalError: error,
      };

    case ErrorCode.SERIALIZATION_ERROR:
      return {
        title: '数据格式错误',
        message: '无法解析数据文件，文件可能已损坏',
        action: 'contact_support',
        originalError: error,
      };

    case ErrorCode.PLATFORM_ERROR:
      return {
        title: '系统操作失败',
        message: `无法执行系统操作：${error.message}`,
        action: 'contact_support',
        originalError: error,
      };

    case ErrorCode.INTERNAL_ERROR:
      return {
        title: '内部错误',
        message: '应用程序发生内部错误，请尝试重启应用',
        action: 'contact_support',
        originalError: error,
      };

    case ErrorCode.UNKNOWN_ERROR:
    default:
      return {
        title: '发生错误',
        message: error.message || '发生未知错误',
        action: 'unknown',
        originalError: error,
      };
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 判断错误码是否为可重试的错误
 * 
 * @param code - 错误码
 * @returns 是否可重试
 */
export function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes: ErrorCode[] = [
    ErrorCode.IO_ERROR,
    ErrorCode.EXECUTION_FAILED,
    ErrorCode.PLATFORM_ERROR,
  ];
  return retryableCodes.includes(code);
}

/**
 * 判断错误码是否为资源未找到类型的错误
 * 
 * @param code - 错误码
 * @returns 是否为资源未找到错误
 */
export function isNotFoundError(code: ErrorCode): boolean {
  const notFoundCodes: ErrorCode[] = [
    ErrorCode.FLOW_NOT_FOUND,
    ErrorCode.BLOCK_NOT_FOUND,
    ErrorCode.IMAGE_NOT_FOUND,
  ];
  return notFoundCodes.includes(code);
}

/**
 * 创建默认的错误响应对象
 * 用于处理非标准错误格式
 * 
 * @param message - 错误消息
 * @returns 标准化的错误响应
 */
export function createErrorResponse(message: string): ErrorResponse {
  return {
    code: ErrorCode.UNKNOWN_ERROR,
    message,
  };
}

/**
 * 从未知错误中提取 ErrorResponse
 * 处理各种可能的错误格式
 * 
 * @param error - 未知错误对象
 * @returns 标准化的错误响应
 */
export function extractErrorResponse(error: unknown): ErrorResponse {
  if (typeof error === 'string') {
    return createErrorResponse(error);
  }

  if (error instanceof Error) {
    return createErrorResponse(error.message);
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.code === 'string' && typeof obj.message === 'string') {
      return {
        code: obj.code,
        message: obj.message,
      };
    }
  }

  return createErrorResponse('发生未知错误');
}

/**
 * 异步错误包装器
 * 自动捕获 Promise 错误并转换为 UserFriendlyError
 * 
 * @param promise - 要执行的 Promise
 * @returns [错误, 数据] 元组
 * 
 * @example
 * ```typescript
 * const [error, flow] = await wrapError(loadFlow(flowId));
 * if (error) {
 *   showErrorDialog(error);
 *   return;
 * }
 * // 使用 flow
 * ```
 */
export async function wrapError<T>(
  promise: Promise<T>
): Promise<[UserFriendlyError | null, T | null]> {
  try {
    const data = await promise;
    return [null, data];
  } catch (error) {
    const errorResponse = extractErrorResponse(error);
    const userError = handleTauriError(errorResponse);
    return [userError, null];
  }
}
