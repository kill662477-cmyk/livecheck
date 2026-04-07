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
  
  // 차단을 피하기 위해 '한 명씩' 아주 천천히 가져옵니다 (가장 안전한 방법)
  for (const id of TARGETS) {
    try {
      const response = await axios.get(`https://chapi.sooplive.com/api/${id}/board/0/list?page_no=1`, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": `https://ch.sooplive.com/${id}/board/0`
        },
        timeout: 5000
      });
      
      const list = response.data?.data || [];
      if (list.length > 0) {
        const p = list[0];
        rawNotices.push({
          nickname: p.nickname || id,
          userId: id,
          title: p.title,
          regDate: p.reg_date,
          visitCount: p.visit_cnt
        });
      }
    } catch (e) {
      console.log(`${id} 공지 로드 건너뜀`);
    }
    // 각 요청 사이에 0.7초의 휴식 시간을 둡니다.
    await new Promise(r => setTimeout(r, 700));
  }

  const finalTen = rawNotices
    .sort((a, b) => new Date(b.regDate.replace(/-/g, '/')) - new Date(a.regDate.replace(/-/g, '/')))
    .slice(0, 10);

  // 데이터가 정말 없을 때만 안내 문구 포함
  const result = finalTen.length > 0 ? finalTen : [{ nickname: "안내", title: "현재 SOOP 서버에서 공지를 가져올 수 없습니다. 잠시 후 다시 버튼을 눌러주세요.", regDate: "-", visitCount: 0 }];

  noticeCache = { data: result, expiresAt: Date.now() + (10 * 60 * 1000) }; // 캐시를 10분으로 늘림
  res.json(result);
});

app.get("/", (req, res) => res.send("SOOP Multi-API is Running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));