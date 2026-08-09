// swc-guard.js — SwCTools 域名跳转 + 反爬守卫（合并版）
(function () {
  const PAGES_HOST = 'swctools.pages.dev';
  const MAIN_HOST = 'swctools.dpdns.org';

  // ========== 1. 域名跳转（pages.dev → dpdns.org）==========
  if (window.location.hostname === PAGES_HOST) {
    alert(
      '⚠️ 检测到您正在通过 Cloudflare Pages 默认域名访问。\n\n' +
      '为获得更好的体验，页面即将跳转到：\n' +
      MAIN_HOST + '\n\n' +
      '（请更新您的书签）'
    );

    const targetUrl =
      window.location.protocol +
      '//' +
      MAIN_HOST +
      window.location.pathname +
      window.location.search +
      window.location.hash;

    window.location.replace(targetUrl);
    return; // 跳转中，不执行后续逻辑
  }

  // ========== 2. 反爬守卫（仅在正式域名下） ==========
  if (window.location.hostname !== MAIN_HOST) return;

  // 检查是否已登录（有效 JWT）
  const token = localStorage.getItem('swc_token');
  let isLoggedIn = false;

  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(
          decodeURIComponent(
            escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
          )
        );
        if (!payload.exp || payload.exp > Math.floor(Date.now() / 1000)) {
          isLoggedIn = true;
        }
      }
    } catch (_) {}
  }

  // 未登录 → 踢去人机验证
  if (!isLoggedIn) {
    // 避免 antirobot.html 自身触发无限跳转
    if (window.location.pathname.endsWith('/antirobot.html')) return;

    const redirectParam = encodeURIComponent(window.location.href);
    window.location.replace('/antirobot.html?redirect=' + redirectParam);
  }
})();