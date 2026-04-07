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

app.get("/notices", async (req, res) => {
  // 캐시가 있고 데이터가 있으면 바로 반환
  if (Date.now() < noticeCache.expiresAt && noticeCache.data && noticeCache.data.length > 0) {
    return res.json(noticeCache.data);
  }

  const rawNotices = [];
  // 한 번에 20명을 다 찌르면 차단당할 수 있으니 4명씩 천천히 수집
  for (let i = 0; i < TARGETS.length; i += 4) {
    const chunk = TARGETS.slice(i, i + 4);
    const results = await Promise.all(chunk.map(async (id) => {
      try {
        const response = await axios.get(`https://chapi.sooplive.com/api/${id}/board/0/list?page_no=1`, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": `https://ch.sooplive.com/${id}/board/0`
          },
          timeout: 5000 // 타임아웃을 5초로 늘림
        });
        
        const list = response.data?.data || [];
        // 각 인원당 최신글 1개씩만 확실히 가져오기
        return list.slice(0, 1).map(p => ({
          nickname: id,
          title: p.title,
          regDate: p.reg_date,
          visitCount: p.visit_cnt
        }));
      } catch (e) {
        console.log(`${id} 공지 로드 실패`);
        return [];
      }
    }));
    rawNotices.push(...results.flat());
    // 중간에 짧은 휴식 (차단 방지)
    await new Promise(r => setTimeout(r, 300));
  }

  // 전체 수집된 공지 중 최신순으로 10개 정렬
  const finalTen = rawNotices
    .filter(n => n && n.regDate) // 데이터가 있는 것만 필터링
    .sort((a, b) => new Date(b.regDate) - new Date(a.regDate))
    .slice(0, 10);

  // 데이터가 하나도 없으면 에러 메시지 대신 빈 배열을 보내지 않도록 처리
  if (finalTen.length === 0) {
    return res.status(404).json({ error: "공지를 찾을 수 없습니다. 나중에 다시 시도해주세요." });
  }

  noticeCache = {
    data: finalTen,
    checkedAt: new Date().toISOString(),
    expiresAt: Date.now() + (3 * 60 * 1000) // 3분 캐시
  };

  res.json(finalTen);
});

app.get("/", (req, res) => res.send("SOOP Multi-Checker is running!"));
app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));