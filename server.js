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

// 캐시 저장소
let liveCache = { statuses: {}, checkedAt: null, expiresAt: 0 };
let noticeCache = { data: [], checkedAt: null, expiresAt: 0 };

// --- [공통 함수] 사용자 방송 정보 가져오기 ---
async function fetchStationData(userId) {
  return await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Referer": `https://www.sooplive.com/station/${userId}`
    },
    timeout: 3000
  });
}

// --- [기존 기능] 라이브 상태 체크 ---
app.get("/live-status", async (req, res) => {
  if (Date.now() < liveCache.expiresAt && liveCache.checkedAt) {
    return res.json({ statuses: liveCache.statuses, checkedAt: liveCache.checkedAt, cached: true });
  }

  const newStatuses = {};
  for (let i = 0; i < TARGETS.length; i += 5) {
    const chunk = TARGETS.slice(i, i + 5);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const response = await fetchStationData(id);
        const data = response.data;
        const isLive = !!(data?.station?.is_broad || (data?.broad?.broad_no && data?.broad?.broad_no !== 0));
        return { id, isLive };
      } catch { return { id, isLive: false }; }
    }));
    results.forEach(r => { newStatuses[r.id] = r.isLive; });
    await new Promise(r => setTimeout(r, 150));
  }

  liveCache = { statuses: newStatuses, checkedAt: new Date().toISOString(), expiresAt: Date.now() + 20000 };
  res.json({ statuses: liveCache.statuses, checkedAt: liveCache.checkedAt, cached: false });
});

// --- [신규 기능] 전체 중 최신 공지 10개 추출 ---
app.get("/notices", async (req, res) => {
  if (Date.now() < noticeCache.expiresAt && noticeCache.data.length > 0) {
    return res.json(noticeCache.data);
  }

  const rawNotices = [];
  for (let i = 0; i < TARGETS.length; i += 5) {
    const chunk = TARGETS.slice(i, i + 5);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const response = await axios.get(`https://chapi.sooplive.com/api/${id}/board/0/list?page_no=1`, {
          headers: { "User-Agent": "Mozilla/5.0..." },
          timeout: 2500
        });
        return (response.data?.data || []).slice(0, 2).map(p => ({
          nickname: id,
          title: p.title,
          regDate: p.reg_date,
          visitCount: p.visit_cnt
        }));
      } catch { return []; }
    }));
    rawNotices.push(...results.flat());
    await new Promise(r => setTimeout(r, 100));
  }

  const finalTen = rawNotices
    .sort((a, b) => new Date(b.regDate) - new Date(a.regDate))
    .slice(0, 10);

  noticeCache = { data: finalTen, checkedAt: new Date().toISOString(), expiresAt: Date.now() + (5 * 60 * 1000) };
  res.json(finalTen);
});

app.get("/", (req, res) => res.send("SOOP Multi-Checker is running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));