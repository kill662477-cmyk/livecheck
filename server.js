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
let noticeCache = { data: [], expiresAt: 0 };

// 1. 라이브 상태 체크 API (기존 기능)
app.get("/live-status", async (req, res) => {
  if (Date.now() < liveCache.expiresAt) return res.json(liveCache);

  const newStatuses = {};
  for (const id of TARGETS) {
    try {
      const response = await axios.get(`https://chapi.sooplive.com/api/${id}/station`, { timeout: 3000 });
      newStatuses[id] = !!(response.data?.station?.is_broad || response.data?.broad?.broad_no);
    } catch { newStatuses[id] = false; }
    await new Promise(r => setTimeout(r, 100)); // 0.1초 간격
  }
  liveCache = { statuses: newStatuses, checkedAt: new Date().toISOString(), expiresAt: Date.now() + 30000 };
  res.json(liveCache);
});

// 2. 숲공지 수집 API (신규 기능)
app.get("/notices", async (req, res) => {
  if (Date.now() < noticeCache.expiresAt && noticeCache.data.length > 0) return res.json(noticeCache.data);

  let raw = [];
  for (const id of TARGETS) {
    try {
      const response = await axios.get(`https://chapi.sooplive.com/api/${id}/board/0/list?page_no=1`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 4000
      });
      const list = response.data?.data || [];
      if (list.length > 0) {
        raw.push({
          nickname: list[0].nickname || id,
          userId: id,
          title: list[0].title,
          regDate: list[0].reg_date,
          visitCount: list[0].visit_cnt
        });
      }
    } catch (e) { console.log(id + " 실패"); }
    await new Promise(r => setTimeout(r, 500)); // 차단 방지용 0.5초 대기
  }

  const final = raw.sort((a, b) => new Date(b.regDate) - new Date(a.regDate)).slice(0, 10);
  
  if (final.length === 0) {
    return res.json([{ nickname: "안내", title: "데이터 수집 중입니다. 1분 뒤 다시 눌러주세요.", regDate: "-", userId: "" }]);
  }

  noticeCache = { data: final, expiresAt: Date.now() + (10 * 60 * 1000) }; // 10분간 결과 보존
  res.json(final);
});

app.listen(PORT, "0.0.0.0", () => console.log("Server Ready"));