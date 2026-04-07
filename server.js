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
    // 1. 단순 페이지가 아닌 실제 방송 상태 API를 직접 호출
    const response = await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": `https://www.sooplive.com/station/${userId}`,
        "Origin": "https://www.sooplive.com"
      },
      timeout: 5000
    });

    const data = response.data;
    // 2. SOOP API의 정석적인 라이브 판정 필드 사용
    // station.is_broad가 true이거나 broad.broad_status가 "1"이면 방송 중
    const isLive = !!(data.station && data.station.is_broad) || (data.broad && data.broad.broad_status === "1");
    
    return { userId, isLive };
  } catch (e) {
    return { userId, isLive: false };
  }
}

app.get("/live-status", async (req, res) => {
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  try {
    // 20명을 동시에 체크 (API 방식이라 매우 빠름)
    const results = await Promise.all(TARGETS.map(id => checkUser(id)));
    const newStatuses = {};
    results.forEach(r => { newStatuses[r.userId] = r.isLive; });

    cache = {
      statuses: newStatuses,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + 30000 // 30초 캐시
    };

    res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => res.send("SOOP API-Checker is running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));