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

  const isLive = positiveCount >= 2 && !signals.bodyOffline;

  return {
    isLive,
    positiveCount,
    signals
  };
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
    const bodyText = await page.evaluate(() =>
      document.body ? document.body.innerText : ""
    );

    const result = evaluateSignals(html, userId, bodyText, currentUrl);

    return {
      userId,
      isLive: result.isLive,
      debug: {
        currentUrl,
        positiveCount: result.positiveCount,
        offlineTextFound: result.signals.bodyOffline,
        signals: result.signals,
        bodyPreview: bodyText.slice(0, 300)
      }
    };
  } catch (error) {
    return {
      userId,
      isLive: false,
      debug: {
        error: error.message
      }
    };
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
      setTimeout(() => reject(new Error("refresh timeout")), 45000)
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