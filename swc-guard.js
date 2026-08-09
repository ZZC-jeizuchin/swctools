// swc-guard.js
// SwCTools domain redirect + anti bot guard

(function () {

  console.log("[SWC GUARD] loaded");

  const PAGES_HOST = 'swctools.pages.dev';
  const MAIN_HOST = 'swctools.dpdns.org';


  // pages.dev -> dpdns.org

  if (window.location.hostname === PAGES_HOST) {

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


  // 非正式域名不处理

  if (window.location.hostname !== MAIN_HOST) {
    return;
  }


  // antirobot 页面自己放行

  if (
    window.location.pathname === '/antirobot' ||
    window.location.pathname.endsWith('/antirobot.html')
  ) {
    console.log("[SWC GUARD] antirobot page");
    return;
  }



  // =========================
  // 1. 检查登录状态
  // =========================

  const token = localStorage.getItem('swc_token');


  if (token) {

    try {

      const parts = token.split('.');


      if (parts.length === 3) {

        const payload = JSON.parse(
          decodeURIComponent(
            escape(
              atob(
                parts[1]
                  .replace(/-/g, '+')
                  .replace(/_/g, '/')
              )
            )
          )
        );


        if (
          !payload.exp ||
          payload.exp > Math.floor(Date.now()/1000)
        ) {

          console.log(
            "[SWC GUARD] logged in, allow"
          );

          return;

        }

      }

    } catch(e){

      console.log(
        "[SWC GUARD] token invalid"
      );

    }

  }



  // =========================
  // 2. 未登录检查本次会话验证
  // =========================

  const verified =
    sessionStorage.getItem('swc_verified');


  if (verified === '1') {

    console.log(
      "[SWC GUARD] session verified"
    );

    return;

  }



  // =========================
  // 3. 未验证 -> Turnstile
  // =========================

  console.log(
    "[SWC GUARD] require human verification"
  );


  const redirectParam =
    encodeURIComponent(
      window.location.href
    );


  window.location.replace(
    '/antirobot?redirect=' + redirectParam
  );


})();
