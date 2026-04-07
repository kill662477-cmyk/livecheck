const express = require("express");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const TARGETS = [
  "arinbbidol", "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207", "freshtomato",
  "wjswlgns09", "thelddl", "alaelddl97", "db001202", "fpahsdltu1",
  "soju2022", "dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565"
];

let cache = { statuses: {}, checkedAt: null, expiresAt: 0 };

async function checkUser(userId) {
  try {
    // 플레이어 페이지로 직접 요청 (가장 정확함)
    const response = await axios.get(`https://play.sooplive.com/${userId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.sooplive.com/"
      },
      timeout: 8000
    });

    const html = response.data;
    // 방송 번호(broad_no)가 0이 아니면 방송 중으로 판정
    const isLive = html.includes('broad_no') && !html.includes('"broad_no":0');
    
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
    // 20명 한꺼번에 비동기로 찔러보기
    const results = await Promise.all(TARGETS.map(id => checkUser(id)));
    const newStatuses = {};
    results.forEach(r => { newStatuses[r.userId] = r.isLive; });

    cache = {
      statuses: newStatuses,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + 45000 // 45초 캐시
    };

    res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => res.send("SOOP Light-Checker is running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));