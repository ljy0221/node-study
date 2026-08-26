const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface Campaign {
  id: string;
  name: string;
  totalStock: number;
  issuedCount: number;
  remaining: number;
}

export interface IssueResponse {
  ok: boolean;
  couponId?: string;
  reason?: 'SOLD_OUT' | 'ALREADY_ISSUED';
}

export async function getCampaign(id: string): Promise<Campaign> {
  const res = await fetch(`${API_URL}/api/campaigns/${id}`);
  if (!res.ok) throw new Error(`getCampaign failed: ${res.status}`);
  return res.json();
}

export async function issueCoupon(
  id: string,
  userKey: string,
): Promise<{ status: number; body: IssueResponse }> {
  const res = await fetch(`${API_URL}/api/campaigns/${id}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey }),
  });
  return { status: res.status, body: await res.json() };
}
