// swc-guard.js debug version
(function () {

  console.log(
    "%c[SWC GUARD] loaded",
    "color:#00aa00;font-weight:bold"
  );

  const PAGES_HOST = 'swctools.pages.dev';
  const MAIN_HOST = 'swctools.dpdns.org';

  console.log("[SWC GUARD] hostname:", window.location.hostname);
  console.log("[SWC GUARD] pathname:", window.location.pathname);
  console.log("[SWC GUARD] cookie:", document.cookie);


  // ===== 1. pages.dev -> dpdns.org =====

  if (window.location.hostname === PAGES_HOST) {

    console.log("[SWC GUARD] pages.dev detected, redirecting");

    const targetUrl =
      window.location.protocol +
      '//' +
      MAIN_HOST +
      window.location.pathname +
      window.location.search +
      window.location.hash;

    console.log("[SWC GUARD] target:", targetUrl);

    window.location.replace(targetUrl);
    return;
  }


  // ===== 2. 只保护正式域名 =====

  if (window.location.hostname !== MAIN_HOST) {

    console.log(
      "[SWC GUARD] not main host, skip"
    );

    return;
  }


  // ===== 3. antirobot 页面放行 =====

  if (
    window.location.pathname.endsWith('/antirobot.html') ||
    window.location.pathname === '/antirobot'
  ) {

    console.log(
      "[SWC GUARD] antirobot page, skip"
    );

    return;
  }


  // ===== 4. 登录检查 =====

  const token = localStorage.getItem('swc_token');

  console.log(
    "[SWC GUARD] swc_token:",
    token ? "exists" : "none"
  );


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


        console.log(
          "[SWC GUARD] token payload:",
          payload
        );


        if (
          !payload.exp ||
          payload.exp > Math.floor(Date.now()/1000)
        ) {

          console.log(
            "[SWC GUARD] valid login, allow"
          );

          return;
        }

      }

    } catch(e) {

      console.log(
        "[SWC GUARD] token parse failed:",
        e
      );

    }

  }


  // ===== 5. 人机验证 cookie =====

  const cookieValue =
    document.cookie;

  const notRobot =
    cookieValue.includes('not_robot=1');


  console.log(
    "[SWC GUARD] not_robot cookie:",
    notRobot
  );


  if (notRobot) {

    console.log(
      "%c[SWC GUARD] verified human, allow",
      "color:#00aa00;font-weight:bold"
    );

    return;
  }


  // ===== 6. 跳转验证 =====

  const redirectParam =
    encodeURIComponent(window.location.href);


  console.log(
    "[SWC GUARD] no verification, redirect antirobot"
  );

  console.log(
    "[SWC GUARD] redirect url:",
    '/antirobot?redirect=' + redirectParam
  );


  window.location.replace(
    '/antirobot?redirect=' + redirectParam
  );


})();
