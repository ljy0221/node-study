import { useState } from 'react';
import { login, register } from '../api.js';
import { setToken } from '../token.js';

// 로그인/회원가입 폼. 성공하면 토큰을 저장하고 onAuthed(token)으로 상위에 알린다.
export default function Login({
  onAuthed,
}: {
  onAuthed: (token: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const token =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password);
      setToken(token);
      onAuthed(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          회원가입
        </button>
      </div>

      <input
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="비밀번호 (8자 이상)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={busy}>
        {busy ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
      </button>
    </form>
  );
}
