// JWT 토큰을 브라우저 localStorage에 보관하는 헬퍼.
// (학습용 — 실무에선 XSS 위험 때문에 httpOnly 쿠키를 쓰기도 한다. 트레이드오프는 나중에.)
const KEY = 'coupon_token';

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
