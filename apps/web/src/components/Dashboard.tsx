import { useEffect, useState } from 'react';
import {
  getMyCoupons,
  issue,
  listCampaigns,
  type Campaign,
  type Coupon,
} from '../api.js';

// 로그인 후 화면: 캠페인 목록(발급 버튼) + 내 쿠폰.
export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function addLog(line: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev]);
  }

  async function refresh() {
    try {
      setCampaigns(await listCampaigns());
      setCoupons(await getMyCoupons());
    } catch (e) {
      addLog(`조회 실패: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void listCampaigns().then(setCampaigns).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, []);

  async function onIssue(campaignId: string) {
    setBusyId(campaignId);
    try {
      const { status, body } = await issue(campaignId);
      if (body.ok) addLog(`✅ 발급 성공 (${body.couponId?.slice(0, 8) ?? 'queued'})`);
      else if (body.reason === 'ALREADY_ISSUED') addLog('⚠️ 이미 발급받음');
      else if (body.reason === 'SOLD_OUT') addLog('❌ 품절');
      else addLog(`요청 결과: ${status} ${body.reason ?? ''}`);
      await refresh();
    } catch (e) {
      addLog(`발급 실패: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="row-between">
        <span className="muted">로그인됨</span>
        <button type="button" className="link" onClick={onLogout}>
          로그아웃
        </button>
      </div>

      <h2>캠페인</h2>
      {campaigns.length === 0 && <p className="muted">캠페인이 없습니다.</p>}
      {campaigns.map((c) => (
        <div key={c.id} className="campaign">
          <div>
            <strong>{c.name}</strong>
            <div className="muted">
              {c.remaining} / {c.totalStock} 남음
            </div>
          </div>
          <button
            type="button"
            disabled={busyId === c.id || c.remaining <= 0}
            onClick={() => onIssue(c.id)}
          >
            {c.remaining <= 0 ? '품절' : busyId === c.id ? '...' : '발급'}
          </button>
        </div>
      ))}

      <h2>내 쿠폰 ({coupons.length})</h2>
      {coupons.length === 0 && <p className="muted">아직 발급받은 쿠폰이 없습니다.</p>}
      {coupons.map((cp) => (
        <div key={cp.id} className="coupon muted">
          {cp.code.slice(0, 12)}… · {new Date(cp.issuedAt).toLocaleString()}
        </div>
      ))}

      <div className="log">
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
