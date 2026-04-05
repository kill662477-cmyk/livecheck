const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const GROUPS = [
  ["brainzerg7", "rudals5467", "h78ert", "jihoon002", "hoonykkk"],
  ["rondobba", "goodzerg", "kthrs9207", "freshtomato", "wjswlgns09"],
  ["thelddl", "alaelddl97", "db001202", "fpahsdltu1", "soju2022"],
  ["dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565"]
];

const ALL_TARGETS = GROUPS.flat();

let cache = {
  checkedAt: null,
  statuses: Object.fromEntries(ALL_TARGETS.map((id) => [id, null])),
  debug: {},
  expiresAt: 0,
  groupIndex: 0
};

function getNextGroupIndex() {
  const idx = cache.groupIndex;
  cache.groupIndex = (cache.groupIndex + 1) % GROUPS.length;
  return idx;
}

function evaluateSignals(html, userId, bodyText, currentUrl) {
  const signals = {
    liveUrlInHtml: new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(html),
    liveUrlInCurrentUrl: new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(currentUrl),
    stationUrlInCurrentUrl: new RegExp(`sooplive\\.com/station/${userId}`, "i").test(currentUrl),
    bodyLive: /\bLIVE\b/i.test(bodyText),
    bodyOnAir: /\bONAIR\b/i.test(bodyText),
    bodyBroadcasting: /방송중/i.test(bodyText),
    bodyLiveKorean: /생방송/i.test(bodyText),
    htmlIsLive: /"is_live"\s*:\s*true/i.test(html),
    htmlIsLiveCamel: /"isLive"\s*:\s*true/i.test(html),
    htmlOnAir: /"onair"\s*:\s*true/i.test(html),
    htmlIsOnAir: /"is_onair"\s*:\s*true/i.test(html),
    htmlBroadNo: /"broad_no"\s*:\s*"?\d+"?/i.test(html),
    htmlBroadNoCamel: /"broadNo"\s*:\s*"?\d+"?/i.test(html),
    bodyOffline: /Streamer is offline/i.test(bodyText) || /오프라인/i.test(bodyText)
  };

  const positiveCount = Object.entries(signals)
    .filter(([key, value]) => key !== "bodyOffline" && value)
    .length;

  // 너무 느슨하면 오탐 나므로 2개 이상 + 오프라인 문구 없음
  const isLive = positiveCount >= 2 && !signals.bodyOffline;

  return { isLive, positiveCount, signals };
}

async function preparePage(page) {
  // 무거운 리소스 차단해서 timeout 줄이기
  await page.route("**/*", async (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url();

    if (
      ["image", "media", "font"].includes(type) ||
      /doubleclick|googlesyndication|google-analytics|facebook|adservice|analytics|tracker/i.test(url)
    ) {
      return route.abort();
    }

    return route.continue();
  });

  // navigator.webdriver 숨기기 정도만 간단히
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false
    });
  });
}

async function gotoFast(page, url) {
  // commit은 "응답이 오고 문서 로딩이 시작되는 시점"만 기다림
  await page.goto(url, {
    waitUntil: "commit",
    timeout: 12000
  });

  // 실제 DOM/텍스트 형성 대기
  await page.waitForTimeout(2500);
}

async function checkUser(context, userId) {
  const page = await context.newPage();
  await preparePage(page);

  const candidates = [
    `https://www.sooplive.com/station/${userId}`,
    `https://play.sooplive.com/${userId}`
  ];

  try {
    let lastError = null;

    for (const url of candidates) {
      try {
        await gotoFast(page, url);

        const html = await page.content();
        const currentUrl = page.url();
        const bodyText = await page.evaluate(() =>
          document.body ? document.body.innerText : ""
        );

        const result = evaluateSignals(html, userId, bodyText, currentUrl);

        return {
          userId,
          isLive: result.isLive,
          debug: {
            checkedUrl: url,
            currentUrl,
            positiveCount: result.positiveCount,
            offlineTextFound: result.signals.bodyOffline,
            signals: result.signals,
            bodyPreview: bodyText.slice(0, 300)
          }
        };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      userId,
      isLive: false,
      debug: {
        error: lastError ? lastError.message : "unknown navigation error"
      }
    };
  } finally {
    await page.close();
  }
}

async function refreshStatuses() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  });

  try {
    const currentGroupIndex = getNextGroupIndex();
    const targets = GROUPS[currentGroupIndex];

    const results = await Promise.all(
      targets.map((userId) => checkUser(context, userId))
    );

    for (const result of results) {
      cache.statuses[result.userId] = result.isLive;
      cache.debug[result.userId] = result.debug;
    }

    cache.checkedAt = new Date().toISOString();
    cache.expiresAt = Date.now() + 60 * 1000;

    return {
      statuses: cache.statuses,
      debug: cache.debug,
      checkedAt: cache.checkedAt,
      groupChecked: currentGroupIndex + 1,
      totalGroups: GROUPS.length
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

app.get("/live-status", async (req, res) => {
  try {
    if (Date.now() < cache.expiresAt && cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
        debug: cache.debug,
        checkedAt: cache.checkedAt,
        cached: true,
        nextGroup: cache.groupIndex + 1 > GROUPS.length ? 1 : cache.groupIndex + 1,
        totalGroups: GROUPS.length
      });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), 30000)
    );

    const data = await Promise.race([refreshStatuses(), timeoutPromise]);

    return res.json({
      statuses: data.statuses,
      debug: data.debug,
      checkedAt: data.checkedAt,
      cached: false,
      groupChecked: data.groupChecked,
      totalGroups: data.totalGroups
    });
  } catch (error) {
    if (cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
        debug: cache.debug,
        checkedAt: cache.checkedAt,
        cached: true,
        stale: true,
        error: error.message,
        totalGroups: GROUPS.length
      });
    }

    return res.status(500).json({
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