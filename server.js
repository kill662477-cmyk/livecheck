const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

// 20명 전체를 4그룹 × 5명으로 분할
const GROUPS = [
  ["brainzerg7", "rudals5467", "h78ert", "jihoon002", "hoonykkk"],
  ["rondobba", "goodzerg", "kthrs9207", "freshtomato", "wjswlgns09"],
  ["thelddl", "alaelddl97", "db001202", "fpahsdltu1", "soju2022"],
  ["dlaguswl501", "seemin88", "2meonjin", "vldpfm2", "wlswn6565"]
];

// 전체 대상 목록
const ALL_TARGETS = GROUPS.flat();

// 메모리 캐시
let cache = {
  checkedAt: null,
  statuses: Object.fromEntries(ALL_TARGETS.map((id) => [id, false])),
  expiresAt: 0,
  groupIndex: 0
};

function getNextGroupIndex() {
  const idx = cache.groupIndex;
  cache.groupIndex = (cache.groupIndex + 1) % GROUPS.length;
  return idx;
}

function inferLiveFromHtml(html, userId, bodyText, currentUrl) {
  if (!html || typeof html !== "string") return false;

  const checks = [
    new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(html),
    new RegExp(`play\\.sooplive\\.com/${userId}/\\d+`, "i").test(currentUrl),
    /방송중/i.test(bodyText),
    /생방송/i.test(bodyText),
    /\bLIVE\b/i.test(bodyText),
    /\bONAIR\b/i.test(bodyText),
    /"is_live"\s*:\s*true/i.test(html),
    /"isLive"\s*:\s*true/i.test(html),
    /"is_onair"\s*:\s*true/i.test(html),
    /"onair"\s*:\s*true/i.test(html),
    /"broad_no"\s*:\s*"?\d+"?/i.test(html),
    /"broadNo"\s*:\s*"?\d+"?/i.test(html)
  ];

  // 너무 느슨하면 오탐나므로 2개 이상 만족해야 live
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

    // JS 렌더링 대기
    await page.waitForTimeout(1800);

    const html = await page.content();
    const currentUrl = page.url();
    const bodyText = await page.evaluate(() =>
      document.body ? document.body.innerText : ""
    );

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
    const currentGroupIndex = getNextGroupIndex();
    const targets = GROUPS[currentGroupIndex];

    console.log(
      `[refresh] checking group ${currentGroupIndex + 1}/${GROUPS.length}:`,
      targets
    );

    const results = await Promise.all(
      targets.map(async (userId) => {
        const isLive = await checkUser(context, userId);
        return [userId, isLive];
      })
    );

    for (const [userId, isLive] of results) {
      cache.statuses[userId] = isLive;
    }

    cache.checkedAt = new Date().toISOString();
    cache.expiresAt = Date.now() + 60 * 1000; // 60초 캐시

    return {
      statuses: cache.statuses,
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
    // 캐시가 살아있으면 즉시 반환
    if (Date.now() < cache.expiresAt && cache.checkedAt) {
      return res.json({
        statuses: cache.statuses,
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
      checkedAt: data.checkedAt,
      cached: false,
      groupChecked: data.groupChecked,
      totalGroups: data.totalGroups
    });
  } catch (error) {
    console.error("refresh failed:", error.message);

    // 실패해도 이전 캐시가 있으면 반환
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