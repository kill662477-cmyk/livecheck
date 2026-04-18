const express = require("express");
const { chromium } = require("playwright");

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
  "soju2022", "dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565", "sksmsskdsl10"
];

let cache = {
  checkedAt: null,
  statuses: {},
  expiresAt: 0
};

// 개별 유저 체크 함수 (최대한 가볍게)
async function checkUser(browser, userId) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    // 불필요한 리소스 차단 (메모리 절약의 핵심)
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) return route.abort();
      route.continue();
    });

    // 스테이션 페이지 접속
    await page.goto(`https://www.sooplive.com/station/${userId}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    // 1.5초 대기 (스크립트 실행 시간 확보)
    await page.waitForTimeout(1500);

    const html = await page.content();
    
    // 가장 확실한 라이브 판정 시그널
    const isLive = html.includes('live_badge') || 
                   html.includes('"is_live":true') || 
                   html.includes('"onair":true') ||
                   /class="[^"]*live[^"]*"/.test(html);

    return { userId, isLive };
  } catch (e) {
    return { userId, isLive: false };
  } finally {
    await context.close();
  }
}

app.get("/live-status", async (req, res) => {
  // 캐시 확인 (30초)
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  let browser;
  try {
    browser = await chromium.launch({ 
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
    });

    // [중요] 20명을 5명씩 4세트로 나누어 실행 (메모리 폭주 방지하면서도 한 번에 결과 도출)
    const allResults = [];
    for (let i = 0; i < TARGETS.length; i += 5) {
      const chunk = TARGETS.slice(i, i + 5);
      const chunkResults = await Promise.all(chunk.map(id => checkUser(browser, id)));
      allResults.push(...chunkResults);
    }

    const newStatuses = {};
    allResults.forEach(r => { newStatuses[r.userId] = r.isLive; });

    cache = {
      statuses: newStatuses,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + 30000 // 30초 캐시
    };

    res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/", (req, res) => {
  res.send("SOOP Live Checker is running!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on port ${PORT}`);
});