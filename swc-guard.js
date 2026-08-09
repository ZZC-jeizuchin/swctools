// swc-guard.js — SwCTools 域名跳转 + 反爬守卫
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
    return;
  }

  // ========== 2. 反爬守卫（仅在正式域名下） ==========
  if (window.location.hostname !== MAIN_HOST) return;

  // 避免 antirobot.html 自身触发无限跳转（兼容带 .html 和不带的路径）
  if (window.location.pathname.endsWith('/antirobot.html') ||
      window.location.pathname === '/antirobot') return;

  // 优先检查登录状态（有效的 swc_token）
  const token = localStorage.getItem('swc_token');
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
          return; // 已登录，直接放行
        }
      }
    } catch (_) {}
  }

  // 未登录 → 检查 not_robot 标记
  const notRobot = document.cookie.includes('not_robot=1');
  if (notRobot === '1') {
    // 有验证标记，只放行，不再清除标记
    return;
  }

  // 未登录且无标记 → 踢去验证（路径改成 /antirobot）
  const redirectParam = encodeURIComponent(window.location.href);
  window.location.replace('/antirobot?redirect=' + redirectParam);
})();