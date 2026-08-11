# ray-slide-captcha

Slide puzzle captcha React component library.

[简体中文](./README.zh-CN.md) | English

Built on [`rc-slider-captcha`](https://github.com/react-rc/rc-slider-captcha), providing a ready-to-use modal-style interaction. Works with the backend [`ray-slide-captcha`](https://github.com/ray-wzy/ray-captcha-py) for the full slide verification flow.

## Features

- **Framework-agnostic**: works with any React 18+ project (Next.js / Vite / CRA, etc.)
- **Modal interaction**: built-in Modal, controlled open state, ESC to close, click overlay to close
- **Full state management**: request dedup, refresh cooldown (3s), error cooldown (2s), auto-refresh on consecutive errors
- **Friendly error messages**: built-in error code → user-friendly message mapping, customizable
- **TypeScript friendly**: full type exports
- **Dark theme support**: built-in styles override the default rc-slider-captcha theme

## Installation

```bash
npm install ray-slide-captcha
# or
pnpm add ray-slide-captcha
# or
yarn add ray-slide-captcha
```

**peerDependencies**: `react >= 18`, `react-dom >= 18`

## Quick Start

```tsx
import { useState } from 'react';
import { CaptchaModal } from 'ray-slide-captcha';
import 'ray-slide-captcha/styles.css';

function Login() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  return (
    <>
      <button onClick={() => setOpen(true)}>Login</button>

      <CaptchaModal
        open={open}
        onOpenChange={setOpen}
        apiBaseUrl="http://localhost:8000"
        onSuccess={(t) => {
          console.log('Verified, token:', t);
          setToken(t);
        }}
        onError={(msg) => console.error('Verification failed:', msg)}
      />
    </>
  );
}
```

After verification succeeds, submit the `token` to your business endpoint. The backend calls `CaptchaService.consume_token(token)` to consume it once.

## Props

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `open` | `boolean` | yes | - | Whether the modal is open |
| `onOpenChange` | `(open: boolean) => void` | yes | - | Open state change callback |
| `apiBaseUrl` | `string` | yes | - | Backend service URL (e.g. `http://localhost:8000`). Must start with `http://` or `https://`; trailing slashes are trimmed. |
| `onSuccess` | `(token: string) => void` | yes | - | Verification success callback, receives a one-time token. Fired once via an effect — safe even if the modal unmounts during the success hold. |
| `onError` | `(error: CaptchaError) => void` | no | - | Verification failure callback. `CaptchaError` has `{ errorId, message, code?, status?, cause? }`. |
| `title` | `string` | no | `Please complete the verification` | Modal title |
| `description` | `string` | no | `Drag the slider to complete the puzzle` | Modal subtitle |
| `zIndex` | `number` | no | `1100` | Overlay z-index |
| `className` | `string` | no | - | Custom className appended to the modal container |
| `maskClosable` | `boolean` | no | `true` | Whether clicking the backdrop closes the modal |

## Advanced Usage

### Using the API client alone

If you don't want the built-in Modal and only need the API wrapper:

```tsx
import { createCaptchaApi } from 'ray-slide-captcha';

const api = createCaptchaApi('http://localhost:8000');

// Fetch a challenge
const { id, bgUrl, puzzleUrl } = await api.challenge();

// Verify (dragDurationMs comes from your slider component)
const { success, token } = await api.verify(id, xPosition, dragDurationMs);
```

### Error code mapping

```ts
import { CAPTCHA_ERROR_MESSAGES, type CaptchaError } from 'ray-slide-captcha';

// {
//   captcha_not_found: 'Captcha not found, please refresh',
//   captcha_expired: 'Captcha expired, please refresh',
//   captcha_position_error: 'Incorrect puzzle position, please drag again',
//   captcha_too_fast: 'Drag too fast, please try again',
//   ...
// }

// Structured error in onError:
// {
//   errorId: 'captcha_position_error',
//   message: 'Incorrect puzzle position, please drag again',
//   code: 400,
//   status: 400,
//   cause: <original error>
// }
```

## Frontend Anti-Abuse Mechanisms

| Mechanism | Threshold | Description |
| --- | --- | --- |
| Request dedup | same moment | Prevents the library from calling `request` repeatedly |
| Refresh cooldown | 3s | Prevents users from spamming refresh |
| Error cooldown | 2s | Forced wait after an error |
| Consecutive errors | 2 | Auto-refresh the challenge |
| Drag duration check | 180ms - 60s | Combined with backend, too fast / too slow are rejected |

## Companion Backend

The frontend depends on two backend endpoints:

- `GET /api/captcha/challenge` — fetch a challenge (bgUrl + puzzleUrl + id)
- `POST /api/captcha/verify` — verify position, return one-time token

Backend implementation: [ray-captcha-py](https://github.com/ray-wzy/ray-captcha-py)

## License

MIT
