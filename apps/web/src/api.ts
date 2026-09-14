import { getToken } from "./token.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface Campaign {
  id: string;
  name: string;
  totalStock: number;
  issuedCount: number;
  remaining: number;
}

export interface Coupon {
  id: string;
  campaignId: string;
  code: string;
  issuedAt: string;
}

export interface IssueResponse {
  ok: boolean;
  couponId?: string;
  reason?: string;
  queued?: boolean;
}

// 로그인 토큰이 있으면 Authorization 헤더를 만들어 준다. (요청 측 인증)
function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── 참고 예시 (완성본): 캠페인 목록 (공개, 토큰 불필요) ──
export async function listCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${API_URL}/api/campaigns`);
  if (!res.ok) throw new Error(`listCampaigns failed: ${res.status}`);
  const data = await res.json();
  return data.campaigns;
}

// ============================================================
// 아래 4개는 직접 구현 (위 listCampaigns를 참고).
// 공통 패턴: fetch(url, { method, headers, body }) → res.json()
//   - JSON 보낼 때: headers { 'Content-Type': 'application/json', ...authHeader() }
//   - 인증 필요한 요청엔 authHeader()를 펼쳐 넣는다.
// ============================================================

// 회원가입 → { token } 반환. 서버: POST /api/auth/register { email, password }
export async function register(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "회원가입 실패");
  }
  const data = await res.json();
  return data.token;
}

// 로그인 → { token } 반환. 서버: POST /api/auth/login { email, password }
export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "로그인 실패");
  }
  const data = await res.json();
  return data.token;
}

// 쿠폰 발급(로그인 상태). 서버: POST /api/campaigns/:id/issue?strategy=atomic
//   - 인증 헤더 필요(authHeader). body는 비워도 됨(서버가 토큰의 유저 id를 씀).
//   - 상태코드로 성공/품절/중복을 구분해야 하니 { status, body } 형태로 반환.
export async function issue(
  campaignId: string,
): Promise<{ status: number; body: IssueResponse }> {
  const res = await fetch(
    `${API_URL}/api/campaigns/${campaignId}/issue?strategy=atomic`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
    },
  );
  return { status: res.status, body: await res.json() };
}

// 내 쿠폰 목록(로그인 상태). 서버: GET /api/coupons/mine (authHeader 필요)
export async function getMyCoupons(): Promise<Coupon[]> {
  const res = await fetch(`${API_URL}/api/coupons/mine`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...authHeader() },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "목록 조회 오류");
  }
  const data = await res.json();
  return data.coupons;
}
