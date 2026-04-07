const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// 테스트를 위해 'arinbbidol'을 맨 앞에 추가했습니다.
const TARGETS = [
  "arinbbidol", // <-- 테스트 타겟
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
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  try {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      route.continue();
    });

    // 방송국 주소로 접속
    await page.goto(`https://www.sooplive.com/station/${userId}`, {
      waitUntil: "domcontentloaded", 
      timeout: 12000 // 테스트 시 여유 있게 12초 설정
    });

    const html = await page.content();
    
    // SOOP의 라이브 플래그 확인 (is_live: true 또는 live_badge 클래스)
    const isLive = /"is_live"\s*:\s*true/i.test(html) || 
                   /"onair"\s*:\s*true/i.test(html) ||
                   html.includes('live_badge');

    return { userId, isLive };
  } catch (e) {
    console.log(`[Error] ${userId} 체크 실패:`, e.message);
    return { userId, isLive: false };
  } finally {
    await context.close();
  }
}

app.get("/live-status", async (req, res) => {
  // 테스트를 위해 캐시 시간을 5초로 대폭 줄였습니다. (실시간 확인용)
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ statuses: cache.statuses, checkedAt: cache.checkedAt, cached: true });
  }

  let browser;
  try {
    browser = await chromium.launch({ 
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] 
    });
    
    const results = await Promise.all(TARGETS.map(id => checkUser(browser, id)));
    
    const newStatuses = {};
    results.forEach(r => { newStatuses[r.userId] = r.isLive; });

    cache = {
      statuses: newStatuses,
      checkedAt: new Date().toISOString(),
      expiresAt: Date.now() + 5000 // 5초 후 만료
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