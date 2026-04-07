const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const TARGETS = [
  "arinbbidol", // 테스트용
  "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207",
  "freshtomato", "wjswlgns09", "thelddl", "alaelddl97",
  "db001202", "fpahsdltu1", "soju2022", "dlaguswl501",
  "seemin88", "2meonjin", "vldpfm2", "wlswn6565"
];

let cache = {
  checkedAt: null,
  statuses: {},
  expiresAt: 0
};

async function checkUser(browser, userId) {
  let context;
  try {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    // 불필요한 리소스 차단 (메모리 아끼기)
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      route.continue();
    });

    await page.goto(`https://www.sooplive.com/station/${userId}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    const html = await page.content();
    const isLive = /"is_live"\s*:\s*true/i.test(html) || 
                   /"onair"\s*:\s*true/i.test(html) ||
                   html.includes('live_badge');

    return { userId, isLive };
  } catch (e) {
    return { userId, isLive: false };
  } finally {
    if (context) await context.close();
  }
}

app.get("/live-status", async (req, res) => {
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  let browser;
  try {
    // Render/Docker 환경에서 가장 안정적인 실행 옵션
    browser = await chromium.launch({ 
      headless: true,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ] 
    });
    
    // 21명을 한 번에 돌리면 메모리가 터질 수 있으니, 7명씩 3묶음으로 나눠서 실행 (안정성 확보)
    const results = [];
    for (let i = 0; i < TARGETS.length; i += 7) {
      const chunk = TARGETS.slice(i, i + 7);
      const chunkResults = await Promise.all(chunk.map(id => checkUser(browser, id)));
      results.push(...chunkResults);
    }
    
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