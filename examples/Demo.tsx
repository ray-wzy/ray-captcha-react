/**
 * Frontend demo entry: shows how to use CaptchaModal.
 *
 * Run (requires installing dependencies and building the library first):
 *   cd frontend
 *   npm install
 *   npm run build
 *   # Then reference examples/Demo.tsx from your own project
 */
import { useState } from 'react';
import { CaptchaModal } from '../src';

export default function Demo() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '1rem' }}>
          Slide Puzzle Captcha Demo
        </h1>
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Open captcha
        </button>

        {token && (
          <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#10b981', wordBreak: 'break-all', maxWidth: '28rem' }}>
            Verified! token: {token.slice(0, 50)}...
          </p>
        )}

        {errorMsg && (
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#ef4444' }}>
            {errorMsg}
          </p>
        )}

        <CaptchaModal
          open={open}
          onOpenChange={setOpen}
          apiBaseUrl="http://localhost:8000"
          onSuccess={(t) => {
            setToken(t);
            // Submit `t` to your business endpoint to consume once
          }}
          onError={(err) => {
            // err: { errorId, message, code?, status?, cause? }
            setErrorMsg(err.message);
          }}
        />
      </div>
    </div>
  );
}
