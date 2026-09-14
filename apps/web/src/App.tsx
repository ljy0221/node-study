import { useState } from 'react';
import Login from './components/Login.js';
import Dashboard from './components/Dashboard.js';
import { clearToken, getToken } from './token.js';

export default function App() {
  // 토큰 유무로 로그인 상태를 판단 (localStorage에서 초기값 로드)
  const [token, setTokenState] = useState<string | null>(() => getToken());

  function handleLogout() {
    clearToken();
    setTokenState(null);
  }

  return (
    <div className="card">
      <h1>🎟️ 선착순 쿠폰</h1>
      {token ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        // 로그인/회원가입 성공 시 App의 token 상태를 갱신 → Dashboard로 전환
        <Login onAuthed={(t) => setTokenState(t)} />
      )}
    </div>
  );
}
