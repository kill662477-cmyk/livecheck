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
    // 타임아웃을 짧게 잡고, 실제 모바일 앱이 사용하는 API를 사용합니다.
    const response = await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Referer": `https://www.sooplive.com/station/${userId}`
      },
      timeout: 3000
    });

    const data = response.data;
    // API 데이터 구조에서 방송 여부 추출
    const isLive = !!(data && data.station && data.station.is_broad);
    return { userId, isLive };
  } catch (e) {
    // 에러 발생 시 로그를 남겨서 범인을 찾습니다.
    console.error(`Error checking ${userId}:`, e.message);
    return { userId, isLive: false };
  }
}

app.get("/live-status", async (req, res) => {
  // 캐시가 유효하면 즉시 반환 (30초)
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  try {
    const newStatuses = {};
    
    // [중요] 한꺼번에 요청하지 않고 한 명씩 순서대로 (SOOP 차단 방지)
    for (const id of TARGETS) {
      const result = await checkUser(id);
      newStatuses[result.userId] = result.isLive;
      // 0.1초씩 쉬어줍니다 (안정성 확보)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    cache = {
      statuses: newStatuses,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + 30000
    };

    res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => res.send("SOOP Final-Checker is running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));