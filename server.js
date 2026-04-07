const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 10000;

// CORS 설정: Netlify에서 접근할 수 있도록 허용
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// 대상 리스트 (20명 전체)
const TARGETS = [
  "brainzerg7", "rudals5467", "h78ert", "jihoon002",
  "hoonykkk", "rondobba", "goodzerg", "kthrs9207",
  "freshtomato", "wjswlgns09", "thelddl", "alaelddl97",
  "db001202", "fpahsdltu1", "soju2022", "dlaguswl501",
  "seemin88", "2meonjin", "vldpfm2", "wlswn6565"
];

// 메모리 내 캐시 저장소
let cache = {
  checkedAt: null,
  statuses: {},
  expiresAt: 0
};

/**
 * 개별 유저의 방송 상태를 확인하는 핵심 함수
 */
async function checkUser(browser, userId) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    // ⚡ 속도 최적화: 불필요한 리소스(이미지, CSS, 폰트 등) 로드를 차단
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        return route.abort();
      }
      route.continue();
    });

    // 방송국 페이지 접속 (플레이어 페이지보다 가벼움)
    // waitUntil: "commit"은 서버로부터 응답 헤더를 받자마자 다음으로 넘어감을 의미 (매우 빠름)
    await page.goto(`https://www.sooplive.com/station/${userId}`, {
      waitUntil: "domcontentloaded", 
      timeout: 10000
    });

    const html = await page.content();
    
    // 🎯 정확도 최적화: HTML 소스 내의 라이브 플래그 확인
    const isLive = /"is_live"\s*:\s*true/i.test(html) || 
                   /"onair"\s*:\s*true/i.test(html) ||
                   html.includes('live_badge');

    return { userId, isLive };
  } catch (e) {
    console.log(`[Error] ${userId}: ${e.message}`);
    return { userId, isLive: false };
  } finally {
    await context.close(); // 사용한 탭(컨텍스트) 즉시 닫기
  }
}

// 라이브 상태 확인 API 엔드포인트
app.get("/live-status", async (req, res) => {
  // 1. 캐시 확인 (30초 이내 재요청 시 바로 반환)
  if (Date.now() < cache.expiresAt && cache.checkedAt) {
    return res.json({ 
      statuses: cache.statuses, 
      checkedAt: cache.checkedAt, 
      cached: true 
    });
  }

  let browser;
  try {
    // 2. 브라우저 실행
    browser = await chromium.launch({ 
      args: ["--no-sandbox", "--disable-setuid-