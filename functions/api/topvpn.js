const interceptorScript = `
  <script>
    (function() {
      const proxyBase = '/api/topvpn?url=';
      const originalUrl = ${JSON.stringify(finalUrl.href)};

      // 控制栏 UI
      const bar = document.createElement('div');
      bar.id = '__topvpn_bar__';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>' +
        '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">' +
        '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>' +
        '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>';
      document.documentElement.prepend(bar);
      document.documentElement.style.paddingTop = '48px';

      const urlInput = document.getElementById('__topvpn_url__');
      urlInput.value = originalUrl;
      urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          let val = this.value.trim();
          if (!val) return;
          if (!/^https?:\\/\\//i.test(val)) val = 'https://' + val;
          window.location.assign(proxyBase + encodeURIComponent(val));
        }
      });
      document.getElementById('__topvpn_refresh__').addEventListener('click', () => location.reload());
      document.getElementById('__topvpn_home__').addEventListener('click', () => {
        window.location.href = '/topvpn.html';
      });

      // 代理 URL 转换
      function proxyUrl(inputUrl) {
        if (!inputUrl && inputUrl !== 0) return inputUrl;
        if (inputUrl.startsWith(proxyBase)) return inputUrl;
        try {
          const absolute = new URL(inputUrl, originalUrl).href;
          return proxyBase + encodeURIComponent(absolute);
        } catch (e) { return inputUrl; }
      }

      // 保存原始方法
      const originalAssign = window.location.assign.bind(window.location);
      const originalReplace = window.location.replace.bind(window.location);
      const originalPushState = history.pushState.bind(history);
      const originalReplaceState = history.replaceState.bind(history);
      const originalOpen = window.open.bind(window);
      const originalFormSubmit = HTMLFormElement.prototype.submit;

      // ---- 锁定所有导航方法 ----
      // href setter
      const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
      if (hrefDesc && hrefDesc.set) {
        Object.defineProperty(Location.prototype, 'href', {
          get: hrefDesc.get,
          set: function(url) { originalAssign(proxyUrl(url)); },
          configurable: false
        });
      }
      Object.defineProperty(window.location, 'assign', {
        value: function(url) { return originalAssign(proxyUrl(url)); },
        writable: false, configurable: false
      });
      Object.defineProperty(window.location, 'replace', {
        value: function(url) { return originalReplace(proxyUrl(url)); },
        writable: false, configurable: false
      });
      Object.defineProperty(history, 'pushState', {
        value: function(state, title, url) {
          if (url) arguments[2] = proxyUrl(url);
          return originalPushState.apply(history, arguments);
        },
        writable: false, configurable: false
      });
      Object.defineProperty(history, 'replaceState', {
        value: function(state, title, url) {
          if (url) arguments[2] = proxyUrl(url);
          return originalReplaceState.apply(history, arguments);
        },
        writable: false, configurable: false
      });

      // 拦截 window.open：转为代理链接，但保持新窗口行为（如果 target 指定）
      window.open = function(url, target, features) {
        if (url && typeof url === 'string') {
          url = proxyUrl(url);
        }
        // 如果原 target 是 _blank 或新窗口名，我们仍允许打开新窗口，但 URL 已经代理
        return originalOpen(url, target, features);
      };

      // 拦截 fetch / XHR
      const originalFetch = window.fetch;
      window.fetch = function(input, init) {
        if (typeof input === 'string') return originalFetch(proxyUrl(input), init);
        if (input instanceof Request) return originalFetch(new Request(proxyUrl(input.url), input), init);
        return originalFetch(proxyUrl(input.toString()), init);
      };
      const OriginalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new OriginalXHR();
        const originalXHROpen = xhr.open;
        xhr.open = function(method, url, async, user, password) {
          arguments[1] = proxyUrl(url);
          return originalXHROpen.apply(xhr, arguments);
        };
        return xhr;
      };

      // ---- 核心：拦截所有链接点击，包括 target="_blank" ----
      document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (!link) return;
        const rawHref = link.getAttribute('href');
        // 跳过空链接或特殊协议
        if (!rawHref || /^(javascript:|mailto:|#)/i.test(rawHref)) return;
        // 阻止所有默认行为，无论 target 是什么
        e.preventDefault();
        e.stopImmediatePropagation(); // 防止页面自己的监听器干扰
        // 始终在当前窗口通过代理打开
        window.location.assign(rawHref);
      }, true);

      // ---- 表单提交拦截：强制所有 target 转为当前窗口 ----
      function handleFormSubmit(form, submitter) {
        // 忽略 POST 等非 GET 的复杂表单（可保持默认行为，但需要确保不跳出代理）
        const method = (form.method || 'get').toLowerCase();
        if (method !== 'get') {
          // 对于 POST 表单，我们暂时阻止默认，改为 GET 代理跳转（参数附加到 URL）
          // 如果必须保留 POST，则需要更复杂的 fetch 模拟，这里简化处理
        }
        const formData = new FormData(form);
        const params = new URLSearchParams(formData).toString();
        let action = (submitter && submitter.getAttribute('formaction')) || form.getAttribute('action') || originalUrl;
        let actionUrl;
        try {
          actionUrl = new URL(action, originalUrl);
        } catch {
          actionUrl = new URL(originalUrl);
        }
        // 只处理 GET 方式，将参数放入 URL
        if (method === 'get') {
          actionUrl.search = params;
        } else {
          // 对于 POST，简单地将参数作为 query string 拼接到 URL（可能不兼容复杂表单）
          actionUrl.search = params;
        }
        // 通过代理 assign，在当前窗口打开
        window.location.assign(actionUrl.href);
      }

      // submit 事件（捕获阶段）
      document.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleFormSubmit(e.target, e.submitter);
      }, true);

      // 覆盖 form.submit() 方法
      HTMLFormElement.prototype.submit = function() {
        handleFormSubmit(this, null);
      };

    })();
  </script>
`;