const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

const TARGETS = [
  "brainzerg7",
  "rudals5467",
  "h78ert",
  "jihoon002",
  "hoonykkk",
  "rondobba",

];

let cache = {
  checkedAt: null,
  statuses: {},
  expiresAt: 0
};

function inferLiveFromHtml(html, userId, bodyText, currentUrl) {
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

  return checks.filter(Boolean).length >= 2;
}

async function checkUser(context, userId) {
  const page = await context.newPage();

  try {
    const url = `https://play.sooplive.com/${userId}`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    await page.waitForTimeout(1800);

    const html = await page.content();
    const currentUrl = page.url();
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText : "");

    return inferLiveFromHtml(html, userId, bodyText, currentUrl);
  } catch (error) {
    console.error(`[${userId}] detect error:`, error.message);
    return false;
  } finally {
    await page.close();
  }
}

async function refreshStatuses() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  });

  try {
    const statuses = {};

    // 6명씩 병렬 처리
    const chunkSize = 6;
    for (let i = 0; i < TARGETS.length; i += chunkSize) {
      const chunk = TARGETS.slice(i, i + chunkSize);

      const results = await Promise.all(
        chunk.map(async (userId) => {
          const isLive = await checkUser(context, userId);
          return [userId, isLive];
        })
      );

      for (const [userId, isLive] of results) {
        statuses[userId] = isLive;
      }
    }

    cache = {
      checkedAt: new Date().toISOString(),
      statuses,
      expiresAt: Date.now() + 90 * 1000
    };

    return cache;
  } finally {
    await context.close();
    await browser.close();
  }
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

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), 90000)
    );

    const data = await Promise.race([refreshStatuses(), timeoutPromise]);

    res.json({
      statuses: data.statuses,
      checkedAt: data.checkedAt,
      cached: false
    });
  } catch (error) {
    console.error("refresh failed:", error.message);

    // 실패해도 이전 캐시가 있으면 그거라도 반환
    if (cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
        checkedAt: cache.checkedAt,
        cached: true,
        stale: true,
        error: error.message
      });
    }

    res.status(500).json({
      error: "Failed to refresh statuses",
      detail: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("SOOP live checker is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});