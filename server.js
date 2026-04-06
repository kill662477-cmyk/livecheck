const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// 20명 → 5그룹 × 4명
const GROUPS = [
  ["brainzerg7", "rudals5467", "h78ert", "jihoon002"],
  ["hoonykkk", "rondobba", "goodzerg", "kthrs9207"],
  ["freshtomato", "wjswlgns09", "thelddl", "alaelddl97"],
  ["db001202", "fpahsdltu1", "soju2022", "dlaguswl501"],
  ["seemin88", "2meonjin", "vldpfm2", "wlswn6565"]
];

const ALL_TARGETS = GROUPS.flat();

let cache = {
  checkedAt: null,
  // 아직 검사 안한 사람은 null
  statuses: Object.fromEntries(ALL_TARGETS.map((id) => [id, null])),
  debug: {},
  expiresAt: 0,
  groupIndex: 0
};

let isRefreshing = false;
let refreshPromise = null;

function getNextGroupIndex() {
  const idx = cache.groupIndex;
  cache.groupIndex = (cache.groupIndex + 1) % GROUPS.length;
  return idx;
}

function evaluateSignals(html, userId, bodyText, currentUrl) {
  const signals = {
    liveUrlInHtml: new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(html),
    liveUrlInCurrentUrl: new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(currentUrl),
    bodyLive: /\bLIVE\b/i.test(bodyText),
    bodyOnAir: /\bONAIR\b/i.test(bodyText),
    bodyBroadcasting: /방송중/i.test(bodyText),
    bodyLiveKorean: /생방송/i.test(bodyText),
    bodyOffline:
      /Streamer is offline/i.test(bodyText) ||
      /스트리머가 오프라인입니다/i.test(bodyText) ||
      /오프라인/i.test(bodyText)
  };

  const hasChatUI =
    /채팅 참여 인원|채팅창 얼리기|채팅 저속모드|팬채팅|채팅 영역 숨기기|채팅 관리/i.test(bodyText);

  const positiveCount = Object.entries(signals)
    .filter(([key, value]) => key !== "bodyOffline" && value)
    .length;

  const isLive = (positiveCount >= 1 || hasChatUI) && !signals.bodyOffline;

  return {
    isLive,
    positiveCount,
    hasChatUI,
    signals
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

async function inspectCurrentPage(page, userId) {
  let html = await page.content();
  let currentUrl = page.url();
  let bodyText = await page.evaluate(() =>
    document.body ? document.body.innerText : ""
  );

  if (!bodyText || !bodyText.trim()) {
    await page.waitForTimeout(1500);
    html = await page.content();
    currentUrl = page.url();
    bodyText = await page.evaluate(() =>
      document.body ? document.body.innerText : ""
    );
  }

  const result = evaluateSignals(html, userId, bodyText, currentUrl);

  return {
    currentUrl,
    bodyText,
    result
  };
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

        // 1차 검사
        let inspected = await inspectCurrentPage(page, userId);

        // 첫 판정이 false면 1번 더 짧게 재검사
        if (!inspected.result.isLive) {
          await page.waitForTimeout(1500);
          inspected = await inspectCurrentPage(page, userId);
        }

        return {
          userId,
          isLive: inspected.result.isLive,
          debug: {
            checkedUrl: url,
            currentUrl: inspected.currentUrl,
            positiveCount: inspected.result.positiveCount,
            hasChatUI: inspected.result.hasChatUI,
            offlineTextFound: inspected.result.signals.bodyOffline,
            bodyPreview: inspected.bodyText.slice(0, 300)
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
    const currentGroupIndex = getNextGroupIndex();
    const targets = GROUPS[currentGroupIndex];

    console.log(
      `[refresh] checking group ${currentGroupIndex + 1}/${GROUPS.length}:`,
      targets
    );

    const results = await Promise.all(
      targets.map((userId) => checkUser(context, userId))
    );

    // 중요:
    // 이번에 검사한 사람만 업데이트
    // 이전 그룹 값은 절대 false로 초기화하지 않음
    for (const result of results) {
      cache.statuses[result.userId] = result.isLive;
      cache.debug[result.userId] = result.debug;
    }

    cache.checkedAt = new Date().toISOString();
    cache.expiresAt = Date.now() + 20 * 1000;

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
        checkedAt: cache.checkedAt,
        cached: true,
        totalGroups: GROUPS.length
      });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), 25000)
    );

    const data = await Promise.race([refreshStatusesSafe(), timeoutPromise]);

    return res.json({
      statuses: data.statuses,
      checkedAt: data.checkedAt,
      cached: false,
      groupChecked: data.groupChecked,
      totalGroups: data.totalGroups
    });
  } catch (error) {
    // 실패해도 이전 캐시 있으면 그대로 반환
    if (cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
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