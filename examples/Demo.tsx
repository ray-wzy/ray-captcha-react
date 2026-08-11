/**
 * 前端示例入口: 演示如何使用 CaptchaModal
 *
 * 运行 (需先安装依赖并构建库):
 *   cd frontend
 *   npm install
 *   npm run build
 *   # 然后在你的项目中引用 examples/Demo.tsx
 */
import { useState } from 'react';
import { CaptchaModal } from '../src';

export default function Demo() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '1rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '1rem' }}>
          滑动拼图验证码 Demo
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
          打开验证码
        </button>

        {token && (
          <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#10b981', wordBreak: 'break-all', maxWidth: '28rem' }}>
            验证成功! token: {token.slice(0, 50)}...
          </p>
        )}

        <CaptchaModal
          open={open}
          onOpenChange={setOpen}
          apiBaseUrl="http://localhost:8000"
          onSuccess={(t) => {
            setToken(t);
            // 把 token 提交给业务接口一次性消费
            console.log('verified token:', t);
          }}
          onError={(err) => console.error('captcha error:', err)}
        />
      </div>
    </div>
  );
}
