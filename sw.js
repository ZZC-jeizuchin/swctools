// sw.js - 预缓存 C++ 与 Python 编译环境，动态缓存所有 jsdelivr 请求
const CACHE_NAME = 'swc-compiler-final';
const BROWSERCC_VERSION = '0.1.0';
const SHIM_VERSION = '0.4.2';
const PYODIDE_VERSION = '0.26.1';

// 预缓存文件列表（C++ 编译器 + Python 运行时）
const PRECACHE_URLS = [
  // === C++ 编译器 (browsercc) ===
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/index.min.js`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/clang.js`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/clang.wasm`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/lld.js`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/lld.wasm`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/sysroot.tar`,
  `https://cdn.jsdelivr.net/npm/browsercc@${BROWSERCC_VERSION}/dist/stdc++.h.pch`,

  // === WASI shim（C++ 运行时） ===
  `https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@${SHIM_VERSION}/dist/index.js`,
  `https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@${SHIM_VERSION}/dist/clang.js`,

  // === Python 环境 (Pyodide) ===
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`,
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.asm.js`,
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.asm.wasm`,
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/python_stdlib.zip`,
  // Pyodide 动态加载的其他常见依赖（若不预缓存，也能通过动态拦截缓存）
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/distutils.tar`,
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/micropip.js`,
];

// 安装事件：预缓存所有核心文件
self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('[SW] 安装中，开始预缓存核心文件...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(PRECACHE_URLS.map(url => {
        return fetch(url, { mode: 'cors' }).then(response => {
          if (response.ok) {
            console.log(`[SW] 预缓存成功: ${url}`);
            return cache.put(url, response);
          }
          console.error(`[SW] 预缓存失败 (状态 ${response.status}): ${url}`);
        }).catch(err => {
          console.error(`[SW] 预缓存网络错误: ${url}`, err);
        });
      }));
    })
  );
});

// 激活事件：立即接管所有页面
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  console.log('[SW] 已激活，所有预缓存文件就绪');
});

// 拦截请求：对 jsdelivr 的请求优先使用缓存，同时动态添加新文件
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            console.log(`[SW] 缓存命中: ${url.pathname}`);
            return cachedResponse;
          }
          console.log(`[SW] 网络请求: ${url.pathname}`);
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
              console.log(`[SW] 新增缓存: ${url.pathname}`);
            }
            return networkResponse;
          });
        });
      })
    );
  }
});