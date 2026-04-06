const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

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

const CHUNK_SIZE = 5;

let cache = {
  checkedAt: null,
  statuses: Object.fromEntries(TARGETS.map((id) => [id, null])),
  debug: {},
  expiresAt: 0
};

let isRefreshing = false;
let refreshPromise = null;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function judgeByOfflineText(bodyText) {
  const text = (bodyText || "").trim();

  const isOffline =
    /스트리머가 오프라인입니다/i.test(text) ||
    /Streamer is offline/i.test(text);

  if (isOffline) {
    return {
      isLive: false,
      reason: "offline-text"
    };
  }

  if (text.length >= 30) {
    return {
      isLive: true,
      reason: "non-empty-body"
    };
  }

  return {
    isLive: null,
    reason: "empty-body"
  };
}

async function preparePage(page) {
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

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false
    });
  });
}

async function getBodyText(page) {
  return await page.evaluate(() => {
    return document.body ? document.body.innerText : "";
  });
}

async function checkUser(context, userId) {
  const page = await context.newPage();
  await preparePage(page);

  const candidates = [
    `https://play.sooplive.com/${userId}`,
    `https://www.sooplive.com/station/${userId}`
  ];

  try {
    let lastError = null;

    for (const url of candidates) {
      try {
        await page.goto(url, {
          waitUntil: "commit",
          timeout: 10000
        });

        await page.waitForTimeout(1500);

        let currentUrl = page.url();
        let bodyText = await getBodyText(page);
        let judged = judgeByOfflineText(bodyText);

        // 본문이 너무 비면 한 번 더 기다렸다가 재검사
        if (judged.isLive === null) {
          await page.waitForTimeout(1500);
          currentUrl = page.url();
          bodyText = await getBodyText(page);
          judged = judgeByOfflineText(bodyText);
        }

        // 그래도 비면 false 처리
        const finalLive = judged.isLive === null ? false : judged.isLive;

        return {
          userId,
          isLive: finalLive,
          debug: {
            checkedUrl: url,
            currentUrl,
            reason: judged.reason,
            bodyLength: bodyText.length,
            bodyPreview: bodyText.slice(0, 500)
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

async function doRefresh() {
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
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
  });

  try {
    const chunks = chunkArray(TARGETS, CHUNK_SIZE);
    const nextStatuses = { ...cache.statuses };
    const nextDebug = { ...cache.debug };

    for (const group of chunks) {
      const results = await Promise.all(
        group.map((userId) => checkUser(context, userId))
      );

      for (const result of results) {
        nextStatuses[result.userId] = result.isLive;
        nextDebug[result.userId] = result.debug;
      }
    }

    cache.statuses = nextStatuses;
    cache.debug = nextDebug;
    cache.checkedAt = new Date().toISOString();
    cache.expiresAt = Date.now() + 20 * 1000;

    return {
      statuses: cache.statuses,
      debug: cache.debug,
      checkedAt: cache.checkedAt
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function refreshStatusesSafe() {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = doRefresh().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });

  return refreshPromise;
}

app.get("/live-status", async (req, res) => {
  try {
    if (Date.now() < cache.expiresAt && cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
        debug: cache.debug,
        checkedAt: cache.checkedAt,
        cached: true,
        totalTargets: TARGETS.length
      });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), 30000)
    );

    const data = await Promise.race([refreshStatusesSafe(), timeoutPromise]);

    return res.json({
      statuses: data.statuses,
      debug: data.debug,
      checkedAt: data.checkedAt,
      cached: false,
      totalTargets: TARGETS.length
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
        totalTargets: TARGETS.length
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