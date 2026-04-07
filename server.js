const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const TARGETS = [
  "ch1716", "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207", "freshtomato",
  "wjswlgns09", "thelddl", "alaelddl97", "db001202", "fpahsdltu1",
  "soju2022", "dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565"
];

let liveCache = { statuses: {}, checkedAt: null, expiresAt: 0 };
let noticeCache = { data: [], checkedAt: null, expiresAt: 0 };

// --- [기존 기능] 라이브 상태 체크 API ---
app.get("/live-status", async (req, res) => {
  if (Date.now() < liveCache.expiresAt && liveCache.checkedAt) {
    return res.json({ statuses: liveCache.statuses, checkedAt: liveCache.checkedAt, cached: true });
  }

  const newStatuses = {};
  for (let i = 0; i < TARGETS.length; i += 5) {
    const chunk = TARGETS.slice(i, i + 5);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const response = await axios.get(`https://chapi.sooplive.com/api/${id}/station`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" },
          timeout: 3000
        });
        const isLive = !!(response.data?.station?.is_broad || response.data?.broad?.broad_no);
        return { id, isLive };
      } catch { return { id, isLive: false }; }
    }));
    results.forEach(r => { newStatuses[r.id] = r.isLive; });
    await new Promise(r => setTimeout(r, 200));
  }

  liveCache = { 
    statuses: newStatuses, 
    checkedAt: new Date().toISOString(), 
    expiresAt: Date.now() + 30000 // 30초 캐시
  };
  res.json({ statuses: liveCache.statuses, checkedAt: liveCache.checkedAt, cached: false });
});

// --- [신규 기능] 최신 공지 10개 추출 API ---
app.get("/notices", async (req, res) => {
  if (Date.now() < noticeCache.expiresAt && noticeCache.data.length > 0) {
    return res.json(noticeCache.data);
  }

  const rawNotices = [];
  for (let i = 0; i < TARGETS.length; i += 3) { // 차단 방지를 위해 3명씩 천천히
    const chunk = TARGETS.slice(i, i + 3);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const response = await axios.get(`https://chapi.sooplive.com/api/${id}/board/0/list?page_no=1`, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": `https://ch.sooplive.com/${id}/board/0`
          },
          timeout: 4000
        });
        return (response.data?.data || []).slice(0, 1).map(p => ({
          nickname: p.nickname || id,
          userId: id,
          title: p.title,
          regDate: p.reg_date,
          visitCount: p.visit_cnt
        }));
      } catch { return []; }
    }));
    rawNotices.push(...results.flat());
    await new Promise(r => setTimeout(r, 500)); // 요청 간격 0.5초
  }

  const finalTen = rawNotices
    .sort((a, b) => new Date(b.regDate.replace(/-/g, '/')) - new Date(a.regDate.replace(/-/g, '/')))
    .slice(0, 10);

  // 수집 실패 시 안내 문구 반환
  const result = finalTen.length > 0 ? finalTen : [{ nickname: "안내", title: "현재 공지를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.", regDate: "-", visitCount: 0 }];

  noticeCache = {
    data: result,
    expiresAt: Date.now() + (5 * 60 * 1000) // 5분 캐시
  };

  res.json(result);
});

app.get("/", (req, res) => res.send("SOOP Multi-API is Running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));