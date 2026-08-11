/**
 * Slide puzzle captcha modal.
 *
 * Framework-agnostic React component (works with Next.js / Vite / CRA, etc.).
 * Requires the stylesheet: `import 'ray-slide-captcha/styles.css'`
 *
 * Anti-abuse:
 *   - Backend: pre-generated pool (50) + failure penalty (6 fails → 5s cooldown) + IP rate limit
 *   - Frontend: refresh cooldown (3s) + request dedup + error cooldown (2s)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, X, AlertCircle, RotateCcw } from 'lucide-react';
import SliderCaptcha, { type ActionType } from 'rc-slider-captcha';
import { createCaptchaApi, CAPTCHA_ERROR_MESSAGES } from './api';
import { cn } from './utils';

// ============ Types ============
export interface CaptchaError {
  /** Stable error identifier from the backend (e.g. `captcha_position_error`) */
  errorId: string;
  /** HTTP status code if available */
  status?: number;
  /** Business code if available */
  code?: number;
  /** User-friendly message (already localized) */
  message: string;
  /** Raw underlying error, if any */
  cause?: unknown;
}

export interface CaptchaModalProps {
  /** Whether the modal is open (controlled) */
  open: boolean;
  /** Open state change callback */
  onOpenChange: (open: boolean) => void;
  /** Backend service base URL (e.g. `https://captcha.example.com`). Trailing slashes are trimmed. */
  apiBaseUrl: string;
  /** Verification success callback, receives a one-time token */
  onSuccess: (token: string) => void;
  /** Verification failure callback (structured error) */
  onError?: (error: CaptchaError) => void;
  /** Modal title */
  title?: string;
  /** Modal subtitle */
  description?: string;
  /** Overlay z-index. Default 1100. */
  zIndex?: number;
  /** Custom className appended to the modal container */
  className?: string;
  /** Whether clicking the backdrop closes the modal. Default true. */
  maskClosable?: boolean;
}

// Default copy (English). Pass `title` / `description` to override.
const DEFAULT_TITLE = 'Please complete the verification';
const DEFAULT_DESCRIPTION = 'Drag the slider to complete the puzzle';
const DEFAULT_FOOTER = 'This verification confirms you are a real person, keeping your account secure.';

// Cooldown constants
const REFRESH_COOLDOWN_MS = 3000;
const ERROR_COOLDOWN_MS = 2000;
const SUCCESS_HOLD_MS = 800;

// ============ Helpers ============
function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('apiBaseUrl must be a non-empty string');
  }
  // Reject obvious non-URLs
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`apiBaseUrl must start with http:// or https:// (got "${trimmed}")`);
  }
  return trimmed.replace(/\/+$/, '');
}

function toCaptchaError(err: unknown): CaptchaError {
  const e = err as { errorId?: string; code?: number; status?: number; msg?: string; message?: string };
  const errorId = e?.errorId || 'unknown';
  const message =
    e?.msg ||
    CAPTCHA_ERROR_MESSAGES[errorId] ||
    (err instanceof Error ? err.message : '') ||
    'Verification failed, please try again';
  return {
    errorId,
    status: e?.status,
    code: e?.code,
    message,
    cause: err,
  };
}

// ============ Component ============
export default function CaptchaModal({
  open,
  onOpenChange,
  apiBaseUrl,
  onSuccess,
  onError,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  zIndex = 1100,
  className,
  maskClosable = true,
}: CaptchaModalProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  // Bump to fully remount SliderCaptcha (clears internal cache + re-requests)
  const [instanceKey, setInstanceKey] = useState(0);
  // Verified token pending delivery. Decoupled from rc-slider-captcha lifecycle.
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // rc-slider-captcha requires a mutable ref
  const captchaRef = useRef<ActionType | undefined>(undefined) as React.MutableRefObject<
    ActionType | undefined
  >;
  const currentChallengeRef = useRef<{ id: string; bgUrl: string; puzzleUrl: string } | null>(null);
  const requestInProgressRef = useRef(false);
  // Track whether the modal is still mounted/open to avoid stale callbacks
  const isOpenRef = useRef(open);
  useEffect(() => {
    isOpenRef.current = open;
  }, [open]);

  // Normalize base URL once
  const normalizedBaseUrl = useMemo(() => normalizeBaseUrl(apiBaseUrl), [apiBaseUrl]);
  const captchaApi = useMemo(() => createCaptchaApi(normalizedBaseUrl), [normalizedBaseUrl]);

  // Stable error handler
  const handleError = useCallback(
    (err: unknown) => {
      const captchaError = toCaptchaError(err);
      setErrorMsg(captchaError.message);
      onError?.(captchaError);
      setRefreshCooldown(true);
      setCooldownRemaining(ERROR_COOLDOWN_MS);
      setErrorCount((prev) => {
        const next = prev + 1;
        if (next >= 2) {
          // Auto-refresh after 2 consecutive errors
          setTimeout(() => {
            setErrorCount(0);
            setInstanceKey((k) => k + 1);
          }, 500);
        }
        return next;
      });
    },
    [onError],
  );

  // ---- Fix #1: deliver token via effect, not setTimeout inside verify ----
  // When pendingToken is set and the modal is still open, deliver it after a
  // short hold (so the user sees the success state), then close. If the modal
  // unmounts or closes before the hold elapses, we still deliver the token
  // exactly once — but we never call onOpenChange after unmount.
  useEffect(() => {
    if (!pendingToken) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      onSuccess(pendingToken);
      if (isOpenRef.current) {
        onOpenChange(false);
      }
    }, SUCCESS_HOLD_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingToken, onSuccess, onOpenChange]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setErrorMsg(null);
      setErrorCount(0);
      setRefreshCooldown(false);
      setCooldownRemaining(0);
      setIsRequesting(false);
      setPendingToken(null);
      requestInProgressRef.current = false;
      currentChallengeRef.current = null;
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Refresh cooldown countdown
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

  // request: called by the lib when loading images. Fetches a new challenge.
  const request = useCallback(async () => {
    if (requestInProgressRef.current) {
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

  // onVerify: called by the lib after the user releases the slider
  const onVerify = useCallback(
    async (data: { x: number; y: number; sliderOffsetX: number; duration: number }) => {
      const ch = currentChallengeRef.current;
      if (!ch) {
        handleError(new Error('Challenge missing, please refresh'));
        // Fix #2: do NOT rethrow to the lib — we've already handled it
        return;
      }

      try {
        const res = await captchaApi.verify(ch.id, Math.round(data.x), data.duration);
        if (res.success && res.token) {
          setErrorCount(0);
          // Decouple token delivery from the lib's lifecycle
          setPendingToken(res.token);
        } else {
          handleError(new Error('Verification failed'));
        }
      } catch (err) {
        handleError(err);
        // Fix #2: swallow — we've already surfaced the error to the user/caller
      }
    },
    [captchaApi, handleError],
  );

  const handleRefresh = useCallback(() => {
    if (refreshCooldown) return;
    setErrorMsg(null);
    setErrorCount(0);
    setPendingToken(null);
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
      style={{ zIndex }}
      onClick={() => {
        if (maskClosable) onOpenChange(false);
      }}
    >
      <div className="rc-modal-backdrop" aria-hidden />

      <div
        className={cn('rc-modal-container', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rc-modal-header">
          <button
            type="button"
            className="rc-modal-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close captcha"
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
            // Relax the lib's internal error threshold 3 → 6 to avoid the
            // "refresh popup after 3 fails" UX. The real failure penalty is
            // controlled by the backend's FAIL_PENALTY_THRESHOLD.
            limitErrorCount={6}
            // Hold the error state 500 → 1200ms so the user can read it
            errorHoldDuration={1200}
            bgSize={{ width: 320, height: 180 }}
            puzzleSize={{ width: 60, height: 60, left: 0 }}
            tipText={{
              default: 'Press and drag the slider to the right',
              loading: 'Loading…',
              moving: 'Dragging…',
              verifying: 'Verifying…',
              success: 'Verified, closing…',
              error: 'Verification failed, please try again',
              errors: 'Too many errors, click to refresh',
              loadFailed: 'Load failed, click to retry',
            }}
            tipIcon={{
              refresh: <RotateCcw style={{ width: 16, height: 16 }} />,
            }}
          />

          {errorMsg && (
            <div className="rc-modal-error">
              <AlertCircle />
              <span className="rc-modal-error-text">
                {errorMsg},{' '}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshCooldown}
                  className="rc-modal-retry"
                >
                  {refreshCooldown ? `Retry (${Math.ceil(cooldownRemaining / 1000)}s)` : 'Retry'}
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="rc-modal-footer">
          <p className="rc-modal-footer-text">{DEFAULT_FOOTER}</p>
        </div>
      </div>
    </div>
  );
}
