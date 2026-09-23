// ai-ui.js — DOM 渲染、事件绑定、启动
(function (SWC) {
  "use strict";

  const $ = id => document.getElementById(id);
  const chatEl = $('chat');
  const inputEl = $('input');
  const btnSend = $('btnSend');
  const convListEl = $('convList');
  const convTitleEl = $('convTitle');
  const btnConfig = $('btnConfig');
  const configLabel = $('configLabel');
  const btnModel = $('btnModel');
  const modelLabel = $('modelLabel');
  const btnSearch = $('btnSearch');
  const searchLabel = $('searchLabel');
  const btnReason = $('btnReason');
  const reasonLabel = $('reasonLabel');
  const btnDebug = $('btnDebug');
  const configPopup = $('configPopup');
  const configList = $('configList');
  const modelPopup = $('modelPopup');
  const searchPopup = $('searchPopup');
  const reasonPopup = $('reasonPopup');
  const cloudPopup = $('cloudPopup');
  const cloudList = $('cloudList');
  const popupMask = $('popupMask');
  const modelListPanel = $('modelListPanel');
  const modelSearchEl = $('modelSearch');
  const manualWrap = $('manualWrap');
  const manualInput = $('manualInput');
  const searchConfigList = $('searchConfigList');
  const searchEnabledCheck = $('searchEnabledCheck');
  const convMenu = $('convMenu');
  const sidebarEl = $('sidebar');
  const sidebarMask = $('sidebarMask');
  const btnMenu = $('btnMenu');
  const modelManagerList = $('modelManagerList');
  const searchManagerList = $('searchManagerList');

  // ═══════════════════ 滚动 ═══════════════════
  let isAtBottom = true, scrollPending = false;
  chatEl.addEventListener('scroll', () => {
    isAtBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 60;
  }, { passive: true });
  SWC.autoScroll = function () {
    if (!isAtBottom || scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { scrollPending = false; chatEl.scrollTop = chatEl.scrollHeight; });
  };
  function scrollToBottom() { isAtBottom = true; chatEl.scrollTop = chatEl.scrollHeight; }

  // ═══════════════════ 消息渲染 ═══════════════════
  function makeTurnEl(turn, turnIdx) {
    const frag = document.createDocumentFragment();
    const marked = !!turn.marked;

    const u = document.createElement('div');
    u.className = 'msg user' + (marked ? ' marked' : '');
    u.innerHTML =
      '<div class="ava">你</div>' +
      '<div class="wrap">' +
        '<div class="bubble"></div>' +
        '<div class="msg-actions">' +
          '<button data-act="copy" type="button">复制</button>' +
          '<button data-act="delete" type="button">删除</button>' +
          '<button data-act="mark" type="button">' + (marked ? '★ 已标记' : '标记') + '</button>' +
        '</div>' +
      '</div>';
    u.querySelector('.bubble').textContent = turn.user.content;
    u.querySelector('[data-act="copy"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.copyText(turn.user.content); });
    u.querySelector('[data-act="delete"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.deleteTurn(turnIdx); });
    u.querySelector('[data-act="mark"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.toggleMark(turnIdx); });
    frag.appendChild(u);

    const a = document.createElement('div');
    a.className = 'msg ai' + (marked ? ' marked' : '');
    a.innerHTML =
      '<div class="ava">AI</div>' +
      '<div class="wrap">' +
        '<div class="bubble"></div>' +
        '<div class="msg-actions">' +
          '<button data-act="copy" type="button">复制</button>' +
          '<button data-act="resend" type="button">重发</button>' +
          '<button data-act="delete" type="button">删除</button>' +
          '<button data-act="mark" type="button">' + (marked ? '★ 已标记' : '标记') + '</button>' +
        '</div>' +
      '</div>';
    const wrap = a.querySelector('.wrap');
    const bubble = a.querySelector('.bubble');

    if (turn.assistant.reasoning_content) {
      const d = document.createElement('details');
      d.className = 'reason';
      d.innerHTML = '<summary>推理过程</summary><div class="rc"></div>';
      d.querySelector('.rc').textContent = turn.assistant.reasoning_content;
      wrap.insertBefore(d, bubble);
    }
    bubble.innerHTML = turn.assistant.content ? SWC.md(turn.assistant.content) : '';

    if (turn.searchResults && turn.searchResults.length > 0) {
      wrap.appendChild(SWC.buildRefsPanel(turn.searchResults));
    }

    a.querySelector('[data-act="copy"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.copyText(turn.assistant.content || ''); });
    a.querySelector('[data-act="resend"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.resendTurn(turnIdx); });
    a.querySelector('[data-act="delete"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.deleteTurn(turnIdx); });
    a.querySelector('[data-act="mark"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.toggleMark(turnIdx); });

    frag.appendChild(a);
    return frag;
  }

  function bindDomRefs(convId) {
    const run = SWC.state.runningConvs.get(convId);
    if (!run) return;
    const msgs = chatEl.querySelectorAll('.msg.ai');
    const target = msgs[run.turnIdx];
    if (!target) { run.domRef = null; return; }
    const ref = {
      wrap: target.querySelector('.wrap'),
      bubble: target.querySelector('.bubble'),
      reasonEl: target.querySelector('.reason'),
      reasonContentEl: target.querySelector('.reason .rc')
    };
    if (ref.reasonEl && !run.autoCollapsed) ref.reasonEl.open = true;
    run.domRef = ref;
    const curTurn = run.turn;
    if (curTurn) {
      if (curTurn.assistant.reasoning_content) {
        if (!ref.reasonEl) {
          ref.reasonEl = document.createElement('details');
          ref.reasonEl.className = 'reason';
          ref.reasonEl.open = true;
          ref.reasonEl.innerHTML = '<summary>推理过程</summary><div class="rc"></div>';
          ref.reasonContentEl = ref.reasonEl.querySelector('.rc');
          ref.wrap.insertBefore(ref.reasonEl, ref.bubble);
        }
        ref.reasonContentEl.textContent = curTurn.assistant.reasoning_content;
        if (!run.autoCollapsed) ref.reasonEl.open = true;
        else ref.reasonEl.open = false;
      }
      if (curTurn.assistant.content) {
        ref.bubble.innerHTML = SWC.md(curTurn.assistant.content);
      }
    }
  }

  function stateIcon(state) {
    const map = {
      synced: '✓', 'local-newer': '↑', 'cloud-newer': '↓',
      'local-only': '●', 'cloud-only': '○', 'unknown': '?', 'failed': '!'
    };
    return map[state] || '?';
  }

  function updateSendButton() {
    const s = SWC.state;
    const isGenerating = !!(s.curId && s.runningConvs.has(s.curId));
    if (isGenerating) { btnSend.textContent = '停止'; btnSend.classList.add('stop'); }
    else { btnSend.textContent = '发送'; btnSend.classList.remove('stop'); }
  }
  SWC.updateSendButton = updateSendButton;

  function updateConfigLabel() {
    const s = SWC.state;
    const c = SWC.curModelConfig();
    if (s.curMeta && s.curMeta.configId && !SWC.modelConfigById(s.curMeta.configId)) {
      configLabel.textContent = '未绑定';
      btnConfig.classList.add('error');
    } else {
      configLabel.textContent = c ? c.name : '配置';
      btnConfig.classList.toggle('empty', !c);
      btnConfig.classList.remove('error');
    }
  }
  SWC.updateConfigLabel = updateConfigLabel;

  function updateModelLabel() {
    const s = SWC.state;
    const m = (s.curMeta && s.curMeta.model) || SWC.curModelConfig()?.model || '';
    if (m) { modelLabel.textContent = m; btnModel.classList.remove('empty'); }
    else { modelLabel.textContent = '选择模型'; btnModel.classList.add('empty'); }
  }
  SWC.updateModelLabel = updateModelLabel;

  function updateSearchLabel() {
    const c = SWC.curSearchConfig();
    if (!c) {
      searchLabel.textContent = '搜索';
      btnSearch.classList.add('empty');
      btnSearch.classList.remove('search-on');
      return;
    }
    const provider = c.searchProvider === 'serper' ? 'Serper' : 'Tavily';
    const enabled = c.enabled === true;
    const isAgent = (c.searchMode || 'agent') === 'agent';
    if (enabled) {
      btnSearch.classList.add('search-on');
      btnSearch.classList.remove('empty');
    } else {
      btnSearch.classList.remove('search-on');
      btnSearch.classList.remove('empty');
    }
    searchLabel.textContent = (enabled ? (isAgent ? '🤖 ' : '🌐 ') : '🔌 ') + provider;
  }
  SWC.updateSearchLabel = updateSearchLabel;

  function updateSearchEnabledCheck() {
    const c = SWC.curSearchConfig();
    searchEnabledCheck.checked = c && c.enabled === true;
  }
  SWC.updateSearchEnabledCheck = updateSearchEnabledCheck;

  function updateReasonLabel() {
    const s = SWC.state;
    const v = (s.curMeta && s.curMeta.reasoning) || '';
    reasonLabel.textContent = v || '默认';
  }
  function updateDebugButton() {
    if (SWC.isDebugMode()) { btnDebug.classList.add('debug-on'); btnDebug.textContent = '🐞 调试 ON'; }
    else { btnDebug.classList.remove('debug-on'); btnDebug.textContent = '🐞 调试'; }
  }
  SWC.updateDebugButton = updateDebugButton;

  function renderChat() {
    const s = SWC.state;
    chatEl.innerHTML = '';
    if (!s.curId || s.curTurns.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'welcome';
      welcome.id = 'welcome';
      welcome.innerHTML = '<h2>SwC AI</h2><p>顶栏「配置」管理模型，「搜索」管理联网搜索</p>';
      chatEl.appendChild(welcome);
      convTitleEl.textContent = 'SwC AI';
    } else {
      s.curTurns.forEach((t, i) => chatEl.appendChild(makeTurnEl(t, i)));
      convTitleEl.textContent = (s.curMeta && s.curMeta.title) || 'SwC AI';
      scrollToBottom();
    }
    if (s.curId && s.runningConvs.has(s.curId)) bindDomRefs(s.curId);
    updateConfigLabel();
    updateModelLabel();
    updateSearchLabel();
    updateReasonLabel();
    updateSendButton();
    renderConvList();
  }
  SWC.renderChat = renderChat;

  function renderConvList() {
    const s = SWC.state;
    convListEl.innerHTML = '';
    SWC.S.metas().forEach(m => {
      const isGen = s.runningConvs.has(m.id);
      const it = document.createElement('div');
      it.className = 'sb-item' + (m.id === s.curId ? ' active' : '');
      const syncState = SWC.getSyncState(m.id);
      let leftPart;
      if (isGen) leftPart = '<span class="spin" title="生成中"></span>';
      else leftPart = '<span class="sync-icon" data-state="' + syncState + '" title="' + syncState + '">' + stateIcon(syncState) + '</span>';
      it.innerHTML = leftPart +
        '<span class="t">' + SWC.esc(m.title || '新对话') + '</span>' +
        '<button class="d" title="操作">···</button>' +
        '<input class="rn" type="text">';
      const rn = it.querySelector('.rn');
      rn.value = m.title || '新对话';
      it.querySelector('.d').addEventListener('click', (e) => {
        e.stopPropagation();
        openConvMenu(e.currentTarget, m.id);
      });
      it.querySelector('.t').addEventListener('dblclick', (e) => {
        e.stopPropagation();
        it.classList.add('renaming');
        rn.focus(); rn.select();
      });
      const commitRename = () => {
        const v = rn.value.trim();
        if (v && v !== m.title) {
          m.title = v;
          m.savedAt = Date.now();
          m.schema = 2;
          SWC.S.setMeta(m.id, m);
          SWC.setSyncState(m.id, 'local-newer');
          if (m.id === s.curId) { s.curMeta = m; convTitleEl.textContent = m.title; }
        }
        it.classList.remove('renaming');
        renderConvList();
      };
      rn.addEventListener('blur', commitRename);
      rn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); rn.blur(); }
        else if (e.key === 'Escape') { rn.value = m.title; rn.blur(); }
      });
      rn.addEventListener('click', e => e.stopPropagation());
      it.addEventListener('click', () => {
        if (it.classList.contains('renaming')) return;
        SWC.loadConv(m.id);
        renderChat();
        if (window.innerWidth <= 768 && window.innerHeight > window.innerWidth) closeSidebar();
      });
      convListEl.appendChild(it);
    });
  }
  SWC.renderConvList = renderConvList;

  // ═══════════════════ 会话菜单 ═══════════════════
  let convMenuTargetId = null;
  function openConvMenu(anchor, convId) {
    convMenuTargetId = convId;
    const r = anchor.getBoundingClientRect();
    convMenu.classList.add('show');
    convMenu.style.top = (r.bottom + 4) + 'px';
    convMenu.style.left = Math.min(r.left, window.innerWidth - 160) + 'px';
  }
  function closeConvMenu() { convMenu.classList.remove('show'); convMenuTargetId = null; }
  convMenu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      const id = convMenuTargetId;
      closeConvMenu();
      if (!id) return;
      if (act === 'rename') {
        const el = Array.from(convListEl.querySelectorAll('.sb-item')).find(item => {
          const m = SWC.S.meta(id);
          const t = item.querySelector('.t');
          return m && t && t.textContent === m.title;
        });
        if (el) {
          el.classList.add('renaming');
          const rn = el.querySelector('.rn');
          rn.focus(); rn.select();
        }
      } else if (act === 'download') {
        await SWC.forceDownload(id);
        alert('已下载');
      } else if (act === 'sync') {
        await SWC.syncOne(id, false);
        alert('同步完成');
      } else if (act === 'delete') {
        await SWC.strictDelete(id);
      }
    });
  });
  document.addEventListener('click', (e) => {
    if (!convMenu.contains(e.target)) closeConvMenu();
  });

  function downloadAll() {
    const all = SWC.S.metas().map(m => ({ ...m, turns: SWC.S.turns(m.id, m.turnCount || 0) }));
    const blob = new Blob([JSON.stringify({ conversations: all }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swc-ai-all-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ═══════════════════ Popup 管理 ═══════════════════
  function closeAllPopups() {
    document.querySelectorAll('.popup.show').forEach(p => p.classList.remove('show'));
    popupMask.classList.remove('show');
    manualWrap.classList.remove('show');
    manualInput.value = '';
  }
  function showPopup(el, anchor) {
    closeAllPopups();
    el.classList.add('show');
    popupMask.classList.add('show');
    const r = anchor.getBoundingClientRect();
    el.style.top = (r.bottom + 4) + 'px';
    el.style.right = (window.innerWidth - r.right) + 'px';
    el.style.left = 'auto';
    requestAnimationFrame(() => {
      const box = el.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 10) {
        el.style.top = Math.max(10, window.innerHeight - box.height - 10) + 'px';
      }
      if (box.left < 10) { el.style.right = 'auto'; el.style.left = '10px'; }
    });
  }
  popupMask.addEventListener('click', closeAllPopups);

  // ═══════════════════ 配置 Popup ═══════════════════
  function renderConfigList() {
    const s = SWC.state;
    configList.innerHTML = '';
    s.modelConfigs.forEach(c => {
      const it = document.createElement('div');
      it.className = 'popup-item' + (c.id === s.currentModelConfigId ? ' active' : '');
      it.innerHTML = '<span class="n">' + SWC.esc(c.name) + '</span>' +
        (c.id === s.currentModelConfigId ? '<span class="chk">✓</span>' : '');
      it.addEventListener('click', () => { switchModelConfig(c.id); closeAllPopups(); });
      configList.appendChild(it);
    });
  }
  function switchModelConfig(id) {
    const s = SWC.state;
    s.currentModelConfigId = id;
    SWC.setCookie('swc_ai_current', id);
    if (s.curId && s.curMeta) {
      s.curMeta.configId = id;
      const c = SWC.modelConfigById(id);
      s.curMeta.configName = c ? c.name : '';
      s.curMeta.savedAt = Date.now();
      s.curMeta.schema = 2;
      SWC.S.setMeta(s.curId, s.curMeta);
      SWC.setSyncState(s.curId, 'local-newer');
    }
    s.modelsCache = SWC.loadModelsCache();
    updateConfigLabel();
    updateModelLabel();
    renderModelList();
  }
  btnConfig.addEventListener('click', (e) => {
    e.stopPropagation();
    if (configPopup.classList.contains('show')) { closeAllPopups(); return; }
    renderConfigList();
    showPopup(configPopup, btnConfig);
  });
  configPopup.addEventListener('click', e => e.stopPropagation());
  $('btnManageModelConfigs').addEventListener('click', () => {
    closeAllPopups();
    openModelManager();
  });

  // ═══════════════════ 模型 Popup ═══════════════════
  function renderModelList() {
    const s = SWC.state;
    const q = (modelSearchEl.value || '').toLowerCase().trim();
    const list = q ? s.modelsCache.filter(m => m.toLowerCase().includes(q)) : s.modelsCache;
    const curModel = (s.curMeta && s.curMeta.model) || SWC.curModelConfig()?.model || '';
    if (list.length === 0) {
      modelListPanel.innerHTML = '<div class="popup-empty">' +
        (s.modelsCache.length === 0 ? '无模型，点 ↻ 拉取' : '无匹配') + '</div>';
      return;
    }
    modelListPanel.innerHTML = '';
    list.forEach(name => {
      const it = document.createElement('div');
      it.className = 'popup-item' + (name === curModel ? ' active' : '');
      it.innerHTML = '<span class="n">' + SWC.esc(name) + '</span>' +
        (name === curModel ? '<span class="chk">✓</span>' : '');
      it.addEventListener('click', () => { selectModel(name); closeAllPopups(); });
      modelListPanel.appendChild(it);
    });
  }
  function selectModel(name) {
    if (!name) return;
    const s = SWC.state;
    if (!s.curId) {
      const c = SWC.curModelConfig();
      c.model = name;
      SWC.saveModelConfig(c);
    } else {
      s.curMeta.model = name;
      s.curMeta.savedAt = Date.now();
      s.curMeta.schema = 2;
      SWC.S.setMeta(s.curId, s.curMeta);
      SWC.setSyncState(s.curId, 'local-newer');
    }
    updateModelLabel();
  }
  btnModel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (modelPopup.classList.contains('show')) { closeAllPopups(); return; }
    SWC.state.modelsCache = SWC.loadModelsCache();
    renderModelList();
    showPopup(modelPopup, btnModel);
    if (SWC.state.modelsCache.length === 0) fetchModels(true);
  });
  modelSearchEl.addEventListener('input', renderModelList);
  $('btnRefreshModels').addEventListener('click', (e) => { e.stopPropagation(); fetchModels(false); });
  $('btnShowManual').addEventListener('click', () => { manualWrap.classList.add('show'); manualInput.focus(); });
  $('btnManualConfirm').addEventListener('click', () => {
    const v = manualInput.value.trim();
    if (!v) return;
    selectModel(v); closeAllPopups();
  });
  manualInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('btnManualConfirm').click(); }
  });
  modelPopup.addEventListener('click', e => e.stopPropagation());

  // ═══════════════════ 搜索 Popup ═══════════════════
  function renderSearchConfigList() {
    const s = SWC.state;
    searchConfigList.innerHTML = '';
    if (s.searchConfigs.length === 0) {
      searchConfigList.innerHTML = '<div class="popup-empty">无搜索配置</div>';
      return;
    }
    s.searchConfigs.forEach(c => {
      const it = document.createElement('div');
      it.className = 'popup-item' + (c.id === s.currentSearchConfigId ? ' active' : '');
      const provider = c.searchProvider === 'serper' ? 'Serper' : 'Tavily';
      const mode = (c.searchMode || 'agent') === 'agent' ? 'Agent' : 'Simple';
      const keyFilled = c.searchProvider === 'serper' ? !!c.serperApiKey : !!c.tavilyApiKey;
      it.innerHTML = '<span class="n">' + SWC.esc(c.name) + '</span>' +
        '<span class="sub">' + provider + ' · ' + mode + (keyFilled ? '' : ' · 未填 Key') + '</span>' +
        (c.id === s.currentSearchConfigId ? '<span class="chk">✓</span>' : '');
      it.addEventListener('click', () => {
        s.currentSearchConfigId = c.id;
        SWC.setCookie('swc_ai_search_current', c.id);
        renderSearchConfigList();
        updateSearchLabel();
        updateSearchEnabledCheck();
      });
      searchConfigList.appendChild(it);
    });
  }
  btnSearch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchPopup.classList.contains('show')) { closeAllPopups(); return; }
    renderSearchConfigList();
    updateSearchEnabledCheck();
    showPopup(searchPopup, btnSearch);
  });
  searchPopup.addEventListener('click', e => e.stopPropagation());
  searchEnabledCheck.addEventListener('change', () => {
    const c = SWC.curSearchConfig();
    if (!c) return;
    c.enabled = searchEnabledCheck.checked;
    SWC.saveSearchConfig(c);
    SWC.setSyncState(c.id, 'local-newer');
    updateSearchLabel();
    SWC.showToast(c.enabled ? '已开启联网搜索' : '已关闭联网搜索');
  });
  $('btnManageSearchConfigs').addEventListener('click', () => { closeAllPopups(); openSearchManager(); });
  $('btnNewSearchConfig').addEventListener('click', () => { closeAllPopups(); openSearchEdit(null); });

  // ═══════════════════ 推理 Popup ═══════════════════
  btnReason.addEventListener('click', (e) => {
    e.stopPropagation();
    if (reasonPopup.classList.contains('show')) { closeAllPopups(); return; }
    const s = SWC.state;
    const cur = (s.curMeta && s.curMeta.reasoning) || '';
    reasonPopup.querySelectorAll('.popup-item').forEach(el => {
      el.classList.toggle('active', el.dataset.v === cur);
    });
    showPopup(reasonPopup, btnReason);
  });
  reasonPopup.querySelectorAll('.popup-item').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.dataset.v;
      const s = SWC.state;
      if (!s.curId) { alert('请先开始一个对话，再设置推理强度。'); closeAllPopups(); return; }
      s.curMeta.reasoning = v;
      s.curMeta.savedAt = Date.now();
      s.curMeta.schema = 2;
      SWC.S.setMeta(s.curId, s.curMeta);
      SWC.setSyncState(s.curId, 'local-newer');
      updateReasonLabel();
      closeAllPopups();
    });
  });
  reasonPopup.addEventListener('click', e => e.stopPropagation());

  // ═══════════════════ 调试模式按钮 ═══════════════════
  btnDebug.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !SWC.isDebugMode();
    SWC.setDebugMode(on);
    updateDebugButton();
    SWC.showToast(on ? '调试模式已开启（每次请求都会弹窗）' : '调试模式已关闭');
  });

  // ═══════════════════ 主题按钮 ═══════════════════
  $('btnTheme').addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    SWC.applyTheme(t);
  });

  // ═══════════════════ 获取模型 ═══════════════════
  let fetchingModels = false;
  async function fetchModels(silent) {
    if (fetchingModels) return;
    const c = SWC.curModelConfig();
    if (!c.proxyUrl || !c.proxyPassword) {
      if (!silent) SWC.showDiag('代理配置不完整', [
        { k: '配置名', v: c.name },
        { k: '代理地址', v: c.proxyUrl || '(空)' },
        { k: '代理密码', v: c.proxyPassword ? '已填' : '(空)' }
      ]);
      return;
    }

    if (c.modelMode === 'manual' && c.manualModels) {
      const list = c.manualModels.split('\n').map(s => s.trim()).filter(Boolean);
      if (list.length > 0) {
        SWC.state.modelsCache = list;
        SWC.saveModelsCache(list);
        renderModelList();
        if (!SWC.state.curMeta?.model && !c.model) selectModel(list[0]);
        return;
      }
    }

    if (c.modelMode === 'cloudflare') {
      if (!c.cfAccountId || !c.apiKey) {
        if (!silent) SWC.showDiag('Cloudflare 配置不完整', [
          { k: '配置名', v: c.name },
          { k: 'Account ID', v: c.cfAccountId || '(空)' },
          { k: 'API Key', v: c.apiKey ? '已填' : '(空)' }
        ]);
        return;
      }
      fetchingModels = true;
      const btn = $('btnRefreshModels');
      btn.disabled = true; btn.textContent = '…';
      const cfUrl = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(c.cfAccountId) + '/ai/models/search';
      try {
        const res = await fetch(c.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: c.proxyPassword,
            target: cfUrl,
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + c.apiKey }
          })
        });
        const bodyText = await res.text();
        if (!res.ok) {
          if (!silent) SWC.showDiag('Cloudflare 获取模型失败 HTTP ' + res.status, [
            { k: '目标', v: cfUrl }, { k: '状态', v: res.status },
            { k: '响应体', v: bodyText.slice(0, 2000) }
          ]);
          return;
        }
        let data;
        try { data = JSON.parse(bodyText); }
        catch {
          if (!silent) SWC.showDiag('响应不是 JSON', [
            { k: '目标', v: cfUrl }, { k: '响应体', v: bodyText.slice(0, 2000) }
          ]);
          return;
        }
        let list = [];
        if (data.result && Array.isArray(data.result)) {
          list = data.result.map(m => m.name || m.id).filter(Boolean);
        } else if (Array.isArray(data)) {
          list = data.map(m => m.name || m.id).filter(Boolean);
        }
        if (list.length === 0) {
          if (!silent) SWC.showDiag('未解析到 Cloudflare 模型', [
            { k: '目标', v: cfUrl }, { k: '响应体', v: bodyText.slice(0, 2000) }
          ]);
          return;
        }
        SWC.state.modelsCache = list;
        SWC.saveModelsCache(list);
        renderModelList();
        if (!SWC.state.curMeta?.model && !c.model) selectModel(list[0]);
      } catch (e) {
        if (!silent) SWC.showDiag('Cloudflare 获取模型网络异常', [
          { k: '代理地址', v: c.proxyUrl }, { k: '异常', v: e.name + ': ' + e.message }
        ]);
      } finally {
        fetchingModels = false;
        btn.disabled = false; btn.textContent = '↻';
      }
      return;
    }

    if (!c.apiKey) {
      if (!silent) SWC.showDiag('API Key 未填写', [
        { k: '配置名', v: c.name },
        { k: '提示', v: '自动模式下需要填写 API Key' }
      ]);
      return;
    }

    const targets = [];
    if (c.apiBase) {
      targets.push({ label: '主 API', url: c.apiBase.replace(/\/+$/, '') + '/models' });
    }
    if (c.fallbackModelsUrl) {
      const u = (c.fallbackModelsUrl || '').trim();
      if (u) targets.push({ label: '备用模型列表', url: u });
    }
    if (targets.length === 0) {
      if (!silent) SWC.showDiag('未配置 API 地址', [
        { k: '配置名', v: c.name },
        '请在配置里填写「API 地址」或「备用模型列表地址」。'
      ]);
      return;
    }

    fetchingModels = true;
    const btn = $('btnRefreshModels');
    btn.disabled = true; btn.textContent = '…';
    const attemptLog = [];
    let list = null;
    let successTarget = null;

    for (const t of targets) {
      try {
        const res = await fetch(c.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: c.proxyPassword,
            target: t.url,
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + c.apiKey }
          })
        });
        const bodyText = await res.text();
        if (!res.ok) {
          attemptLog.push({
            k: t.label + ' [' + t.url + ']',
            v: 'HTTP ' + res.status + ' ' + (res.statusText || '') + ' | ' + bodyText.slice(0, 200)
          });
          continue;
        }
        let data;
        try { data = JSON.parse(bodyText); }
        catch {
          attemptLog.push({
            k: t.label + ' [' + t.url + ']',
            v: '响应不是 JSON | ' + bodyText.slice(0, 200)
          });
          continue;
        }
        let arr = [];
        if (Array.isArray(data.data)) arr = data.data.map(m => m.id || m.name).filter(Boolean);
        else if (Array.isArray(data.models)) arr = data.models.map(m => m.id || m.name).filter(Boolean);
        else if (Array.isArray(data)) arr = data.map(m => (typeof m === 'string' ? m : (m.id || m.name))).filter(Boolean);
        if (arr.length === 0) {
          attemptLog.push({
            k: t.label + ' [' + t.url + ']',
            v: '未解析到模型列表 | ' + bodyText.slice(0, 200)
          });
          continue;
        }
        list = arr;
        successTarget = t;
        break;
      } catch (e) {
        attemptLog.push({
          k: t.label + ' [' + t.url + ']',
          v: '网络异常: ' + e.name + ': ' + e.message
        });
        continue;
      }
    }

    btn.disabled = false; btn.textContent = '↻';
    fetchingModels = false;

    if (!list) {
      if (!silent) {
        SWC.showDiag('获取模型失败：所有地址都不可用', [
          { k: '配置', v: c.name },
          { k: '尝试次数', v: targets.length },
          '',
          ...attemptLog
        ]);
      }
      return;
    }

    SWC.state.modelsCache = list;
    SWC.saveModelsCache(list);
    renderModelList();
    if (!SWC.state.curMeta?.model && !c.model) selectModel(list[0]);
    if (successTarget.label !== '主 API') {
      SWC.showToast('已通过「' + successTarget.label + '」获取模型');
    }
  }

  // ═══════════════════ 模型配置管理 ═══════════════════
  function openModelManager() { renderModelManagerList(); $('modelManagerModal').classList.add('show'); }
  function closeModelManager() { $('modelManagerModal').classList.remove('show'); }
  function renderModelManagerList() {
    const s = SWC.state;
    modelManagerList.innerHTML = '';
    const index = SWC.loadModelConfigIndex();
    if (index.length === 0) {
      modelManagerList.innerHTML = '<div class="popup-empty">无配置</div>';
      return;
    }
    index.forEach(item => {
      const state = SWC.getSyncState(item.id);
      const isCurrent = item.id === s.currentModelConfigId;
      const it = document.createElement('div');
      it.className = 'conf-item' + (isCurrent ? ' active' : '');
      it.innerHTML =
        '<span class="sync-icon" data-state="' + state + '" title="' + state + '">' + stateIcon(state) + '</span>' +
        '<span class="n">' + SWC.esc(item.name || '未命名') + '</span>' +
        '<button data-act="edit">编辑</button>' +
        '<button data-act="sync">同步</button>' +
        '<button data-act="switch">' + (isCurrent ? '当前' : '切换') + '</button>' +
        '<span class="m">' + SWC.esc(item.apiBase || '未设置地址') + '</span>';
      it.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const c = s.modelConfigs.find(x => x.id === item.id);
        closeModelManager();
        openModelEdit(c);
      });
      it.querySelector('[data-act="sync"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await SWC.syncModelConfigOne(item.id, false);
        renderModelManagerList();
      });
      it.querySelector('[data-act="switch"]').addEventListener('click', (e) => {
        e.stopPropagation();
        switchModelConfig(item.id);
        renderModelManagerList();
      });
      modelManagerList.appendChild(it);
    });
  }
  SWC.renderModelManagerList = renderModelManagerList;
  $('mmAdd').addEventListener('click', () => { closeModelManager(); openModelEdit(null); });
  $('mmClose').addEventListener('click', closeModelManager);
  $('mmSyncAll').addEventListener('click', async () => { await SWC.syncModelConfigAll(false); renderModelManagerList(); });
  $('mmCheckState').addEventListener('click', async () => { await SWC.checkModelConfigState(); renderModelManagerList(); });

  function openModelEdit(cfg) {
    const s = SWC.state;
    s.editingModelConfigId = cfg ? cfg.id : null;
    const c = cfg || SWC.defaultModelConfig('模型配置 ' + (s.modelConfigs.length + 1));
    $('meTitle').textContent = cfg ? '编辑模型配置' : '新建模型配置';
    $('meName').value = c.name || '';
    $('meProxyUrl').value = c.proxyUrl || '/api/aiapi';
    $('meProxyPassword').value = c.proxyPassword || '';
    $('meApiBase').value = c.apiBase || '';
    $('meFallbackModelsUrl').value = c.fallbackModelsUrl || '';
    $('meManualModels').value = c.manualModels || '';
    $('meModelMode').value = c.modelMode || 'auto';
    $('meCfAccountId').value = c.cfAccountId || '';
    $('meApiKey').value = c.apiKey || '';
    $('meSystem').value = c.systemPrompt || '';
    $('meTemperature').value = (typeof c.temperature === 'number') ? c.temperature : '';
    $('meAutoCollapse').checked = c.autoCollapseReason !== false;
    $('meCtxWindow').value = c.ctxWindow ?? 64000;
    $('meSummaryThreshold').value = c.summaryThreshold ?? 75;
    $('meDelete').style.display = cfg ? 'inline-block' : 'none';
    $('modelEditModal').classList.add('show');
  }
  SWC.openModelEdit = openModelEdit;
  function closeModelEdit() {
    $('modelEditModal').classList.remove('show');
    SWC.state.editingModelConfigId = null;
  }
  $('meCancel').addEventListener('click', closeModelEdit);
  $('meDelete').addEventListener('click', async () => {
    const id = SWC.state.editingModelConfigId;
    if (!id) return;
    closeModelEdit();
    await SWC.strictDeleteModelConfig(id);
  });
  $('meSave').addEventListener('click', () => {
    const s = SWC.state;
    const name = $('meName').value.trim() || '未命名配置';
    const tempRaw = $('meTemperature').value.trim();
    let temperature = null;
    if (tempRaw !== '') {
      const n = parseFloat(tempRaw);
      if (!isNaN(n)) temperature = n;
    }
    const newCfg = {
      id: s.editingModelConfigId || SWC.uuid(),
      name,
      proxyUrl: $('meProxyUrl').value.trim() || '/api/aiapi',
      proxyPassword: $('meProxyPassword').value,
      apiBase: $('meApiBase').value.trim(),
      fallbackModelsUrl: $('meFallbackModelsUrl').value.trim(),
      manualModels: $('meManualModels').value.trim(),
      modelMode: $('meModelMode').value || 'auto',
      cfAccountId: $('meCfAccountId').value.trim(),
      apiKey: $('meApiKey').value,
      systemPrompt: $('meSystem').value,
      temperature,
      autoCollapseReason: $('meAutoCollapse').checked,
      ctxWindow: parseInt($('meCtxWindow').value) || 64000,
      summaryThreshold: parseInt($('meSummaryThreshold').value) || 75,
      model: '',
      savedAt: Date.now()
    };
    if (s.editingModelConfigId) {
      const idx = s.modelConfigs.findIndex(c => c.id === s.editingModelConfigId);
      if (idx >= 0) {
        newCfg.model = s.modelConfigs[idx].model || '';
        s.modelConfigs[idx] = newCfg;
      }
    } else {
      s.modelConfigs.push(newCfg);
      s.currentModelConfigId = newCfg.id;
      SWC.setCookie('swc_ai_current', newCfg.id);
    }
    SWC.saveModelConfig(newCfg);
    SWC.setSyncState(newCfg.id, 'local-newer');
    closeModelEdit();
    updateConfigLabel();
    updateModelLabel();
    renderModelManagerList();
  });

  // ═══════════════════ 搜索配置管理 ═══════════════════
  function openSearchManager() { renderSearchManagerList(); $('searchManagerModal').classList.add('show'); }
  function closeSearchManager() { $('searchManagerModal').classList.remove('show'); }
  function renderSearchManagerList() {
    const s = SWC.state;
    searchManagerList.innerHTML = '';
    const index = SWC.loadSearchConfigIndex();
    if (index.length === 0) {
      searchManagerList.innerHTML = '<div class="popup-empty">无配置</div>';
      return;
    }
    index.forEach(item => {
      const state = SWC.getSyncState(item.id);
      const isCurrent = item.id === s.currentSearchConfigId;
      const provider = item.provider === 'serper' ? 'Serper' : 'Tavily';
      const mode = (item.mode || 'agent') === 'agent' ? 'Agent' : 'Simple';
      const it = document.createElement('div');
      it.className = 'conf-item' + (isCurrent ? ' active' : '');
      it.innerHTML =
        '<span class="sync-icon" data-state="' + state + '" title="' + state + '">' + stateIcon(state) + '</span>' +
        '<span class="n">' + SWC.esc(item.name || '未命名') + '</span>' +
        '<button data-act="edit">编辑</button>' +
        '<button data-act="sync">同步</button>' +
        '<button data-act="switch">' + (isCurrent ? '当前' : '切换') + '</button>' +
        '<span class="m">' + provider + ' · ' + mode + (item.enabled ? ' · 已启用' : '') + '</span>';
      it.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const c = s.searchConfigs.find(x => x.id === item.id);
        closeSearchManager();
        openSearchEdit(c);
      });
      it.querySelector('[data-act="sync"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await SWC.syncSearchConfigOne(item.id, false);
        renderSearchManagerList();
      });
      it.querySelector('[data-act="switch"]').addEventListener('click', (e) => {
        e.stopPropagation();
        s.currentSearchConfigId = item.id;
        SWC.setCookie('swc_ai_search_current', item.id);
        updateSearchLabel();
        updateSearchEnabledCheck();
        renderSearchManagerList();
      });
      searchManagerList.appendChild(it);
    });
  }
  SWC.renderSearchManagerList = renderSearchManagerList;
  $('smAdd').addEventListener('click', () => { closeSearchManager(); openSearchEdit(null); });
  $('smClose').addEventListener('click', closeSearchManager);
  $('smSyncAll').addEventListener('click', async () => { await SWC.syncSearchConfigAll(false); renderSearchManagerList(); });
  $('smCheckState').addEventListener('click', async () => { await SWC.checkSearchConfigState(); renderSearchManagerList(); });

  function openSearchEdit(cfg) {
    const s = SWC.state;
    s.editingSearchConfigId = cfg ? cfg.id : null;
    const c = cfg || SWC.defaultSearchConfig('搜索配置 ' + (s.searchConfigs.length + 1));
    $('seTitle').textContent = cfg ? '编辑搜索配置' : '新建搜索配置';
    $('seName').value = c.name || '';
    $('seProxyUrl').value = c.proxyUrl || '/api/aiapi';
    $('seProxyPassword').value = c.proxyPassword || '';
    $('seProvider').value = c.searchProvider || 'tavily';
    $('seTavilyKey').value = c.tavilyApiKey || '';
    $('seSerperKey').value = c.serperApiKey || '';
    $('seMode').value = c.searchMode || 'agent';
    $('seMaxRounds').value = c.maxSearchRounds || 3;
    $('seSystemHint').value = c.systemHint || '';
    $('seEnabled').checked = c.enabled === true;
    $('seDelete').style.display = cfg ? 'inline-block' : 'none';
    $('searchEditModal').classList.add('show');
  }
  SWC.openSearchEdit = openSearchEdit;
  function closeSearchEdit() {
    $('searchEditModal').classList.remove('show');
    SWC.state.editingSearchConfigId = null;
  }
  $('seCancel').addEventListener('click', closeSearchEdit);
  $('seDelete').addEventListener('click', async () => {
    const id = SWC.state.editingSearchConfigId;
    if (!id) return;
    closeSearchEdit();
    await SWC.strictDeleteSearchConfig(id);
  });
  $('seSave').addEventListener('click', () => {
    const s = SWC.state;
    const name = $('seName').value.trim() || '未命名配置';
    const maxRoundsRaw = parseInt($('seMaxRounds').value);
    const maxSearchRounds = (!isNaN(maxRoundsRaw) && maxRoundsRaw > 0) ? Math.min(maxRoundsRaw, 10) : 3;
    const newCfg = {
      id: s.editingSearchConfigId || SWC.uuid(),
      name,
      proxyUrl: $('seProxyUrl').value.trim() || '/api/aiapi',
      proxyPassword: $('seProxyPassword').value,
      searchProvider: $('seProvider').value || 'tavily',
      tavilyApiKey: $('seTavilyKey').value.trim(),
      serperApiKey: $('seSerperKey').value.trim(),
      searchMode: $('seMode').value || 'agent',
      maxSearchRounds: maxSearchRounds,
      systemHint: $('seSystemHint').value.trim(),
      enabled: $('seEnabled').checked,
      savedAt: Date.now()
    };
    if (s.editingSearchConfigId) {
      const idx = s.searchConfigs.findIndex(c => c.id === s.editingSearchConfigId);
      if (idx >= 0) s.searchConfigs[idx] = newCfg;
    } else {
      s.searchConfigs.push(newCfg);
      s.currentSearchConfigId = newCfg.id;
      SWC.setCookie('swc_ai_search_current', newCfg.id);
    }
    SWC.saveSearchConfig(newCfg);
    SWC.setSyncState(newCfg.id, 'local-newer');
    closeSearchEdit();
    updateSearchLabel();
    updateSearchEnabledCheck();
    renderSearchManagerList();
  });

  // ═══════════════════ 云同步面板 ═══════════════════
  async function renderCloudList() {
    cloudList.innerHTML = '<div class="popup-empty">加载中…</div>';
    const data = await SWC.cloudApi({});
    if (data.error) {
      cloudList.innerHTML = '<div class="popup-empty">加载失败：' + SWC.esc(data.error) + '</div>';
      return;
    }
    const index = Array.isArray(data.index) ? data.index : [];
    const localIds = SWC.S.idx();
    const allIds = new Set([...localIds, ...index.map(x => x.id)]);
    if (allIds.size === 0) {
      cloudList.innerHTML = '<div class="popup-empty">暂无对话</div>';
      return;
    }
    const cloudMap = new Map(index.map(x => [x.id, x]));
    const localMap = new Map();
    for (const id of localIds) {
      const m = SWC.S.meta(id);
      if (m) localMap.set(id, m);
    }
    const merged = [];
    for (const id of allIds) {
      const lm = localMap.get(id);
      const cm = cloudMap.get(id);
      const savedAt = Math.max(lm?.savedAt || 0, cm?.savedAt || 0);
      merged.push({ id, lm, cm, savedAt });
    }
    merged.sort((a, b) => b.savedAt - a.savedAt);
    cloudList.innerHTML = '';
    merged.forEach(({ id, lm, cm }) => {
      const isGen = SWC.state.runningConvs.has(id);
      const state = SWC.getSyncState(id);
      let title = '未命名', turnCount = 0, time = 0;
      if (lm) { title = lm.title; turnCount = lm.turnCount || 0; time = lm.savedAt; }
      else if (cm) { title = cm.title; turnCount = cm.turnCount || 0; time = cm.savedAt; }
      const row = document.createElement('div');
      row.className = 'cloud-row';
      const leftIcon = isGen
        ? '<span class="spin" title="生成中"></span>'
        : '<span class="sync-icon" data-state="' + state + '" title="' + state + '">' + stateIcon(state) + '</span>';
      row.innerHTML = leftIcon +
        '<div class="info"><div class="t">' + SWC.esc(title) + '</div>' +
        '<div class="m">' + turnCount + ' 轮 · ' + SWC.fmtTime(time) + '</div></div>';
      if (lm && !isGen) {
        const up = document.createElement('button');
        up.textContent = '上传';
        up.addEventListener('click', async () => {
          const ok = await SWC.forceUpload(id);
          if (ok) { renderCloudList(); renderConvList(); }
          else alert('上传失败');
        });
        row.appendChild(up);
      }
      if (cm && !isGen) {
        const down = document.createElement('button');
        down.textContent = '下载';
        down.addEventListener('click', async () => {
          const ok = await SWC.forceDownload(id);
          if (ok) { renderCloudList(); renderConvList(); }
          else alert('下载失败');
        });
        row.appendChild(down);
      }
      cloudList.appendChild(row);
    });
  }
  $('btnCloud').addEventListener('click', (e) => {
    e.stopPropagation();
    if (cloudPopup.classList.contains('show')) { closeAllPopups(); return; }
    cloudPopup.classList.add('show');
    popupMask.classList.add('show');
    cloudPopup.style.top = '50px';
    cloudPopup.style.right = '16px';
    cloudPopup.style.left = 'auto';
    renderCloudList();
  });
  cloudPopup.addEventListener('click', e => e.stopPropagation());
  $('btnCloudRefresh').addEventListener('click', renderCloudList);
  $('btnSyncAll').addEventListener('click', async () => { await SWC.syncAll(false); renderCloudList(); });
  $('btnCheckState').addEventListener('click', async () => { await SWC.checkState(); renderCloudList(); });

  // ═══════════════════ 侧边栏 ═══════════════════
  function openSidebar() { sidebarEl.classList.add('open'); sidebarMask.classList.add('show'); }
  function closeSidebar() { sidebarEl.classList.remove('open'); sidebarMask.classList.remove('show'); }
  btnMenu.addEventListener('click', openSidebar);
  sidebarMask.addEventListener('click', closeSidebar);

  $('btnNewConv').addEventListener('click', () => {
    const s = SWC.state;
    s.curId = null; s.curMeta = null; s.curTurns = [];
    btnConfig.classList.remove('error');
    renderChat();
    if (window.innerWidth <= 768 && window.innerHeight > window.innerWidth) closeSidebar();
    inputEl.focus();
  });

  $('btnDlAll').addEventListener('click', downloadAll);

  btnSend.addEventListener('click', () => SWC.send());
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); SWC.send(); }
  });
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
  });

  // ═══════════════════ 启动 ═══════════════════
  (function init() {
    const ids = SWC.S.idx();
    if (ids.length > 0) SWC.loadConv(ids[0]);
    updateDebugButton();
    renderChat();
    updateConfigLabel();
    updateModelLabel();
    updateSearchLabel();
    updateSearchEnabledCheck();
  })();

})(window.SWC);
