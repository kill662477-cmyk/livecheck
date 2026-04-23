const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;
const SOOP_CLIENT_ID = process.env.SOOP_CLIENT_ID || "";

// 확인할 20명
const TARGETS = [
  "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207", "freshtomato",
  "wjswlgns09", "thelddl", "alaelddl97", "db001202", "fpahsdltu1",
  "soju2022", "dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565", "sksmsskdsl10"
];

// 표시용 이름
const DISPLAY_NAMES = {
  brainzerg7: "김윤환",
  rudals5467: "이경민",
  h78ert: "박준오",
  jihoon002: "박수범",
  hoonykkk: "사테",
  rondobba: "지동원",
  goodzerg: "배성흠",
  kthrs9207: "파도튜브",
  freshtomato: "토마토",
  wjswlgns09: "지두두",
  thelddl: "햇살",
  alaelddl97: "찌킹",
  db001202: "치리",
  fpahsdltu1: "주하랑",
  soju2022: "소주양",
  dlaguswl501: "임조이",
  seemin88: "비타밍",
  "2meonjin": "먼진",
  vldpfm2: "아리송이",
  wlswn6565: "진땅콩",
sksmsskdsl10: "낭니"
};

// 캐시
let cache = {
  statuses: {},
  lives: [],
  checkedAt: null,
  sourcePagesChecked: 0,
  refreshMs: 12000
};

let isRefreshing = false;

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// 공식 broad/list 호출
async function fetchBroadList(pageNo = 1) {
  const response = await axios.get("https://openapi.sooplive.com/broad/list", {
    params: {
      client_id: SOOP_CLIENT_ID,
      page_no: pageNo
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "*/*"
    },
    timeout: 8000
  });

  return response.data;
}

// 백그라운드 갱신
async function refreshStatuses() {
  if (!SOOP_CLIENT_ID) {
    throw new Error("SOOP_CLIENT_ID is missing");
  }

  // 중복 실행 방지
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const remaining = new Set(TARGETS);
    const liveMap = new Map();

    // 방송 수가 많을 수 있으므로 넉넉하게
    const MAX_PAGES = 100;

    // 3페이지씩 병렬 조회
    const PAGE_BATCH = 3;

    let pagesChecked = 0;

    for (let startPage = 1; startPage <= MAX_PAGES; startPage += PAGE_BATCH) {
      const pageNumbers = [];

      for (let i = 0; i < PAGE_BATCH; i++) {
        const pageNo = startPage + i;
        if (pageNo <= MAX_PAGES) {
          pageNumbers.push(pageNo);
        }
      }

      const results = await Promise.all(
        pageNumbers.map(pageNo =>
          fetchBroadList(pageNo).catch(() => null)
        )
      );

      for (const data of results) {
        if (!data) continue;

        const broadList = Array.isArray(data?.broad) ? data.broad : [];
        pagesChecked++;

        // 빈 페이지면 이후도 없을 가능성 높음
        if (!broadList.length) continue;

        for (const item of broadList) {
          const id = item.user_id;
          if (!id) continue;

          if (remaining.has(id)) {
            liveMap.set(id, {
              userId: id,
              userNick: item.user_nick || DISPLAY_NAMES[id] || id,
              displayName: DISPLAY_NAMES[id] || item.user_nick || id,
              title: item.broad_title || "",
              broadNo: item.broad_no || "",
              thumbnail: item.broad_thumb
                ? (String(item.broad_thumb).startsWith("//")
                    ? "https:" + item.broad_thumb
                    : item.broad_thumb)
                : "",
              startTime: item.broad_start || "",
              totalViewCnt: item.total_view_cnt || "0",
              profileImg: item.profile_img
                ? (String(item.profile_img).startsWith("//")
                    ? "https:" + item.profile_img
                    : item.profile_img)
                : "",
              stationUrl: `https://www.sooplive.com/station/${id}`,
              playUrl: item.broad_no
                ? `https://play.sooplive.com/${id}/${item.broad_no}`
                : `https://play.sooplive.com/${id}`
            });

            remaining.delete(id);
          }
        }
      }

      // 20명 전부 찾으면 즉시 종료
      if (remaining.size === 0) {
        break;
      }
    }

    const statuses = {};
    const lives = [];

    for (const id of TARGETS) {
      const info = liveMap.get(id);
      statuses[id] = !!info;

      if (info) {
        lives.push(info);
      }
    }

    cache = {
      statuses,
      lives,
      checkedAt: new Date().toISOString(),
      sourcePagesChecked: pagesChecked,
      refreshMs: 12000
    };

    console.log(
      `[LIVE REFRESH] checkedAt=${cache.checkedAt}, pages=${pagesChecked}, liveCount=${lives.length}`
    );
  } catch (error) {
    console.error("[LIVE REFRESH ERROR]", error.message);
  } finally {
    isRefreshing = false;
  }
}

// 사용자는 캐시만 즉시 받음
app.get("/live-status", (req, res) => {
  return res.json({
    statuses: cache.statuses,
    lives: cache.lives,
    checkedAt: cache.checkedAt,
    sourcePagesChecked: cache.sourcePagesChecked,
    refreshMs: cache.refreshMs,
    cached: true
  });
});

// 헬스체크
app.get("/", (req, res) => {
  res.send("SOOP live status cache server is running.");
});

// 시작
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);

  try {
    // 시작 직후 1회 갱신
    await refreshStatuses();
  } catch (e) {
    console.error("Initial refresh failed:", e.message);
  }

  // 12초마다 백그라운드 갱신
  setInterval(() => {
    refreshStatuses();
  }, 12000);
});