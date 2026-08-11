// Slide puzzle captcha API client.
// Adapts to rc-slider-captcha: backend returns bgUrl/puzzleUrl (data URLs),
// the frontend passes them straight to the library.
import axios, { AxiosError } from 'axios';

// ============ Types ============
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

/** Error code -> user-friendly message (English by default, override to localize) */
export const CAPTCHA_ERROR_MESSAGES: Record<string, string> = {
  captcha_not_found: 'Captcha not found, please refresh',
  captcha_expired: 'Captcha expired, please refresh',
  captcha_used: 'Captcha already used, please refresh',
  captcha_position_error: 'Incorrect puzzle position, please drag again',
  captcha_too_fast: 'Drag too fast, please drag again',
  captcha_trajectory_suspicious: 'Suspicious motion, please drag again',
  captcha_rate_limit: 'Too many requests, please try again later',
  captcha_image_gen_failed: 'Captcha image generation failed, please refresh',
  captcha_fail_penalty: 'Too many failures, please try again later',
};

// ============ Factory ============
/**
 * Create a captcha API client.
 * @param apiBaseUrl Backend service URL (e.g. 'http://localhost:8000')
 */
export function createCaptchaApi(apiBaseUrl: string) {
  const apiClient = axios.create({
    baseURL: `${apiBaseUrl}/api`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Response interceptor: unwrap the { code, msg, data } envelope and extract business error fields
  apiClient.interceptors.response.use(
    (response) => {
      // Non-200 business code -> business error
      if (response.data?.code !== 200 && response.data?.code !== undefined) {
        const err = new Error(response.data?.msg || 'Request failed') as Error & {
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
      // Network error / HTTP 4xx 5xx
      const data = error.response?.data as Record<string, unknown> | undefined;
      const err = new Error(
        (typeof data?.msg === 'string' && data.msg) ||
          error.message ||
          'Network error, please try again later'
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
    /** Fetch a captcha challenge: returns bgUrl + puzzleUrl for rc-slider-captcha */
    challenge: async (): Promise<CaptchaChallenge> => {
      const res = await apiClient.get('/captcha/challenge');
      return res.data?.data || res.data;
    },

    /**
     * Verify the drag position.
     * @param id challenge id
     * @param xPosition puzzle offset (rc-slider-captcha onVerify({x})'s x)
     * @param dragDurationMs drag duration in ms, used for trajectory checks
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
