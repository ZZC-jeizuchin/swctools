// ai-core.js — 基础工具、存储、配置、同步、调试模式
window.SWC = window.SWC || {};
(function (SWC) {
  "use strict";

  // ═══════════════════ 主题 ═══════════════════
  SWC.applyTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('swc_theme', t);
  };
  SWC.applyTheme(localStorage.getItem('swc_theme') || 'light');

  // ═══════════════════ 基础工具 ═══════════════════
  SWC.uuid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  SWC.esc = function (s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  SWC.fmtTime = function (ts) {
    if (!ts) return '';
    const d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString())
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate();
  };
  SWC.getToken = function () { return localStorage.getItem('swc_token') || ''; };

  SWC.showDiag = function (title, lines) {
    document.getElementById('diagTitle').textContent = title;
    document.getElementById('diagBody').innerHTML = lines.map(l => {
      if (typeof l === 'string') return SWC.esc(l);
      return '<span class="l">' + SWC.esc(l.k) + '</span>: <span class="v">' + SWC.esc(String(l.v)) + '</span>';
    }).join('\n');
    document.getElementById('diagModal').classList.add('show');
  };

  let toastTimer = null;
  SWC.showToast = function (msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
  };

  // ═══════════════════ 调试模式 ═══════════════════
  const DEBUG_KEY = 'swc_ai_debug';
  SWC.isDebugMode = function () { return localStorage.getItem(DEBUG_KEY) === '1'; };
  SWC.setDebugMode = function (on) { localStorage.setItem(DEBUG_KEY, on ? '1' : '0'); };
  SWC.debugLog = function (title, lines) {
    if (!SWC.isDebugMode()) return;
    SWC.showDiag('[🐞 ' + title + ']', lines);
  };
  SWC.debugError = function (title, lines) {
    // 错误始终弹出，不只在调试模式下
    SWC.showDiag('❌ ' + title, lines);
  };

  // ═══════════════════ Markdown + KaTeX ═══════════════════
  SWC.md = function (t) {
    if (!t) return '';
    const mathBlocks = [];
    let text = String(t);
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, body) => { mathBlocks.push({ display: true, body }); return '@@@SWCMATH_' + (mathBlocks.length - 1) + '@@@'; });
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (m, body) => { mathBlocks.push({ display: true, body }); return '@@@SWCMATH_' + (mathBlocks.length - 1) + '@@@'; });
    text = text.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (m, body) => { mathBlocks.push({ display: false, body }); return '@@@SWCMATH_' + (mathBlocks.length - 1) + '@@@'; });
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (m, body) => { mathBlocks.push({ display: false, body }); return '@@@SWCMATH_' + (mathBlocks.length - 1) + '@@@'; });
    let html;
    try { html = marked.parse(text); } catch { return SWC.esc(t); }
    try { html = DOMPurify.sanitize(html); } catch { return SWC.esc(t); }
    if (mathBlocks.length > 0) {
      html = html.replace(/@@@SWCMATH_(\d+)@@@/g, (m, idx) => {
        const item = mathBlocks[parseInt(idx, 10)];
        if (!item) return '';
        try {
          if (window.katex && typeof window.katex.renderToString === 'function') {
            return window.katex.renderToString(item.body, { displayMode: item.display, throwOnError: false, output: 'html', strict: false });
          }
        } catch {}
        return SWC.esc(item.display ? '$$' + item.body + '$$' : '$' + item.body + '$');
      });
    }
    return html;
  };

  // ═══════════════════ Cookie ═══════════════════
  SWC.setCookie = function (name, value, days) {
    days = days || 365;
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
  };
  SWC.getCookie = function (name) {
    const m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : '';
  };
  SWC.delCookie = function (name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
  };

  // ═══════════════════ 全局状态 ═══════════════════
  SWC.state = {
    curId: null,
    curMeta: null,
    curTurns: [],
    runningConvs: new Map(),
    modelConfigs: [],
    currentModelConfigId: '',
    searchConfigs: [],
    currentSearchConfigId: '',
    modelsCache: [],
    syncStates: {},
    syncing: false,
    editingModelConfigId: null,
    editingSearchConfigId: null
  };

  // ═══════════════════ 模型配置 ═══════════════════
  const CFG_PREFIX = 'swc_ai_cfg_';
  const CFG_IDX_KEY = 'swc_ai_cfg_index';
  const CUR_KEY = 'swc_ai_current';

  SWC.defaultModelConfig = function (name) {
    return {
      id: SWC.uuid(),
      name: name || '模型配置 1',
      proxyUrl: '/api/aiapi',
      proxyPassword: '',
      apiBase: '',
      fallbackModelsUrl: '',
      manualModels: '',
      modelMode: 'auto',
      cfAccountId: '',
      apiKey: '',
      systemPrompt: '你是一个乐于助人的AI助手。',
      temperature: null,
      autoCollapseReason: true,
      ctxWindow: 64000,
      summaryThreshold: 75,
      model: '',
      savedAt: Date.now()
    };
  };

  SWC.loadModelConfigIndex = function () {
    try { const r = localStorage.getItem(CFG_IDX_KEY); return r ? JSON.parse(r) : []; }
    catch { return []; }
  };
  SWC.saveModelConfigIndex = function (index) {
    try { localStorage.setItem(CFG_IDX_KEY, JSON.stringify(index)); } catch {}
  };
  SWC.loadModelConfigs = function () {
    const index = SWC.loadModelConfigIndex();
    const arr = [];
    for (const item of index) {
      try {
        const raw = localStorage.getItem(CFG_PREFIX + item.id);
        if (!raw) continue;
        arr.push(JSON.parse(raw));
      } catch {}
    }
    return arr;
  };
  SWC.saveModelConfig = function (c) {
    c.savedAt = Date.now();
    try { localStorage.setItem(CFG_PREFIX + c.id, JSON.stringify(c)); } catch {}
    let index = SWC.loadModelConfigIndex();
    index = index.filter(x => x.id !== c.id);
    index.unshift({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt, apiBase: c.apiBase || '', model: c.model || '' });
    SWC.saveModelConfigIndex(index);
  };
  SWC.deleteModelConfigLocal = function (id) {
    localStorage.removeItem(CFG_PREFIX + id);
    let index = SWC.loadModelConfigIndex();
    index = index.filter(x => x.id !== id);
    SWC.saveModelConfigIndex(index);
  };
  SWC.curModelConfig = function () {
    const list = SWC.state.modelConfigs;
    return list.find(c => c.id === SWC.state.currentModelConfigId) || list[0];
  };
  SWC.modelConfigById = function (id) {
    return SWC.state.modelConfigs.find(c => c.id === id);
  };

  (function migrateOldModelConfigs() {
    try {
      const oldIds = SWC.getCookie('swc_ai_cfg_ids');
      if (!oldIds) return;
      let ids = [];
      try { ids = JSON.parse(oldIds); } catch { ids = []; }
      if (ids.length === 0) { SWC.delCookie('swc_ai_cfg_ids'); return; }
      const idx = SWC.loadModelConfigIndex();
      const existing = new Set(idx.map(x => x.id));
      for (const id of ids) {
        if (existing.has(id)) { SWC.delCookie(CFG_PREFIX + id); continue; }
        const raw = SWC.getCookie(CFG_PREFIX + id);
        if (!raw) continue;
        try {
          const c = JSON.parse(raw);
          if (!c.savedAt) c.savedAt = Date.now();
          if (!c.fallbackModelsUrl) c.fallbackModelsUrl = '';
          if (!c.manualModels) c.manualModels = '';
          if (!c.modelMode) c.modelMode = 'auto';
          if (!c.cfAccountId) c.cfAccountId = '';
          localStorage.setItem(CFG_PREFIX + c.id, JSON.stringify(c));
          idx.push({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt, apiBase: c.apiBase || '', model: c.model || '' });
        } catch {}
        SWC.delCookie(CFG_PREFIX + id);
      }
      SWC.saveModelConfigIndex(idx);
      SWC.delCookie('swc_ai_cfg_ids');
    } catch {}
  })();

  SWC.state.modelConfigs = SWC.loadModelConfigs();
  SWC.state.currentModelConfigId = SWC.getCookie(CUR_KEY) || '';
  if (SWC.state.modelConfigs.length === 0) {
    const c = SWC.defaultModelConfig('模型配置 1');
    SWC.state.modelConfigs = [c];
    SWC.state.currentModelConfigId = c.id;
    SWC.saveModelConfig(c);
    SWC.setCookie(CUR_KEY, c.id);
  }
  if (!SWC.state.modelConfigs.find(c => c.id === SWC.state.currentModelConfigId)) {
    SWC.state.currentModelConfigId = SWC.state.modelConfigs[0].id;
    SWC.setCookie(CUR_KEY, SWC.state.currentModelConfigId);
  }

  // ═══════════════════ 搜索配置（含旧配置自动升级）═══════════════════
  const SEARCH_PREFIX = 'swc_ai_search_';
  const SEARCH_IDX_KEY = 'swc_ai_search_index';
  const SEARCH_CUR_KEY = 'swc_ai_search_current';

  SWC.defaultSearchConfig = function (name) {
    const mc = SWC.curModelConfig();
    return {
      id: SWC.uuid(),
      name: name || '搜索配置 1',
      proxyUrl: (mc && mc.proxyUrl) || '/api/aiapi',
      proxyPassword: (mc && mc.proxyPassword) || '',
      searchProvider: 'tavily',
      tavilyApiKey: '',
      serperApiKey: '',
      searchMode: 'agent',
      maxSearchRounds: 3,
      systemHint: '',
      enabled: false,
      savedAt: Date.now()
    };
  };

  SWC.loadSearchConfigIndex = function () {
    try { const r = localStorage.getItem(SEARCH_IDX_KEY); return r ? JSON.parse(r) : []; }
    catch { return []; }
  };
  SWC.saveSearchConfigIndex = function (index) {
    try { localStorage.setItem(SEARCH_IDX_KEY, JSON.stringify(index)); } catch {}
  };
  SWC.loadSearchConfigs = function () {
    const index = SWC.loadSearchConfigIndex();
    const arr = [];
    for (const item of index) {
      try {
        const raw = localStorage.getItem(SEARCH_PREFIX + item.id);
        if (!raw) continue;
        const c = JSON.parse(raw);
        // ★ 旧配置自动升级
        let changed = false;
        if (!c.searchMode) { c.searchMode = 'agent'; changed = true; }
        if (!c.maxSearchRounds) { c.maxSearchRounds = 3; changed = true; }
        if (c.systemHint === undefined) { c.systemHint = ''; changed = true; }
        if (c.tavilyApiKey === undefined) { c.tavilyApiKey = ''; changed = true; }
        if (c.serperApiKey === undefined) { c.serperApiKey = ''; changed = true; }
        if (!c.searchProvider) { c.searchProvider = 'tavily'; changed = true; }
        if (changed) {
          localStorage.setItem(SEARCH_PREFIX + c.id, JSON.stringify(c));
        }
        arr.push(c);
      } catch {}
    }
    return arr;
  };
  SWC.saveSearchConfig = function (c) {
    c.savedAt = Date.now();
    try { localStorage.setItem(SEARCH_PREFIX + c.id, JSON.stringify(c)); } catch {}
    let index = SWC.loadSearchConfigIndex();
    index = index.filter(x => x.id !== c.id);
    index.unshift({
      id: c.id, name: c.name || '未命名', savedAt: c.savedAt,
      provider: c.searchProvider || 'tavily',
      mode: c.searchMode || 'agent',
      enabled: c.enabled === true
    });
    SWC.saveSearchConfigIndex(index);
  };
  SWC.deleteSearchConfigLocal = function (id) {
    localStorage.removeItem(SEARCH_PREFIX + id);
    let index = SWC.loadSearchConfigIndex();
    index = index.filter(x => x.id !== id);
    SWC.saveSearchConfigIndex(index);
  };
  SWC.curSearchConfig = function () {
    const list = SWC.state.searchConfigs;
    return list.find(c => c.id === SWC.state.currentSearchConfigId) || list[0];
  };

  SWC.state.searchConfigs = SWC.loadSearchConfigs();
  SWC.state.currentSearchConfigId = SWC.getCookie(SEARCH_CUR_KEY) || '';
  if (SWC.state.searchConfigs.length === 0) {
    const c = SWC.defaultSearchConfig('搜索配置 1');
    SWC.state.searchConfigs = [c];
    SWC.state.currentSearchConfigId = c.id;
    SWC.saveSearchConfig(c);
    SWC.setCookie(SEARCH_CUR_KEY, c.id);
  }
  if (!SWC.state.searchConfigs.find(c => c.id === SWC.state.currentSearchConfigId)) {
    SWC.state.currentSearchConfigId = SWC.state.searchConfigs[0].id;
    SWC.setCookie(SEARCH_CUR_KEY, SWC.state.currentSearchConfigId);
  }

  // ═══════════════════ 工具支持缓存 ═══════════════════
  const TOOL_SUPPORT_KEY = 'swc_ai_tool_support';
  const TOOL_SUPPORT_TTL = 7 * 24 * 3600 * 1000; // 7 天

  SWC.loadToolSupportCache = function () {
    try { const r = localStorage.getItem(TOOL_SUPPORT_KEY); return r ? JSON.parse(r) : {}; }
    catch { return {}; }
  };
  SWC.saveToolSupportCache = function (c) {
    try { localStorage.setItem(TOOL_SUPPORT_KEY, JSON.stringify(c)); } catch {}
  };
  SWC.isModelSupportTools = function (model) {
    const cache = SWC.loadToolSupportCache();
    const v = cache[model];
    if (v === undefined) return true;           // 无记录 → 默认支持
    if (v === false) {                          // 旧格式（永久标记）→ 升级成带 TTL 的新格式
      cache[model] = { ok: false, until: Date.now() + TOOL_SUPPORT_TTL };
      SWC.saveToolSupportCache(cache);
      return false;
    }
    if (v.ok === false) {
      if (v.until && v.until <= Date.now()) {   // 已过期，清除并重试
        delete cache[model];
        SWC.saveToolSupportCache(cache);
        return true;
      }
      return false;
    }
    return true;
  };
  SWC.markModelNoToolSupport = function (model) {
    const cache = SWC.loadToolSupportCache();
    cache[model] = { ok: false, until: Date.now() + TOOL_SUPPORT_TTL };
    SWC.saveToolSupportCache(cache);
  };

  // ═══════════════════ 会话存储层 ═══════════════════
  const IDX_KEY = 'swc_ai_index';
  const P = 'swc_ai_conv:';

  SWC.upgradeMeta = function (m) {
    if (!m) return m;
    if (m.schema >= 2) return m;
    return { ...m, schema: 2, savedAt: m.savedAt || m.updatedAt || m.createdAt || Date.now() };
  };

  SWC.S = {
    idx() { try { const r = localStorage.getItem(IDX_KEY); return r ? JSON.parse(r) : []; } catch { return []; } },
    setIdx(v) { localStorage.setItem(IDX_KEY, JSON.stringify(v)); },
    add(id) { const a = this.idx(); if (!a.includes(id)) { a.unshift(id); this.setIdx(a); } },
    rem(id) { this.setIdx(this.idx().filter(x => x !== id)); },
    meta(id) {
      try {
        const r = localStorage.getItem(P + id + ':meta');
        if (!r) return null;
        return SWC.upgradeMeta(JSON.parse(r));
      } catch { return null; }
    },
    setMeta(id, m) { m.schema = 2; localStorage.setItem(P + id + ':meta', JSON.stringify(m)); },
    delMeta(id) { localStorage.removeItem(P + id + ':meta'); },
    turn(id, n) { try { const r = localStorage.getItem(P + id + ':turn:' + n); return r ? JSON.parse(r) : null; } catch { return null; } },
    setTurn(id, n, t) { localStorage.setItem(P + id + ':turn:' + n, JSON.stringify(t)); },
    delTurn(id, n) { localStorage.removeItem(P + id + ':turn:' + n); },
    turns(id, c) { const a = []; for (let i = 0; i < c; i++) { const t = this.turn(id, i); if (t) a.push(t); } return a; },
    delConv(id) {
      const m = this.meta(id); const c = m?.turnCount || 0;
      for (let i = 0; i < c; i++) this.delTurn(id, i);
      this.delMeta(id); this.rem(id);
    },
    metas() { return this.idx().map(id => this.meta(id)).filter(Boolean); },
    rewriteTurns(id, turns) {
      const m = this.meta(id); if (!m) return;
      const old = m.turnCount || 0;
      for (let i = 0; i < Math.max(old, turns.length); i++) this.delTurn(id, i);
      turns.forEach((t, i) => this.setTurn(id, i, t));
      m.turnCount = turns.length;
      m.savedAt = Date.now();
      m.schema = 2;
      this.setMeta(id, m);
    },
    replaceConv(id, meta, turns) {
      const old = this.meta(id);
      if (old && old.turnCount) { for (let i = 0; i < old.turnCount; i++) this.delTurn(id, i); }
      meta.schema = 2;
      this.setMeta(id, meta);
      (turns || []).forEach((t, i) => this.setTurn(id, i, t));
      this.add(id);
    }
  };

  // ═══════════════════ 同步状态 ═══════════════════
  const SYNC_KEY = 'swc_ai_sync_states';
  SWC.loadSyncStates = function () {
    try { const r = localStorage.getItem(SYNC_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
  };
  SWC.saveSyncStates = function (states) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(states)); } catch {} };
  SWC.state.syncStates = SWC.loadSyncStates();
  SWC.setSyncState = function (id, state) {
    SWC.state.syncStates[id] = state;
    SWC.saveSyncStates(SWC.state.syncStates);
    if (SWC.renderConvList) SWC.renderConvList();
  };
  SWC.getSyncState = function (id) { return SWC.state.syncStates[id] || 'unknown'; };
  SWC.delSyncState = function (id) { delete SWC.state.syncStates[id]; SWC.saveSyncStates(SWC.state.syncStates); };

  // ═══════════════════ 上下文管理 ═══════════════════
  SWC.CTX = {
    tk(t) {
      if (!t) return 0;
      let b = 0;
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        b += c < 0x80 ? 1 : (c < 0x800 ? 2 : 3);
      }
      return Math.ceil(b / 3);
    },
    build(turns, o) {
      o = o || {};
      const sys = o.systemPrompt || '';
      const sum = o.summary || '';
      const win = o.ctxWindow || 64000;
      const thr = o.summaryThreshold || 75;
      const max = Math.floor(win * thr / 100);
      const msgs = [];
      let fixed = 0;
      if (sys) { msgs.push({ role: 'system', content: sys }); fixed += this.tk(sys) + 4; }
      if (sum) { const s = '以下是之前对话的摘要：\n\n' + sum; msgs.push({ role: 'system', content: s }); fixed += this.tk(s) + 4; }
      const recent = []; let run = fixed;
      for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        const total = this.tk(t.user.content) + this.tk(t.assistant.content) + 8;
        if (run + total > max && recent.length >= 3) break;
        recent.unshift(t); run += total;
      }
      for (const t of recent) {
        msgs.push({ role: 'user', content: t.user.content });
        if (t.assistant.content) msgs.push({ role: 'assistant', content: t.assistant.content });
      }
      return { messages: msgs, usedTokens: run };
    }
  };

  // ═══════════════════ 模型缓存 ═══════════════════
  SWC.modelsCacheKey = function () { return 'swc_ai_models_' + SWC.state.currentModelConfigId; };
  SWC.loadModelsCache = function () {
    try { const r = localStorage.getItem(SWC.modelsCacheKey()); return r ? JSON.parse(r) : []; }
    catch { return []; }
  };
  SWC.saveModelsCache = function (list) { localStorage.setItem(SWC.modelsCacheKey(), JSON.stringify(list)); };
  SWC.state.modelsCache = SWC.loadModelsCache();

  // ═══════════════════ 云 API ═══════════════════
  SWC.cloudApi = async function (opts) {
    const token = SWC.getToken();
    if (!token) return { error: 'unauthorized' };
    let url = '/api/ai-conv';
    const params = [];
    if (opts.type) params.push('type=' + encodeURIComponent(opts.type));
    if (opts.id) params.push('id=' + encodeURIComponent(opts.id));
    if (opts.meta) params.push('meta=1');
    if (params.length) url += '?' + params.join('&');
    const fetchOpts = { method: opts.method || 'GET', headers: { 'Authorization': 'Bearer ' + token } };
    if (opts.body) {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(opts.body);
    }
    try {
      const res = await fetch(url, fetchOpts);
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) return { error: 'http-' + res.status, body: text.slice(0, 500) };
      return data;
    } catch (e) {
      return { error: 'network', detail: e.message };
    }
  };

  // ═══════════════════ 会话云同步 ═══════════════════
  SWC.updateProgress = function (elId, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (text) { el.textContent = text; el.classList.add('show'); }
    else { el.textContent = ''; el.classList.remove('show'); }
  };

  SWC.uploadConv = async function (id) {
    const m = SWC.S.meta(id); if (!m) return false;
    const turns = SWC.S.turns(id, m.turnCount || 0);
    const r = await SWC.cloudApi({ method: 'PUT', body: { id, conversation: { ...m, turns } } });
    return !r.error;
  };
  SWC.downloadConv = async function (id) {
    const r = await SWC.cloudApi({ id });
    if (r.error || !r.conversation) return false;
    const c = r.conversation;
    const meta = SWC.upgradeMeta(c);
    const turns = Array.isArray(c.turns) ? c.turns : [];
    SWC.S.replaceConv(id, meta, turns);
    return true;
  };

  SWC.syncAll = async function (silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) { if (!silent) SWC.showDiag('未登录', ['请先在主站登录。']); return { error: 'unauthorized' }; }
    SWC.state.syncing = true;
    let uploaded = 0, downloaded = 0, skipped = 0, failed = 0;
    try {
      if (!silent) SWC.updateProgress('cloudProgress', '正在读取云端索引...');
      const cloudData = await SWC.cloudApi({});
      if (cloudData.error) {
        if (!silent) SWC.showDiag('同步失败：拉取索引', [{ k: '错误', v: cloudData.error }, { k: '详情', v: cloudData.body || cloudData.detail || '' }]);
        return { error: cloudData.error };
      }
      const cloudIndex = Array.isArray(cloudData.index) ? cloudData.index : [];
      const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
      const localIds = SWC.S.idx();
      const localMap = new Map();
      for (const id of localIds) { const m = SWC.S.meta(id); if (m) localMap.set(id, m); }
      const toUpload = [], toDownload = [];
      for (const [id, lm] of localMap) {
        const cm = cloudMap.get(id);
        if (!cm) { toUpload.push(id); continue; }
        const lt = lm.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) toUpload.push(id);
        else if (ct > lt) toDownload.push(id);
        else { skipped++; SWC.setSyncState(id, 'synced'); }
      }
      for (const [id] of cloudMap) if (!localMap.has(id)) toDownload.push(id);
      const total = toUpload.length + toDownload.length;
      for (let i = 0; i < toUpload.length; i++) {
        const id = toUpload[i];
        if (!silent) SWC.updateProgress('cloudProgress', `上传中 ${i + 1}/${total}...`);
        if (SWC.state.runningConvs.has(id)) { skipped++; continue; }
        const ok = await SWC.uploadConv(id);
        if (ok) { uploaded++; SWC.setSyncState(id, 'synced'); }
        else { failed++; SWC.setSyncState(id, 'failed'); }
      }
      for (let i = 0; i < toDownload.length; i++) {
        const id = toDownload[i];
        if (!silent) SWC.updateProgress('cloudProgress', `下载中 ${i + 1}/${total}...`);
        if (SWC.state.runningConvs.has(id)) { skipped++; continue; }
        const ok = await SWC.downloadConv(id);
        if (ok) { downloaded++; SWC.setSyncState(id, 'synced'); }
        else { failed++; SWC.setSyncState(id, 'failed'); }
      }
      if (!silent) {
        SWC.updateProgress('cloudProgress', '');
        alert(`同步完成\n上传 ${uploaded} 个，下载 ${downloaded} 个，跳过 ${skipped} 个，失败 ${failed} 个`);
      }
      if (downloaded > 0 && SWC.renderChat) {
        if (!SWC.state.curId && SWC.S.idx().length > 0 && SWC.loadConv) SWC.loadConv(SWC.S.idx()[0]);
        SWC.renderChat();
      } else if (SWC.renderConvList) SWC.renderConvList();
      return { uploaded, downloaded, skipped, failed };
    } finally { SWC.state.syncing = false; }
  };

  SWC.syncOne = async function (id, silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) return { error: 'unauthorized' };
    if (SWC.state.runningConvs.has(id)) { if (!silent) alert('此对话正在生成中，请稍后同步。'); return { error: 'generating' }; }
    const lm = SWC.S.meta(id); if (!lm) return { error: 'not-found' };
    SWC.state.syncing = true;
    try {
      if (!silent) SWC.updateProgress('cloudProgress', '查询云端状态...');
      const r = await SWC.cloudApi({ id, meta: true });
      if (r.error === 'http-404') {
        const ok = await SWC.uploadConv(id);
        if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('cloudProgress', '');
        return { ok };
      }
      if (r.error) {
        if (!silent) SWC.showDiag('同步失败', [{ k: '会话 id', v: id }, { k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]);
        if (!silent) SWC.updateProgress('cloudProgress', '');
        return { error: r.error };
      }
      const cm = r.meta;
      const lt = lm.savedAt || 0, ct = (cm && cm.savedAt) || 0;
      if (lt === ct && cm) { SWC.setSyncState(id, 'synced'); if (!silent) SWC.updateProgress('cloudProgress', ''); return { ok: true, direction: 'none' }; }
      if (lt > ct || !cm) {
        const ok = await SWC.uploadConv(id);
        if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('cloudProgress', '');
        return { ok, direction: 'upload' };
      } else {
        const ok = await SWC.downloadConv(id);
        if (ok) { SWC.setSyncState(id, 'synced'); if (SWC.state.curId === id && SWC.loadConv) { SWC.loadConv(id); SWC.renderChat(); } }
        else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('cloudProgress', '');
        return { ok, direction: 'download' };
      }
    } finally { SWC.state.syncing = false; }
  };

  SWC.forceUpload = async function (id) {
    if (!SWC.getToken()) { SWC.showDiag('未登录', ['请先登录']); return false; }
    if (SWC.state.runningConvs.has(id)) { alert('此对话正在生成中'); return false; }
    const ok = await SWC.uploadConv(id);
    if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed');
    return ok;
  };
  SWC.forceDownload = async function (id) {
    if (!SWC.getToken()) { SWC.showDiag('未登录', ['请先登录']); return false; }
    if (SWC.state.runningConvs.has(id)) { alert('此对话正在生成中'); return false; }
    const ok = await SWC.downloadConv(id);
    if (ok) { SWC.setSyncState(id, 'synced'); if (SWC.state.curId === id && SWC.loadConv) { SWC.loadConv(id); SWC.renderChat(); } }
    else SWC.setSyncState(id, 'failed');
    return ok;
  };
  SWC.checkState = async function () {
    if (!SWC.getToken()) { SWC.showDiag('未登录', ['请先登录']); return; }
    SWC.updateProgress('cloudProgress', '正在检查...');
    const cloudData = await SWC.cloudApi({});
    if (cloudData.error) {
      SWC.updateProgress('cloudProgress', '');
      SWC.showDiag('检查失败', [{ k: '错误', v: cloudData.error }, { k: '详情', v: cloudData.body || cloudData.detail || '' }]);
      return;
    }
    const cloudIndex = Array.isArray(cloudData.index) ? cloudData.index : [];
    const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
    const localIds = SWC.S.idx();
    for (const id of localIds) {
      const lm = SWC.S.meta(id); if (!lm) continue;
      const cm = cloudMap.get(id);
      if (!cm) SWC.setSyncState(id, 'local-only');
      else {
        const lt = lm.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) SWC.setSyncState(id, 'local-newer');
        else if (ct > lt) SWC.setSyncState(id, 'cloud-newer');
        else SWC.setSyncState(id, 'synced');
      }
    }
    for (const [id] of cloudMap) if (!localIds.includes(id)) SWC.setSyncState(id, 'cloud-only');
    SWC.updateProgress('cloudProgress', '');
    if (SWC.renderConvList) SWC.renderConvList();
    if (SWC.renderCloudList) SWC.renderCloudList();
  };
  SWC.strictDelete = async function (id) {
    if (!SWC.getToken()) { alert('请先登录'); return; }
    if (SWC.state.runningConvs.has(id)) { alert('此对话正在生成中，请先停止再删除。'); return; }
    if (!confirm('确定删除？将同时删除本地和云端。')) return;
    const cloudData = await SWC.cloudApi({});
    if (cloudData.error) { alert('无法连接云端，删除取消'); return; }
    const cloudIndex = Array.isArray(cloudData.index) ? cloudData.index : [];
    const cm = cloudIndex.find(x => x.id === id);
    const lm = SWC.S.meta(id);
    if (!lm) { alert('本地不存在该对话'); return; }
    if (cm) {
      const ct = cm.savedAt || 0, lt = lm.savedAt || 0;
      if (ct !== lt) { alert('该对话在云端有未同步的修改，请先同步再删除。'); return; }
    }
    const r = await SWC.cloudApi({ method: 'DELETE', id });
    if (r.error) {
      SWC.showDiag('云端删除失败', [{ k: '会话 id', v: id }, { k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]);
      return;
    }
    if (SWC.delConv) SWC.delConv(id);
    if (SWC.renderChat) SWC.renderChat();
  };

  // ═══════════════════ 模型配置云同步 ═══════════════════
  SWC.uploadModelConfig = async function (id) {
    const c = SWC.state.modelConfigs.find(x => x.id === id);
    if (!c) return false;
    const r = await SWC.cloudApi({ type: 'config', id, method: 'PUT', body: { config: c } });
    return !r.error;
  };
  SWC.downloadModelConfig = async function (id) {
    const r = await SWC.cloudApi({ type: 'config', id });
    if (r.error || !r.config) return false;
    const c = r.config;
    if (!c.savedAt) c.savedAt = Date.now();
    if (!c.fallbackModelsUrl) c.fallbackModelsUrl = '';
    if (!c.manualModels) c.manualModels = '';
    if (!c.modelMode) c.modelMode = 'auto';
    if (!c.cfAccountId) c.cfAccountId = '';
    if (c.temperature === undefined) c.temperature = null;
    localStorage.setItem(CFG_PREFIX + id, JSON.stringify(c));
    return true;
  };

  SWC.syncModelConfigAll = async function (silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) { if (!silent) SWC.showDiag('未登录', ['请先登录']); return { error: 'unauthorized' }; }
    SWC.state.syncing = true;
    let uploaded = 0, downloaded = 0, skipped = 0, failed = 0;
    try {
      if (!silent) SWC.updateProgress('mmProgress', '正在读取云端配置索引...');
      const r = await SWC.cloudApi({ type: 'config' });
      if (r.error) { if (!silent) SWC.showDiag('同步失败', [{ k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); return { error: r.error }; }
      const cloudIndex = Array.isArray(r.index) ? r.index : [];
      const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
      const localIndex = SWC.loadModelConfigIndex();
      const localMap = new Map(localIndex.map(x => [x.id, x]));
      const toUpload = [], toDownload = [];
      for (const [id, lm] of localMap) {
        const cm = cloudMap.get(id);
        if (!cm) { toUpload.push(id); continue; }
        const lt = lm.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) toUpload.push(id);
        else if (ct > lt) toDownload.push(id);
        else { skipped++; SWC.setSyncState(id, 'synced'); }
      }
      for (const [id] of cloudMap) if (!localMap.has(id)) toDownload.push(id);
      const total = toUpload.length + toDownload.length;
      for (let i = 0; i < toUpload.length; i++) { if (!silent) SWC.updateProgress('mmProgress', `上传 ${i + 1}/${total}...`); const ok = await SWC.uploadModelConfig(toUpload[i]); if (ok) { uploaded++; SWC.setSyncState(toUpload[i], 'synced'); } else { failed++; SWC.setSyncState(toUpload[i], 'failed'); } }
      for (let i = 0; i < toDownload.length; i++) { if (!silent) SWC.updateProgress('mmProgress', `下载 ${i + 1}/${total}...`); const ok = await SWC.downloadModelConfig(toDownload[i]); if (ok) { downloaded++; SWC.setSyncState(toDownload[i], 'synced'); } else { failed++; SWC.setSyncState(toDownload[i], 'failed'); } }
      const newIndex = [];
      for (const item of localIndex) {
        const raw = localStorage.getItem(CFG_PREFIX + item.id);
        if (!raw) continue;
        try { const c = JSON.parse(raw); newIndex.push({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt || 0, apiBase: c.apiBase || '', model: c.model || '' }); } catch {}
      }
      for (const [id] of cloudMap) {
        if (newIndex.find(x => x.id === id)) continue;
        const raw = localStorage.getItem(CFG_PREFIX + id);
        if (!raw) continue;
        try { const c = JSON.parse(raw); newIndex.push({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt || 0, apiBase: c.apiBase || '', model: c.model || '' }); } catch {}
      }
      SWC.saveModelConfigIndex(newIndex);
      SWC.state.modelConfigs = SWC.loadModelConfigs();
      if (!SWC.state.modelConfigs.find(c => c.id === SWC.state.currentModelConfigId)) {
        SWC.state.currentModelConfigId = SWC.state.modelConfigs[0]?.id || '';
        if (SWC.state.currentModelConfigId) SWC.setCookie(CUR_KEY, SWC.state.currentModelConfigId);
      }
      if (!silent) { SWC.updateProgress('mmProgress', ''); alert(`模型配置同步完成\n上传 ${uploaded}，下载 ${downloaded}，跳过 ${skipped}，失败 ${failed}`); }
      if (SWC.renderModelManagerList) SWC.renderModelManagerList();
      if (SWC.updateConfigLabel) SWC.updateConfigLabel();
      if (SWC.updateModelLabel) SWC.updateModelLabel();
      return { uploaded, downloaded, skipped, failed };
    } finally { SWC.state.syncing = false; }
  };

  SWC.syncModelConfigOne = async function (id, silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) return { error: 'unauthorized' };
    const lm = SWC.loadModelConfigIndex().find(x => x.id === id);
    if (!lm) return { error: 'not-found' };
    SWC.state.syncing = true;
    try {
      if (!silent) SWC.updateProgress('mmProgress', '查询配置状态...');
      const r = await SWC.cloudApi({ type: 'config', id });
      if (r.error === 'http-404') { const ok = await SWC.uploadModelConfig(id); if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed'); if (!silent) SWC.updateProgress('mmProgress', ''); return { ok }; }
      if (r.error) { if (!silent) SWC.showDiag('同步失败', [{ k: '配置 id', v: id }, { k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); if (!silent) SWC.updateProgress('mmProgress', ''); return { error: r.error }; }
      const cm = r.config;
      const lt = lm.savedAt || 0, ct = (cm && cm.savedAt) || 0;
      if (lt === ct && cm) { SWC.setSyncState(id, 'synced'); if (!silent) SWC.updateProgress('mmProgress', ''); return { ok: true, direction: 'none' }; }
      if (lt > ct || !cm) {
        const ok = await SWC.uploadModelConfig(id);
        if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('mmProgress', '');
        return { ok, direction: 'upload' };
      } else {
        const ok = await SWC.downloadModelConfig(id);
        if (ok) {
          SWC.state.modelConfigs = SWC.loadModelConfigs();
          SWC.setSyncState(id, 'synced');
          if (SWC.renderModelManagerList) SWC.renderModelManagerList();
          if (SWC.updateConfigLabel) SWC.updateConfigLabel();
          if (SWC.updateModelLabel) SWC.updateModelLabel();
        } else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('mmProgress', '');
        return { ok, direction: 'download' };
      }
    } finally { SWC.state.syncing = false; }
  };

  SWC.checkModelConfigState = async function () {
    if (!SWC.getToken()) { SWC.showDiag('未登录', ['请先登录']); return; }
    SWC.updateProgress('mmProgress', '正在检查...');
    const r = await SWC.cloudApi({ type: 'config' });
    if (r.error) { SWC.updateProgress('mmProgress', ''); SWC.showDiag('检查失败', [{ k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); return; }
    const cloudIndex = Array.isArray(r.index) ? r.index : [];
    const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
    const localIndex = SWC.loadModelConfigIndex();
    for (const li of localIndex) {
      const cm = cloudMap.get(li.id);
      if (!cm) SWC.setSyncState(li.id, 'local-only');
      else {
        const lt = li.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) SWC.setSyncState(li.id, 'local-newer');
        else if (ct > lt) SWC.setSyncState(li.id, 'cloud-newer');
        else SWC.setSyncState(li.id, 'synced');
      }
    }
    for (const [id] of cloudMap) if (!localIndex.find(x => x.id === id)) SWC.setSyncState(id, 'cloud-only');
    SWC.updateProgress('mmProgress', '');
    if (SWC.renderModelManagerList) SWC.renderModelManagerList();
  };

  SWC.strictDeleteModelConfig = async function (id) {
    if (!SWC.getToken()) { alert('请先登录'); return; }
    if (SWC.state.modelConfigs.length <= 1) { alert('至少保留一套模型配置。'); return; }
    if (!confirm('确定删除这套模型配置？将同时删除本地和云端。')) return;
    const r = await SWC.cloudApi({ type: 'config' });
    if (r.error) { alert('无法连接云端，删除取消'); return; }
    const cloudIndex = Array.isArray(r.index) ? r.index : [];
    const cm = cloudIndex.find(x => x.id === id);
    const lm = SWC.loadModelConfigIndex().find(x => x.id === id);
    if (cm && lm) {
      const ct = cm.savedAt || 0, lt = lm.savedAt || 0;
      if (ct !== lt) { alert('该配置在云端有未同步的修改，请先同步再删除。'); return; }
    }
    const dr = await SWC.cloudApi({ type: 'config', id, method: 'DELETE' });
    if (dr.error) { SWC.showDiag('云端删除失败', [{ k: '配置 id', v: id }, { k: '错误', v: dr.error }, { k: '详情', v: dr.body || dr.detail || '' }]); return; }
    SWC.deleteModelConfigLocal(id);
    SWC.delSyncState(id);
    SWC.state.modelConfigs = SWC.loadModelConfigs();
    if (SWC.state.currentModelConfigId === id) {
      SWC.state.currentModelConfigId = SWC.state.modelConfigs[0]?.id || '';
      if (SWC.state.currentModelConfigId) SWC.setCookie(CUR_KEY, SWC.state.currentModelConfigId);
    }
    if (SWC.renderModelManagerList) SWC.renderModelManagerList();
    if (SWC.updateConfigLabel) SWC.updateConfigLabel();
    if (SWC.updateModelLabel) SWC.updateModelLabel();
  };

  // ═══════════════════ 搜索配置云同步 ═══════════════════
  SWC.uploadSearchConfig = async function (id) {
    const c = SWC.state.searchConfigs.find(x => x.id === id);
    if (!c) return false;
    const r = await SWC.cloudApi({ type: 'search', id, method: 'PUT', body: { config: c } });
    return !r.error;
  };
  SWC.downloadSearchConfig = async function (id) {
    const r = await SWC.cloudApi({ type: 'search', id });
    if (r.error || !r.config) return false;
    const c = r.config;
    if (!c.savedAt) c.savedAt = Date.now();
    if (!c.searchProvider) c.searchProvider = 'tavily';
    if (c.tavilyApiKey === undefined) c.tavilyApiKey = '';
    if (c.serperApiKey === undefined) c.serperApiKey = '';
    if (c.enabled === undefined) c.enabled = false;
    if (!c.searchMode) c.searchMode = 'agent';
    if (!c.maxSearchRounds) c.maxSearchRounds = 3;
    if (c.systemHint === undefined) c.systemHint = '';
    localStorage.setItem(SEARCH_PREFIX + id, JSON.stringify(c));
    return true;
  };

  SWC.syncSearchConfigAll = async function (silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) { if (!silent) SWC.showDiag('未登录', ['请先登录']); return { error: 'unauthorized' }; }
    SWC.state.syncing = true;
    let uploaded = 0, downloaded = 0, skipped = 0, failed = 0;
    try {
      if (!silent) SWC.updateProgress('smProgress', '正在读取云端搜索配置索引...');
      const r = await SWC.cloudApi({ type: 'search' });
      if (r.error) { if (!silent) SWC.showDiag('同步失败', [{ k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); return { error: r.error }; }
      const cloudIndex = Array.isArray(r.index) ? r.index : [];
      const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
      const localIndex = SWC.loadSearchConfigIndex();
      const localMap = new Map(localIndex.map(x => [x.id, x]));
      const toUpload = [], toDownload = [];
      for (const [id, lm] of localMap) {
        const cm = cloudMap.get(id);
        if (!cm) { toUpload.push(id); continue; }
        const lt = lm.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) toUpload.push(id);
        else if (ct > lt) toDownload.push(id);
        else { skipped++; SWC.setSyncState(id, 'synced'); }
      }
      for (const [id] of cloudMap) if (!localMap.has(id)) toDownload.push(id);
      const total = toUpload.length + toDownload.length;
      for (let i = 0; i < toUpload.length; i++) { if (!silent) SWC.updateProgress('smProgress', `上传 ${i + 1}/${total}...`); const ok = await SWC.uploadSearchConfig(toUpload[i]); if (ok) { uploaded++; SWC.setSyncState(toUpload[i], 'synced'); } else { failed++; SWC.setSyncState(toUpload[i], 'failed'); } }
      for (let i = 0; i < toDownload.length; i++) { if (!silent) SWC.updateProgress('smProgress', `下载 ${i + 1}/${total}...`); const ok = await SWC.downloadSearchConfig(toDownload[i]); if (ok) { downloaded++; SWC.setSyncState(toDownload[i], 'synced'); } else { failed++; SWC.setSyncState(toDownload[i], 'failed'); } }
      const newIndex = [];
      for (const item of localIndex) {
        const raw = localStorage.getItem(SEARCH_PREFIX + item.id);
        if (!raw) continue;
        try { const c = JSON.parse(raw); newIndex.push({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt || 0, provider: c.searchProvider || 'tavily', mode: c.searchMode || 'agent', enabled: c.enabled === true }); } catch {}
      }
      for (const [id] of cloudMap) {
        if (newIndex.find(x => x.id === id)) continue;
        const raw = localStorage.getItem(SEARCH_PREFIX + id);
        if (!raw) continue;
        try { const c = JSON.parse(raw); newIndex.push({ id: c.id, name: c.name || '未命名', savedAt: c.savedAt || 0, provider: c.searchProvider || 'tavily', mode: c.searchMode || 'agent', enabled: c.enabled === true }); } catch {}
      }
      SWC.saveSearchConfigIndex(newIndex);
      SWC.state.searchConfigs = SWC.loadSearchConfigs();
      if (!SWC.state.searchConfigs.find(c => c.id === SWC.state.currentSearchConfigId)) {
        SWC.state.currentSearchConfigId = SWC.state.searchConfigs[0]?.id || '';
        if (SWC.state.currentSearchConfigId) SWC.setCookie(SEARCH_CUR_KEY, SWC.state.currentSearchConfigId);
      }
      if (!silent) { SWC.updateProgress('smProgress', ''); alert(`搜索配置同步完成\n上传 ${uploaded}，下载 ${downloaded}，跳过 ${skipped}，失败 ${failed}`); }
      if (SWC.renderSearchManagerList) SWC.renderSearchManagerList();
      if (SWC.updateSearchLabel) SWC.updateSearchLabel();
      if (SWC.updateSearchEnabledCheck) SWC.updateSearchEnabledCheck();
      return { uploaded, downloaded, skipped, failed };
    } finally { SWC.state.syncing = false; }
  };

  SWC.syncSearchConfigOne = async function (id, silent) {
    if (SWC.state.syncing) return { busy: true };
    if (!SWC.getToken()) return { error: 'unauthorized' };
    const lm = SWC.loadSearchConfigIndex().find(x => x.id === id);
    if (!lm) return { error: 'not-found' };
    SWC.state.syncing = true;
    try {
      if (!silent) SWC.updateProgress('smProgress', '查询配置状态...');
      const r = await SWC.cloudApi({ type: 'search', id });
      if (r.error === 'http-404') { const ok = await SWC.uploadSearchConfig(id); if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed'); if (!silent) SWC.updateProgress('smProgress', ''); return { ok }; }
      if (r.error) { if (!silent) SWC.showDiag('同步失败', [{ k: '配置 id', v: id }, { k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); if (!silent) SWC.updateProgress('smProgress', ''); return { error: r.error }; }
      const cm = r.config;
      const lt = lm.savedAt || 0, ct = (cm && cm.savedAt) || 0;
      if (lt === ct && cm) { SWC.setSyncState(id, 'synced'); if (!silent) SWC.updateProgress('smProgress', ''); return { ok: true, direction: 'none' }; }
      if (lt > ct || !cm) {
        const ok = await SWC.uploadSearchConfig(id);
        if (ok) SWC.setSyncState(id, 'synced'); else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('smProgress', '');
        return { ok, direction: 'upload' };
      } else {
        const ok = await SWC.downloadSearchConfig(id);
        if (ok) {
          SWC.state.searchConfigs = SWC.loadSearchConfigs();
          SWC.setSyncState(id, 'synced');
          if (SWC.renderSearchManagerList) SWC.renderSearchManagerList();
          if (SWC.updateSearchLabel) SWC.updateSearchLabel();
          if (SWC.updateSearchEnabledCheck) SWC.updateSearchEnabledCheck();
        } else SWC.setSyncState(id, 'failed');
        if (!silent) SWC.updateProgress('smProgress', '');
        return { ok, direction: 'download' };
      }
    } finally { SWC.state.syncing = false; }
  };

  SWC.checkSearchConfigState = async function () {
    if (!SWC.getToken()) { SWC.showDiag('未登录', ['请先登录']); return; }
    SWC.updateProgress('smProgress', '正在检查...');
    const r = await SWC.cloudApi({ type: 'search' });
    if (r.error) { SWC.updateProgress('smProgress', ''); SWC.showDiag('检查失败', [{ k: '错误', v: r.error }, { k: '详情', v: r.body || r.detail || '' }]); return; }
    const cloudIndex = Array.isArray(r.index) ? r.index : [];
    const cloudMap = new Map(cloudIndex.map(x => [x.id, x]));
    const localIndex = SWC.loadSearchConfigIndex();
    for (const li of localIndex) {
      const cm = cloudMap.get(li.id);
      if (!cm) SWC.setSyncState(li.id, 'local-only');
      else {
        const lt = li.savedAt || 0, ct = cm.savedAt || 0;
        if (lt > ct) SWC.setSyncState(li.id, 'local-newer');
        else if (ct > lt) SWC.setSyncState(li.id, 'cloud-newer');
        else SWC.setSyncState(li.id, 'synced');
      }
    }
    for (const [id] of cloudMap) if (!localIndex.find(x => x.id === id)) SWC.setSyncState(id, 'cloud-only');
    SWC.updateProgress('smProgress', '');
    if (SWC.renderSearchManagerList) SWC.renderSearchManagerList();
  };

  SWC.strictDeleteSearchConfig = async function (id) {
    if (!SWC.getToken()) { alert('请先登录'); return; }
    if (SWC.state.searchConfigs.length <= 1) { alert('至少保留一套搜索配置。'); return; }
    if (!confirm('确定删除这套搜索配置？将同时删除本地和云端。')) return;
    const r = await SWC.cloudApi({ type: 'search' });
    if (r.error) { alert('无法连接云端，删除取消'); return; }
    const cloudIndex = Array.isArray(r.index) ? r.index : [];
    const cm = cloudIndex.find(x => x.id === id);
    const lm = SWC.loadSearchConfigIndex().find(x => x.id === id);
    if (cm && lm) {
      const ct = cm.savedAt || 0, lt = lm.savedAt || 0;
      if (ct !== lt) { alert('该配置在云端有未同步的修改，请先同步再删除。'); return; }
    }
    const dr = await SWC.cloudApi({ type: 'search', id, method: 'DELETE' });
    if (dr.error) { SWC.showDiag('云端删除失败', [{ k: '配置 id', v: id }, { k: '错误', v: dr.error }, { k: '详情', v: dr.body || dr.detail || '' }]); return; }
    SWC.deleteSearchConfigLocal(id);
    SWC.delSyncState(id);
    SWC.state.searchConfigs = SWC.loadSearchConfigs();
    if (SWC.state.currentSearchConfigId === id) {
      SWC.state.currentSearchConfigId = SWC.state.searchConfigs[0]?.id || '';
      if (SWC.state.currentSearchConfigId) SWC.setCookie(SEARCH_CUR_KEY, SWC.state.currentSearchConfigId);
    }
    if (SWC.renderSearchManagerList) SWC.renderSearchManagerList();
    if (SWC.updateSearchLabel) SWC.updateSearchLabel();
    if (SWC.updateSearchEnabledCheck) SWC.updateSearchEnabledCheck();
  };

  // ═══════════════════ 工具定义与搜索 ═══════════════════
  SWC.performSearch = async function (query, cfg) {
    const provider = cfg.searchProvider || 'tavily';
    const searchKey = provider === 'tavily' ? cfg.tavilyApiKey : cfg.serperApiKey;
    if (!searchKey) return { error: '搜索 API Key 未填写' };
    if (!cfg.proxyPassword) return { error: '搜索配置缺少代理密码' };
    try {
      const res = await fetch('/api/aisearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: cfg.proxyPassword,
          provider: provider,
          query: query,
          apiKey: searchKey
        })
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || ('搜索失败 HTTP ' + res.status) };
      return { results: data.results || [] };
    } catch (e) {
      return { error: '搜索网络异常: ' + (e.message || e) };
    }
  };

  SWC.buildToolsDefinition = function (sc) {
    const tools = [];
    if (sc && sc.searchMode === 'agent') {
      tools.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: '搜索互联网获取实时信息。当用户问及时事、最新数据、你不确定的事实，或需要核实信息时使用。不要用它来回答常识问题、数学计算或逻辑推理。',
          strict: true,
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词，简洁精准。例如"DeepSeek V4 发布 2026"而不是完整问句。'
              }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      });
    }
    return tools;
  };

  SWC.buildToolResultText = function (results) {
    let text = '搜索结果：\n\n';
    results.forEach((r, i) => {
      text += '[' + (i + 1) + '] ' + (r.title || '') + '\n';
      text += (r.snippet || '') + '\n';
      text += '来源：' + (r.url || '') + '\n\n';
    });
    return text;
  };
  SWC.buildSearchContextFromResults = function (results) {
    let ctx = '以下是相关网页搜索结果，请基于这些信息回答用户问题。如果搜索结果不相关或不足，可以忽略它们并基于你自己的知识回答。\n\n';
    results.forEach((r, i) => {
      ctx += '[' + (i + 1) + '] ' + (r.title || '') + '\n';
      ctx += (r.snippet || '') + '\n';
      ctx += '来源：' + (r.url || '') + '\n\n';
    });
    ctx += '---\n\n';
    return ctx;
  };
  SWC.dedupeResults = function (arr) {
    const seen = new Set();
    const out = [];
    for (const r of arr) {
      if (!r || !r.url) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      out.push(r);
    }
    return out;
  };

  // ═══════════════════ 工具不支持检测 ═══════════════════
  // 只匹配"明确说不支持 tool / function calling"的错误，避免被其它 400 误判。
  SWC.isToolsUnsupportedError = function (status, responseText) {
    if (status !== 400 && status !== 404 && status !== 422 && status !== 500) return false;
    if (!responseText) return false;
    const t = String(responseText).toLowerCase();
    return (
      /does\s+not\s+support\s+(tool|function)/.test(t) ||
      /(tool|function)s?\s+(are\s+)?not\s+support/.test(t) ||
      /unsupported\s+(tool|function)/.test(t) ||
      /function\s+calling\s+is\s+not\s+support/.test(t) ||
      /(tool|function)s?\s+is\s+not\s+support/.test(t) ||
      /unknown\s+parameter[^\n]*\b(tool|function)/.test(t) ||
      /invalid\s+parameter[^\n]*\b(tool|function)/.test(t) ||
      /unrecognized[^\n]*\b(tool|function)/.test(t) ||
      (/\boneof\b/.test(t) && /\btool/.test(t))
    );
  };
  SWC.isCloudflareEndpoint = function (apiBase) {
    if (!apiBase) return false;
    return /api\.cloudflare\.com/i.test(apiBase);
  };

})(window.SWC);
