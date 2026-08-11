/**
 * 滑动拼图验证码弹窗
 *
 * 通用 React 组件, 不依赖任何特定框架 (Next.js / Vite / CRA 等均可使用)。
 * 需配合 styles.css 使用: import 'ray-slide-captcha/styles.css'
 *
 * 防刷机制:
 *   - 后端: 预生成池 (50 个备用) + 失败惩罚 (连续 6 次 → 冷却 5s) + IP 限流
 *   - 前端: 刷新冷却 (3s) + 请求去重 + 错误冷却 (2s)
 *
 * 依赖:
 *   - rc-slider-captcha (npm i rc-slider-captcha)
 *   - lucide-react      (npm i lucide-react)
 *   - axios / clsx      (已内置)
 *
 * 使用:
 *   import { CaptchaModal } from 'ray-slide-captcha';
 *   import 'ray-slide-captcha/styles.css';
 *
 *   <CaptchaModal
 *     open={open}
 *     onOpenChange={setOpen}
 *     apiBaseUrl="http://localhost:8000"
 *     onSuccess={(token) => { console.log('verified token:', token); }}
 *   />
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, X, AlertCircle, RotateCcw } from 'lucide-react';
import SliderCaptcha, { type ActionType } from 'rc-slider-captcha';
import { createCaptchaApi, CAPTCHA_ERROR_MESSAGES } from './api';

export interface CaptchaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 后端服务地址 (如 'http://localhost:8000') */
  apiBaseUrl: string;
  onSuccess: (token: string) => void;
  onError?: (error: string) => void;
  title?: string;
  description?: string;
}

// 冷却时间常量
const REFRESH_COOLDOWN_MS = 3000;  // 刷新按钮冷却 3s
const ERROR_COOLDOWN_MS = 2000;    // 错误后重试冷却 2s

export default function CaptchaModal({
  open,
  onOpenChange,
  apiBaseUrl,
  onSuccess,
  onError,
  title = '请完成安全验证',
  description = '拖动滑块完成拼图',
}: CaptchaModalProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  // 刷新冷却状态
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  // 请求去重
  const [isRequesting, setIsRequesting] = useState(false);
  // 实例 key, 改变时 SliderCaptcha 完全重新挂载 (清库内缓存 + 重新调 request)
  const [instanceKey, setInstanceKey] = useState(0);
  // rc-slider-captcha 要求 actionRef 类型为 MutableRefObject
  const captchaRef = useRef<ActionType | undefined>(undefined) as React.MutableRefObject<ActionType | undefined>;
  const currentChallengeRef = useRef<{ id: string; bgUrl: string; puzzleUrl: string } | null>(null);
  // 请求去重 ref
  const requestInProgressRef = useRef(false);

  // 根据 apiBaseUrl 创建 API 实例
  const captchaApi = useMemo(() => createCaptchaApi(apiBaseUrl), [apiBaseUrl]);

  // 关闭后重置
  useEffect(() => {
    if (!open) {
      setErrorMsg(null);
      setErrorCount(0);
      setRefreshCooldown(false);
      setCooldownRemaining(0);
      setIsRequesting(false);
      requestInProgressRef.current = false;
      currentChallengeRef.current = null;
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // 刷新冷却倒计时
  useEffect(() => {
    if (!refreshCooldown || cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1000) {
          setRefreshCooldown(false);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshCooldown, cooldownRemaining]);

  // request: 库加载图片时调用, 调后端拿新 challenge
  // 请求去重, 防止库重复调用
  const request = useCallback(async () => {
    if (requestInProgressRef.current) {
      // 已有请求进行中, 等待当前请求完成
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (currentChallengeRef.current) {
        return {
          bgUrl: currentChallengeRef.current.bgUrl,
          puzzleUrl: currentChallengeRef.current.puzzleUrl,
        };
      }
    }
    requestInProgressRef.current = true;
    setIsRequesting(true);
    try {
      const data = await captchaApi.challenge();
      currentChallengeRef.current = data;
      return { bgUrl: data.bgUrl, puzzleUrl: data.puzzleUrl };
    } finally {
      requestInProgressRef.current = false;
      setIsRequesting(false);
    }
  }, [captchaApi]);

  // onVerify: 用户松手后库回调
  const onVerify = useCallback(
    async (data: { x: number; y: number; sliderOffsetX: number; duration: number }) => {
      const ch = currentChallengeRef.current;
      if (!ch) throw new Error('challenge 丢失, 请刷新重试');

      let verifiedToken: string | null = null;
      try {
        const res = await captchaApi.verify(ch.id, Math.round(data.x), data.duration);
        if (res.success && res.token) {
          verifiedToken = res.token;
        } else {
          throw new Error('验证失败');
        }
      } catch (err: unknown) {
        const apiErr = err as { errorId?: string; msg?: string; message?: string };
        const errId = apiErr?.errorId || 'unknown';
        const msg =
          apiErr?.msg ||
          CAPTCHA_ERROR_MESSAGES[errId] ||
          (err instanceof Error ? err.message : '') ||
          '验证失败, 请重试';
        setErrorMsg(msg);
        onError?.(msg);
        // 错误冷却 2s
        setRefreshCooldown(true);
        setCooldownRemaining(ERROR_COOLDOWN_MS);
        // 错误超 2 次自动刷新
        setErrorCount((prev) => {
          const next = prev + 1;
          if (next >= 2) {
            setTimeout(() => {
              setErrorCount(0);
              setInstanceKey((k) => k + 1);
            }, 500);
          }
          return next;
        });
        throw err;
      }

      if (verifiedToken) {
        setErrorCount(0);
        const token = verifiedToken;
        setTimeout(() => {
          onSuccess(token);
          onOpenChange(false);
        }, 800);
      }
    },
    [captchaApi, onError, onSuccess, onOpenChange],
  );

  // 刷新按钮冷却 3s
  const handleRefresh = useCallback(() => {
    if (refreshCooldown) return;
    setErrorMsg(null);
    setErrorCount(0);
    currentChallengeRef.current = null;
    setInstanceKey((k) => k + 1);
    setRefreshCooldown(true);
    setCooldownRemaining(REFRESH_COOLDOWN_MS);
  }, [refreshCooldown]);

  if (!open) return null;

  return (
    <div
      className="rc-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="captcha-modal-title"
      onClick={() => onOpenChange(false)}
    >
      {/* 背景遮罩 */}
      <div className="rc-modal-backdrop" aria-hidden />

      <div
        className="rc-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="rc-modal-header">
          <button
            type="button"
            className="rc-modal-close"
            onClick={() => onOpenChange(false)}
            aria-label="关闭验证码"
          >
            <X />
          </button>
          <div className="rc-modal-header-inner">
            <div className="rc-modal-icon">
              <ShieldCheck />
            </div>
            <div>
              <h2 id="captcha-modal-title" className="rc-modal-title">
                {title}
              </h2>
              <p className="rc-modal-desc">{description}</p>
            </div>
          </div>
        </div>

        {/* 中间: 验证码 */}
        <div className="rc-modal-body">
          <SliderCaptcha
            key={instanceKey}
            actionRef={captchaRef}
            request={request}
            onVerify={onVerify}
            mode="embed"
            autoRequest
            autoRefreshOnError
            showRefreshIcon
            // 放宽库内连续错误阈值 3 → 6, 避免"3 次就刷新弹窗"的负体验
            // 后端真实失败惩罚由 FAIL_PENALTY_THRESHOLD 控制, 这里只是触发自动刷新的 UI 阈值
            limitErrorCount={6}
            // 错误停留 500 → 1200ms, 让用户看清错误提示再自动刷新
            errorHoldDuration={1200}
            bgSize={{ width: 320, height: 180 }}
            puzzleSize={{ width: 60, height: 60, left: 0 }}
            tipText={{
              default: '按住滑块向右拖动',
              loading: isRequesting ? '加载中…' : '加载中…',
              moving: '拖动中…',
              verifying: '正在验证…',
              success: '验证通过, 即将关闭',
              error: '验证失败, 请重试',
              errors: '连续错误过多, 点击刷新',
              loadFailed: '加载失败, 点击重试',
            }}
            tipIcon={{
              refresh: <RotateCcw style={{ width: 16, height: 16 }} />,
            }}
          />

          {errorMsg && (
            <div className="rc-modal-error">
              <AlertCircle />
              <span className="rc-modal-error-text">
                {errorMsg}，
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshCooldown}
                  className="rc-modal-retry"
                >
                  {refreshCooldown ? `重试 (${Math.ceil(cooldownRemaining / 1000)}s)` : '点击重试'}
                </button>
              </span>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="rc-modal-footer">
          <p className="rc-modal-footer-text">
            本验证用于确认是真人操作, 保障账号安全
          </p>
        </div>
      </div>
    </div>
  );
}
