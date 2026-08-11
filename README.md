# ray-slide-captcha

滑动拼图验证码 React 组件库。

基于 [`rc-slider-captcha`](https://github.com/react-rc/rc-slider-captcha) 封装，提供开箱即用的弹窗式交互，配合后端 [`ray-slide-captcha`](https://github.com/ray-wzy/ray-captcha-py) 完成滑动验证全流程。

## 特性

- **框架无关**：Next.js / Vite / CRA 等任何 React 18+ 项目可用
- **弹窗式交互**：内置 Modal，受控开关，ESC 关闭，遮罩点击关闭
- **完整状态管理**：请求去重、刷新冷却（3s）、错误冷却（2s）、连续错误自动刷新
- **友好错误提示**：内置错误码 → 中文提示映射，支持自定义
- **TypeScript 友好**：完整类型导出
- **深色主题适配**：内置样式覆盖 rc-slider-captcha 默认主题

## 安装

```bash
npm install ray-slide-captcha
# 或
pnpm add ray-slide-captcha
# 或
yarn add ray-slide-captcha
```

**peerDependencies**：`react >= 18`、`react-dom >= 18`

## 快速开始

```tsx
import { useState } from 'react';
import { CaptchaModal } from 'ray-slide-captcha';
import 'ray-slide-captcha/styles.css';

function Login() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  return (
    <>
      <button onClick={() => setOpen(true)}>登录</button>

      <CaptchaModal
        open={open}
        onOpenChange={setOpen}
        apiBaseUrl="http://localhost:8000"
        onSuccess={(t) => {
          console.log('验证通过，token:', t);
          setToken(t);
        }}
        onError={(msg) => console.error('验证失败:', msg)}
      />
    </>
  );
}
```

验证通过后拿到的 `token` 提交到业务接口，由后端调用 `CaptchaService.consume_token(token)` 一次性消费。

## Props

| Prop | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `open` | `boolean` | 是 | - | 弹窗是否打开 |
| `onOpenChange` | `(open: boolean) => void` | 是 | - | 开关回调 |
| `apiBaseUrl` | `string` | 是 | - | 后端服务地址（如 `http://localhost:8000`） |
| `onSuccess` | `(token: string) => void` | 是 | - | 验证通过回调，返回一次性 token |
| `onError` | `(error: string) => void` | 否 | - | 验证失败回调 |
| `title` | `string` | 否 | `请完成安全验证` | 弹窗标题 |
| `description` | `string` | 否 | `拖动滑块完成拼图` | 弹窗副标题 |

## 高级用法

### 单独使用 API 客户端

如果你不想用内置 Modal，只要 API 封装：

```tsx
import { createCaptchaApi } from 'ray-slide-captcha';

const api = createCaptchaApi('http://localhost:8000');

// 获取挑战
const { id, bgUrl, puzzleUrl } = await api.challenge();

// 校验（dragDurationMs 来自你的滑块组件）
const { success, token } = await api.verify(id, xPosition, dragDurationMs);
```

### 错误码映射

```ts
import { CAPTCHA_ERROR_MESSAGES } from 'ray-slide-captcha';

// {
//   captcha_not_found: '验证码不存在, 请刷新重试',
//   captcha_expired: '验证码已过期, 请刷新重试',
//   captcha_position_error: '拼图位置不正确, 请重新拖动',
//   captcha_too_fast: '拖动过快, 请重新拖试',
//   ...
// }
```

## 前端防刷机制

| 机制 | 阈值 | 说明 |
| --- | --- | --- |
| 请求去重 | 同一时刻 | 防止库重复调用 `request` |
| 刷新冷却 | 3s | 防止用户狂点刷新 |
| 错误冷却 | 2s | 错误后强制等待 |
| 连续错误 | 2 次 | 自动刷新挑战 |
| 拖动时间校验 | 180ms - 60s | 配合后端，过快/过慢拒绝 |

## 配套后端

前端依赖后端两个接口：

- `GET /api/captcha/challenge` — 获取挑战（bgUrl + puzzleUrl + id）
- `POST /api/captcha/verify` — 校验位置，返回一次性 token

后端实现：[ray-captcha-py](https://github.com/ray-wzy/ray-captcha-py)

## License

MIT
