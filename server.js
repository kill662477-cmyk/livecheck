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

let cache = { statuses: {}, checkedAt: null, expiresAt: 0 };

async function checkUser(userId) {
  try {
    const response = await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": `https://www.sooplive.com/station/${userId}`
      },
      timeout: 3000 // 타임아웃 단축
    });
    const data = response.data;
    const isLive = !!(data?.station?.is_broad || (data?.broad?.broad_no && data?.broad?.broad_no !== 0));
    return { userId, isLive };
  } catch (e) {
    return { userId, isLive: false };
  }
}

app.get("/live-status", async (req, res) => {
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  const newStatuses = {};
  // 20명을 5명씩 4개 그룹으로 나눔
  const chunks = [];
  for (let i = 0; i < TARGETS.length; i += 5) {
    chunks.push(TARGETS.slice(i, i + 5));
  }

  // 그룹별 병렬 처리 (5명씩은 동시에 확인)
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(id => checkUser(id)));
    results.forEach(r => { newStatuses[r.userId] = r.isLive; });
    // 서버 차단 방지를 위해 그룹 간 0.15초만 대기
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  cache = {
    statuses: newStatuses,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + 15000 // 캐시 15초
  };

  res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));