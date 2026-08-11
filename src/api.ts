// 滑动拼图验证码 API 客户端
// 适配 rc-slider-captcha 库: 后端返回 bgUrl/puzzleUrl (data URL), 前端直接传给库
import axios, { AxiosError } from 'axios';

// ============ 类型 ============
export interface CaptchaChallenge {
  id: string;
  bgUrl: string;
  puzzleUrl: string;
  expires_in: number;
}

export interface CaptchaVerifyResponse {
  success: boolean;
  token?: string;
  expires_in?: number;
}

export interface CaptchaVerifyError {
  code: number;
  msg: string;
  error_id:
    | 'captcha_not_found'
    | 'captcha_expired'
    | 'captcha_used'
    | 'captcha_position_error'
    | 'captcha_too_fast'
    | 'captcha_trajectory_suspicious'
    | 'captcha_rate_limit'
    | 'captcha_image_gen_failed'
    | 'captcha_fail_penalty'
    | string;
}

/** 错误码 -> 用户友好提示 */
export const CAPTCHA_ERROR_MESSAGES: Record<string, string> = {
  captcha_not_found: '验证码不存在, 请刷新重试',
  captcha_expired: '验证码已过期, 请刷新重试',
  captcha_used: '验证码已被使用, 请刷新重试',
  captcha_position_error: '拼图位置不正确, 请重新拖动',
  captcha_too_fast: '拖动过快, 请重新拖动',
  captcha_trajectory_suspicious: '操作异常, 请重新拖动',
  captcha_rate_limit: '操作过于频繁, 请稍后再试',
  captcha_image_gen_failed: '验证码图像生成失败, 请刷新重试',
  captcha_fail_penalty: '操作过于频繁, 请稍后再试',
};

// ============ 工厂函数 ============
/**
 * 创建验证码 API 客户端
 * @param apiBaseUrl 后端服务地址 (如 'http://localhost:8000')
 */
export function createCaptchaApi(apiBaseUrl: string) {
  const apiClient = axios.create({
    baseURL: `${apiBaseUrl}/api`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // 响应拦截: 解包 envelope { code, msg, data } 并提取业务错误字段
  apiClient.interceptors.response.use(
    (response) => {
      // 业务码非 200, 视为业务错误
      if (response.data?.code !== 200 && response.data?.code !== undefined) {
        const err = new Error(response.data?.msg || '请求失败') as Error & {
          code?: number;
          msg?: string;
          errorId?: string;
        };
        err.code = response.data?.code;
        err.msg = response.data?.msg;
        err.errorId = response.data?.error_id;
        return Promise.reject(err);
      }
      return response;
    },
    (error: AxiosError) => {
      // 网络错误 / HTTP 4xx 5xx
      const data = error.response?.data as Record<string, unknown> | undefined;
      const err = new Error(
        (typeof data?.msg === 'string' && data.msg) ||
          error.message ||
          '网络异常, 请稍后重试'
      ) as Error & {
        code?: number;
        msg?: string;
        errorId?: string;
        status?: number;
      };
      err.code = typeof data?.code === 'number' ? data.code : error.response?.status;
      err.msg = typeof data?.msg === 'string' ? data.msg : err.message;
      err.errorId = typeof data?.error_id === 'string' ? data.error_id : undefined;
      err.status = error.response?.status;
      return Promise.reject(err);
    }
  );

  return {
    /** 获取验证码挑战: 含 bgUrl + puzzleUrl, 给 rc-slider-captcha 用 */
    challenge: async (): Promise<CaptchaChallenge> => {
      const res = await apiClient.get('/captcha/challenge');
      return res.data?.data || res.data;
    },

    /**
     * 校验拖动位置
     * @param id challenge id
     * @param xPosition puzzle 移动距离 (rc-slider-captcha onVerify({x}) 的 x)
     * @param dragDurationMs 拖动耗时 (ms), 用于轨迹校验
     */
    verify: async (
      id: string,
      xPosition: number,
      dragDurationMs: number = 0,
    ): Promise<CaptchaVerifyResponse> => {
      const res = await apiClient.post('/captcha/verify', {
        id,
        x_position: xPosition,
        drag_duration_ms: dragDurationMs,
      });
      return res.data?.data || res.data;
    },
  };
}

export type CaptchaApi = ReturnType<typeof createCaptchaApi>;
