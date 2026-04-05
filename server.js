const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

// 체크할 BJ 목록
const TARGETS = [
  "brainzerg7",
  "rudals5467",
  "h78ert",
  "jihoon002",
  "hoonykkk",
  "rondobba",
  "goodzerg",
  "kthrs9207",
  "freshtomato",
  "wjswlgns09",
  "thelddl",
  "alaelddl97",
  "db001202",
  "fpahsdltu1",
  "soju2022",
  "dlaguswl501",
  "seemin88",
  "2meonjin",
  "vldpfm2",
  "wlswn6565"
];

// 메모리 캐시
let cache = {
  checkedAt: null,
  statuses: {},
  expiresAt: 0
};

async function detectLiveWithBrowser(userId) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    const url = `https://play.sooplive.com/${userId}`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // JS 렌더 대기
    await page.waitForTimeout(3500);

    const html = await page.content();
    const currentUrl = page.url();

    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText : "";
    });

    const checks = [
      new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(html),
      new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(currentUrl),
      /방송중/i.test(bodyText),
      /생방송/i.test(bodyText),
      /LIVE/i.test(bodyText),
      /ONAIR/i.test(bodyText),
      /"is_live"\s*:\s*true/i.test(html),
      /"isLive"\s*:\s*true/i.test(html),
      /"is_onair"\s*:\s*true/i.test(html),
      /"onair"\s*:\s*true/i.test(html),
      /"broad_no"\s*:\s*"?\d+"?/i.test(html),
      /"broadNo"\s*:\s*"?\d+"?/i.test(html)
    ];

    const positiveCount = checks.filter(Boolean).length;

    // 너무 느슨하면 오탐나니 최소 2개 이상 만족해야 live
    return positiveCount >= 2;
  } catch (error) {
    console.error(`[${userId}] detect error`, error.message);
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function refreshStatuses() {
  const statuses = {};

  // 너무 한 번에 많이 열면 서버가 버거울 수 있으니 순차 처리
  for (const userId of TARGETS) {
    statuses[userId] = await detectLiveWithBrowser(userId);
  }

  cache = {
    checkedAt: new Date().toISOString(),
    statuses,
    expiresAt: Date.now() + 60 * 1000
  };

  return cache;
}

app.get("/live-status", async (req, res) => {
  try {
    if (Date.now() < cache.expiresAt) {
      return res.json({
        statuses: cache.statuses,
        checkedAt: cache.checkedAt,
        cached: true
      });
    }

    const data = await refreshStatuses();
    res.json({
      statuses: data.statuses,
      checkedAt: data.checkedAt,
      cached: false
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to refresh statuses",
      detail: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("SOOP live checker is running.");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});