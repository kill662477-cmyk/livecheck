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
    // [핵심 변경] 방송 정보만 전문적으로 주는 API 주소로 변경
    const response = await axios.get(`https://chapi.sooplive.com/api/${userId}/station`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": `https://www.sooplive.com/station/${userId}`
      },
      timeout: 5000
    });

    const data = response.data;
    
    // 판정 1: station 데이터의 is_broad 확인
    let isLive = !!(data && data.station && data.station.is_broad);
    
    // 판정 2: broad 데이터가 존재하고 broad_no가 있으면 무조건 true
    if (!isLive && data.broad && data.broad.broad_no && data.broad.broad_no !== 0) {
      isLive = true;
    }

    return { userId, isLive };
  } catch (e) {
    // null이 뜨는 이유는 여기서 에러가 나기 때문. 에러 시 로그 출력
    console.log(`[Error] ${userId}: ${e.message}`);
    return { userId, isLive: false }; 
  }
}

app.get("/live-status", async (req, res) => {
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  const newStatuses = {};
  
  // 20명을 5명씩 묶어서 순차적으로 처리 (null 방지 + 차단 방지)
  for (let i = 0; i < TARGETS.length; i += 5) {
    const chunk = TARGETS.slice(i, i + 5);
    const results = await Promise.all(chunk.map(id => checkUser(id)));
    results.forEach(r => { newStatuses[r.userId] = r.isLive; });
    await new Promise(resolve => setTimeout(resolve, 500)); // 그룹 간 0.5초 휴식
  }

  cache = {
    statuses: newStatuses,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + 20000 // 20초 캐시
  };

  res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));