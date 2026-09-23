// ai-chat.js — 发送流程、流式解析、Agent 循环、消息操作
(function (SWC) {
  "use strict";

  // ═══════════════════ 消息操作 ═══════════════════
  SWC.copyText = function (text) {
    if (!text) { SWC.showToast('无内容'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => SWC.showToast('已复制')).catch(() => SWC.fallbackCopy(text));
    } else SWC.fallbackCopy(text);
  };
  SWC.fallbackCopy = function (text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      SWC.showToast('已复制');
    } catch { SWC.showToast('复制失败'); }
  };

  SWC.toggleMark = function (idx) {
    const st = SWC.state;
    if (idx < 0 || idx >= st.curTurns.length) return;
    st.curTurns[idx].marked = !st.curTurns[idx].marked;
    if (st.curId) {
      SWC.S.setTurn(st.curId, idx, st.curTurns[idx]);
      SWC.touchConv(st.curId);
    }
    if (SWC.renderChat) SWC.renderChat();
    SWC.showToast(st.curTurns[idx].marked ? '已标记' : '已取消标记');
  };

  SWC.deleteTurn = function (idx) {
    const st = SWC.state;
    if (idx < 0 || idx >= st.curTurns.length) return;
    if (st.curId && st.runningConvs.has(st.curId)) { alert('此对话正在生成中，请先停止后再删除。'); return; }
    if (!confirm('删除这轮对话？（用户消息和 AI 回复都会删除）')) return;
    st.curTurns.splice(idx, 1);
    if (st.curId) { SWC.S.rewriteTurns(st.curId, st.curTurns); SWC.touchConv(st.curId); }
    if (SWC.renderChat) SWC.renderChat();
  };

  SWC.resendTurn = async function (idx) {
    const st = SWC.state;
    if (!st.curId) return;
    if (st.runningConvs.has(st.curId)) { alert('正在生成中，请先停止'); return; }
    if (idx < 0 || idx >= st.curTurns.length) return;
    const turn = st.curTurns[idx];
    if (!turn) return;
    const userContent = turn.user.content;
    if (!userContent) return;
    st.curTurns = st.curTurns.slice(0, idx);
    SWC.S.rewriteTurns(st.curId, st.curTurns);
    if (SWC.renderChat) SWC.renderChat();
    const inputEl = document.getElementById('input');
    if (inputEl) inputEl.value = userContent;
    await SWC.send();
  };

  SWC.touchConv = function (id) {
    const m = SWC.S.meta(id); if (!m) return;
    m.savedAt = Date.now(); m.schema = 2;
    SWC.S.setMeta(id, m);
    SWC.setSyncState(id, 'local-newer');
  };

  SWC.newConv = function () {
    const c = SWC.curModelConfig();
    const id = SWC.uuid();
    const m = {
      schema: 2, id, title: '新对话',
      model: c.model || '', configId: c.id, configName: c.name,
      reasoning: '', createdAt: Date.now(), savedAt: Date.now(),
      turnCount: 0, summary: ''
    };
    SWC.S.setMeta(id, m); SWC.S.add(id);
    SWC.setSyncState(id, 'local-only');
    return m;
  };
  SWC.loadConv = function (id) {
    const st = SWC.state;
    const m = SWC.S.meta(id); if (!m) return false;
    st.curId = id; st.curMeta = m; st.curTurns = SWC.S.turns(id, m.turnCount || 0);
    if (m.configId) {
      const cfg = SWC.modelConfigById(m.configId);
      if (cfg) {
        if (st.currentModelConfigId !== cfg.id) {
          st.currentModelConfigId = cfg.id;
          SWC.setCookie('swc_ai_current', cfg.id);
          st.modelsCache = SWC.loadModelsCache();
        }
        const btnConfig = document.getElementById('btnConfig');
        if (btnConfig) btnConfig.classList.remove('error');
      } else {
        const btnConfig = document.getElementById('btnConfig');
        if (btnConfig) btnConfig.classList.add('error');
      }
    } else {
      const btnConfig = document.getElementById('btnConfig');
      if (btnConfig) btnConfig.classList.add('error');
    }
    return true;
  };
  SWC.delConv = function (id) {
    const st = SWC.state;
    const run = st.runningConvs.get(id);
    if (run) {
      if (run.saveTimer) clearInterval(run.saveTimer);
      if (run.ac) try { run.ac.abort(); } catch {}
      st.runningConvs.delete(id);
    }
    SWC.S.delConv(id);
    SWC.delSyncState(id);
    if (st.curId === id) {
      const r = SWC.S.idx();
      if (r.length > 0) SWC.loadConv(r[0]);
      else { st.curId = null; st.curMeta = null; st.curTurns = []; }
    }
  };

  // ═══════════════════ 引用来源面板 ═══════════════════
  SWC.buildRefsPanel = function (searchResults) {
    const refPanel = document.createElement('details');
    refPanel.className = 'search-refs';
    const summary = document.createElement('summary');
    summary.textContent = '📎 参考来源 (' + searchResults.length + ')';
    refPanel.appendChild(summary);
    const refList = document.createElement('div');
    refList.className = 'ref-list';
    searchResults.forEach((r, i) => {
      const item = document.createElement('a');
      item.className = 'ref-item';
      item.href = r.url;
      item.target = '_blank';
      item.rel = 'noopener';
      item.textContent = '[' + (i + 1) + '] ' + (r.title || r.url);
      refList.appendChild(item);
    });
    refPanel.appendChild(refList);
    return refPanel;
  };

  // ═══════════════════ 消息格式规范化（Cloudflare 兼容） ═══════════════════
  // Cloudflare Workers AI 的 schema 比标准 OpenAI 更严格：
  //   - assistant 消息必须有 content 字段，且必须是字符串（不能是 null / 数组）
  //   - 系统消息的 content 不能是数组
  // 在 agent 循环里回传历史时，如果 content 为 null 会直接 400。
  function normalizeMessages(messages) {
    return messages.map(m => {
      const out = { ...m };
      if (Array.isArray(out.content)) {
        out.content = out.content.map(p => (p && p.text) || '').join('');
      } else if (out.content === null || out.content === undefined) {
        out.content = '';
      } else {
        out.content = String(out.content);
      }
      return out;
    });
  }

  // ═══════════════════ 流式请求一次 ═══════════════════
  async function streamFetchOnce(messages, tools, ctx) {
    const { c, model, turn, ac, updateStreamingUI } = ctx;

    const isCF = SWC.isCloudflareEndpoint(c.apiBase);
    const finalMessages = isCF ? normalizeMessages(messages) : messages;

    const body = { model, messages: finalMessages, stream: true };
    if (typeof c.temperature === 'number' && !isNaN(c.temperature)) body.temperature = c.temperature;
    if (turn.reasoning) body.reasoning_effort = turn.reasoning;
    if (tools && tools.length > 0) body.tools = tools;

    const targetUrl = c.apiBase.replace(/\/+$/, '') + '/chat/completions';
    const envelope = {
      password: c.proxyPassword,
      target: targetUrl,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + c.apiKey,
        'Content-Type': 'application/json'
      },
      body
    };

    // ★ 调试模式：显示即将发送的请求
    const toolsInfo = (tools && tools.length > 0)
      ? ('YES (' + tools.length + ') - ' + tools.map(t => t.function.name).join(','))
      : 'NO';
    SWC.debugLog('向 Worker 发送请求', [
      { k: '目标 Worker', v: c.proxyUrl },
      { k: '上游 URL', v: targetUrl },
      { k: '模型', v: model },
      { k: 'tools 参数', v: toolsInfo },
      { k: 'temperature', v: typeof c.temperature === 'number' ? c.temperature : '(未发送)' },
      { k: 'reasoning_effort', v: turn.reasoning || '(未发送)' },
      { k: 'messages 数量', v: finalMessages.length },
      '',
      'messages 预览：',
      JSON.stringify(finalMessages, null, 2).slice(0, 3000)
    ]);

    let res;
    try {
      res = await fetch(c.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
        signal: ac.signal
      });
    } catch (e) {
      SWC.debugError('网络请求异常', [
        { k: 'Worker URL', v: c.proxyUrl },
        { k: '上游 URL', v: targetUrl },
        { k: '异常', v: e.name + ': ' + e.message }
      ]);
      throw e;
    }

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      err.responseText = errText;
      SWC.debugError('HTTP ' + res.status + ' 错误', [
        { k: 'Worker URL', v: c.proxyUrl },
        { k: '上游 URL', v: targetUrl },
        { k: '状态码', v: res.status + ' ' + res.statusText },
        { k: 'tools 参数', v: toolsInfo },
        { k: '响应体', v: errText.slice(0, 3000) }
      ]);
      throw err;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let content = '';
    let reasoningContent = '';
    const toolCallsAccum = {};
    let sawToolCalls = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const p = line.slice(5).trim();
        if (!p || p === '[DONE]') continue;
        try {
          const j = JSON.parse(p);
          const d = j.choices?.[0]?.delta || j.choices?.[0]?.message || {};
          if (typeof d.reasoning_content === 'string' && d.reasoning_content) {
            reasoningContent += d.reasoning_content;
            if (!sawToolCalls) {
              turn.assistant.reasoning_content = reasoningContent;
              updateStreamingUI();
            }
          }
          if (typeof d.thinking === 'string' && d.thinking) {
            reasoningContent += d.thinking;
            if (!sawToolCalls) {
              turn.assistant.reasoning_content = reasoningContent;
              updateStreamingUI();
            }
          }
          if (typeof d.content === 'string' && d.content) {
            content += d.content;
            if (!sawToolCalls) {
              turn.assistant.content = content;
              updateStreamingUI();
            }
          }
          if (Array.isArray(d.tool_calls) && d.tool_calls.length > 0) {
            if (!sawToolCalls) {
              sawToolCalls = true;
              content = ''; reasoningContent = '';
              turn.assistant.content = '';
              turn.assistant.reasoning_content = '';
              updateStreamingUI();
            }
            for (const tc of d.tool_calls) {
              const idx = (typeof tc.index === 'number') ? tc.index : 0;
              if (!toolCallsAccum[idx]) {
                toolCallsAccum[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
              }
              const acc = toolCallsAccum[idx];
              if (tc.id) acc.id = tc.id;
              if (tc.type) acc.type = tc.type;
              if (tc.function) {
                if (tc.function.name) acc.function.name = tc.function.name;
                if (typeof tc.function.arguments === 'string') acc.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {}
      }
    }

    const toolCalls = Object.keys(toolCallsAccum)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map(k => toolCallsAccum[k]);

    return { content, reasoningContent, toolCalls };
  }

  // ═══════════════════ 三种流程 ═══════════════════
  async function runPlainFlow(baseMessages, ctx) {
    const result = await streamFetchOnce(baseMessages, [], ctx);
    ctx.turn.assistant.content = result.content;
    ctx.turn.assistant.reasoning_content = result.reasoningContent;
    ctx.updateStreamingUI();
  }

  async function runSimpleFlow(baseMessages, ctx) {
    const { sc, text, convId, ti, turn } = ctx;
    let searchContext = '';
    if (sc && sc.enabled === true) {
      const provider = sc.searchProvider || 'tavily';
      const searchKey = provider === 'tavily' ? sc.tavilyApiKey : sc.serperApiKey;
      if (searchKey && sc.proxyPassword) {
        const statusEl = ctx.showStatus('🔍 正在搜索「' + text.slice(0, 30) + (text.length > 30 ? '…' : '') + '」...');
        const searchResult = await SWC.performSearch(text, sc);
        if (statusEl) statusEl.remove();

        if (searchResult.error) {
          ctx.showStatus('⚠️ 搜索失败：' + searchResult.error + '（继续对话）', 3000);
        } else if (searchResult.results && searchResult.results.length > 0) {
          turn.searchResults = searchResult.results;
          SWC.S.setTurn(convId, ti, turn);
          searchContext = SWC.buildSearchContextFromResults(searchResult.results);
          ctx.showStatus('✅ 搜索完成，共 ' + searchResult.results.length + ' 条结果', 2000);
        } else {
          ctx.showStatus('⚠️ 未找到相关结果（继续对话）', 2500);
        }
      }
    }

    let finalMessages = baseMessages;
    if (searchContext) {
      finalMessages = baseMessages.slice(0, -1).concat([{
        role: 'user',
        content: searchContext + '用户问题：' + text
      }]);
    }

    const result = await streamFetchOnce(finalMessages, [], ctx);
    turn.assistant.content = result.content;
    turn.assistant.reasoning_content = result.reasoningContent;
    ctx.updateStreamingUI();
  }

  async function runAgentFlow(baseMessages, ctx) {
    const { sc, text, model, turn, convId } = ctx;
    const tools = SWC.buildToolsDefinition(sc);
    let currentMessages = baseMessages.slice();
    let maxRounds = parseInt(sc.maxSearchRounds) || 3;
    let round = 0;
    let collectedResults = [];
    let finalContent = '';
    let finalReasoning = '';

    while (true) {
      const statusText = round === 0 ? '🤔 AI 正在思考...' : '🤔 AI 正在整理...';
      const statusEl = ctx.showStatus(statusText);

      const canUseTools = round < maxRounds;
      const currentTools = canUseTools ? tools : [];

      let result;
      try {
        result = await streamFetchOnce(currentMessages, currentTools, ctx);
      } catch (e) {
        if (statusEl) statusEl.remove();
        if (canUseTools && currentTools.length > 0 && e.status && SWC.isToolsUnsupportedError(e.status, e.responseText)) {
          SWC.markModelNoToolSupport(model);
          SWC.showToast('模型不支持 Agent 模式，已降级为简单搜索');
          turn.assistant.content = '';
          turn.assistant.reasoning_content = '';
          ctx.updateStreamingUI();
          return await runSimpleFlow(baseMessages, ctx);
        }
        throw e;
      }

      if (statusEl) statusEl.remove();

      if (result.content) {
        finalContent = result.content;
        turn.assistant.content = finalContent;
        ctx.updateStreamingUI();
      }
      if (result.reasoningContent) {
        finalReasoning = result.reasoningContent;
        turn.assistant.reasoning_content = finalReasoning;
        ctx.updateStreamingUI();
      }

      if (!result.toolCalls || result.toolCalls.length === 0) break;

      // ★ 追加 assistant 消息（content 强制字符串，兼容 Cloudflare）
      const assistantMsg = {
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls
      };
      if (result.reasoningContent) assistantMsg.reasoning_content = result.reasoningContent;
      currentMessages.push(assistantMsg);

      // 清空本轮 assistant 内容（因为这只是工具调用轮）
      turn.assistant.content = '';
      turn.assistant.reasoning_content = '';
      finalContent = '';
      finalReasoning = '';
      if (ctx.aiBubble) ctx.aiBubble.innerHTML = '';

      // 执行工具
      for (const tc of result.toolCalls) {
        const fnName = tc.function && tc.function.name;
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }

        if (fnName === 'web_search') {
          const query = (args && typeof args.query === 'string' && args.query.trim()) ? args.query.trim() : text;
          const searchStatusEl = ctx.showStatus('🔍 搜索：' + query);
          const searchResult = await SWC.performSearch(query, sc);
          if (searchStatusEl) searchStatusEl.remove();

          let toolContent;
          if (searchResult.error) {
            toolContent = '搜索失败：' + searchResult.error;
            ctx.showStatus('⚠️ 搜索失败：' + searchResult.error, 2500);
          } else if (searchResult.results && searchResult.results.length > 0) {
            toolContent = SWC.buildToolResultText(searchResult.results);
            collectedResults.push(...searchResult.results);
            ctx.showStatus('✅ 找到 ' + searchResult.results.length + ' 条结果', 1500);
          } else {
            toolContent = '未找到相关结果';
            ctx.showStatus('⚠️ 未找到结果', 1500);
          }

          currentMessages.push({ role: 'tool', tool_call_id: tc.id || '', content: String(toolContent || '') });
        } else {
          currentMessages.push({ role: 'tool', tool_call_id: tc.id || '', content: '未知工具：' + (fnName || '(空)') });
        }
      }

      round++;
    }

    if (!finalContent) {
      finalContent = '（AI 未给出文字回答）';
      turn.assistant.content = finalContent;
      if (ctx.aiBubble) ctx.aiBubble.innerHTML = SWC.md(finalContent);
    }

    if (collectedResults.length > 0) {
      turn.searchResults = SWC.dedupeResults(collectedResults);
    }
  }

  // ═══════════════════ send ═══════════════════
  SWC.send = async function () {
    const st = SWC.state;
    if (st.curId && st.runningConvs.has(st.curId)) {
      const run = st.runningConvs.get(st.curId);
      if (run.ac) try { run.ac.abort(); } catch {}
      return;
    }
    const inputEl = document.getElementById('input');
    const text = inputEl.value.trim();
    if (!text) return;

    if (st.curMeta && st.curMeta.configId && !SWC.modelConfigById(st.curMeta.configId)) {
      alert('此对话的模型配置已被删除，请重新选择配置。');
      document.getElementById('btnConfig').click();
      return;
    }

    const c = SWC.curModelConfig();
    if (!c.proxyUrl || !c.proxyPassword || !c.apiBase || !c.apiKey) {
      SWC.showDiag('模型配置不完整', [
        { k: '配置名', v: c.name },
        { k: '代理地址', v: c.proxyUrl || '(空)' },
        { k: '代理密码', v: c.proxyPassword ? '已填' : '(空)' },
        { k: 'API 地址', v: c.apiBase || '(空)' },
        { k: 'API Key', v: c.apiKey ? '已填' : '(空)' }
      ]);
      if (SWC.openModelEdit) SWC.openModelEdit(c);
      return;
    }
    const model = st.curMeta?.model || c.model;
    if (!model) {
      SWC.showDiag('未选择模型', ['点击顶栏「模型」选择或手动输入。']);
      document.getElementById('btnModel').click();
      return;
    }

    if (!st.curId) {
      const m = SWC.newConv();
      st.curId = m.id; st.curMeta = m; st.curTurns = [];
    }
    const convId = st.curId;
    const ti = st.curTurns.length;
    const turn = {
      user: { content: text },
      assistant: { content: '', reasoning_content: '' },
      ts: Date.now(),
      marked: false,
      searchResults: null
    };
    st.curTurns.push(turn);

    if (st.curMeta.turnCount === 0) {
      const t = text.replace(/\s+/g, ' ').trim();
      st.curMeta.title = t.length > 20 ? t.slice(0, 20) + '…' : (t || '新对话');
    }
    st.curMeta.turnCount = st.curTurns.length;
    st.curMeta.savedAt = Date.now();
    st.curMeta.schema = 2;
    SWC.S.setMeta(convId, st.curMeta);
    SWC.S.setTurn(convId, ti, turn);

    inputEl.value = '';
    inputEl.style.height = 'auto';
    const welcomeEl = document.getElementById('welcome');
    if (welcomeEl && welcomeEl.parentNode) welcomeEl.remove();

    const chatEl = document.getElementById('chat');
    const convTitleEl = document.getElementById('convTitle');

    // 用户消息
    const uEl = document.createElement('div');
    uEl.className = 'msg user';
    uEl.innerHTML = '<div class="ava">你</div><div class="wrap"><div class="bubble"></div><div class="msg-actions"><button data-act="copy">复制</button><button data-act="delete">删除</button><button data-act="mark">标记</button></div></div>';
    uEl.querySelector('.bubble').textContent = text;
    uEl.querySelector('[data-act="copy"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.copyText(text); });
    uEl.querySelector('[data-act="delete"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.deleteTurn(ti); });
    uEl.querySelector('[data-act="mark"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.toggleMark(ti); });
    chatEl.appendChild(uEl);

    // AI 消息骨架
    const aEl = document.createElement('div');
    aEl.className = 'msg ai';
    aEl.innerHTML = '<div class="ava">AI</div><div class="wrap"><div class="bubble"></div><div class="msg-actions"><button data-act="copy">复制</button><button data-act="resend">重发</button><button data-act="delete">删除</button><button data-act="mark">标记</button></div></div>';
    const aiWrap = aEl.querySelector('.wrap');
    const aiBubble = aEl.querySelector('.bubble');
    aEl.querySelector('[data-act="copy"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.copyText(turn.assistant.content || ''); });
    aEl.querySelector('[data-act="resend"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.resendTurn(ti); });
    aEl.querySelector('[data-act="delete"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.deleteTurn(ti); });
    aEl.querySelector('[data-act="mark"]').addEventListener('click', (e) => { e.stopPropagation(); SWC.toggleMark(ti); });
    chatEl.appendChild(aEl);

    if (convTitleEl) convTitleEl.textContent = st.curMeta.title;
    if (SWC.renderConvList) SWC.renderConvList();
    chatEl.scrollTop = chatEl.scrollHeight;

    // 构建上下文
    const ctx = SWC.CTX.build(st.curTurns.slice(0, -1), {
      systemPrompt: c.systemPrompt,
      summary: st.curMeta.summary || '',
      ctxWindow: c.ctxWindow || 64000,
      summaryThreshold: c.summaryThreshold || 75
    });

    const sc = SWC.curSearchConfig();
    const searchEnabled = sc && sc.enabled === true;
    const searchMode = sc ? (sc.searchMode || 'agent') : 'off';
    const hasSearchKey = sc ? (sc.searchProvider === 'serper' ? !!sc.serperApiKey : !!sc.tavilyApiKey) : false;

    let effectiveMode = 'off';
    if (searchEnabled && hasSearchKey) {
      if (searchMode === 'agent') {
        if (SWC.isModelSupportTools(model)) {
          effectiveMode = 'agent';
        } else {
          effectiveMode = 'simple';
        }
      } else {
        effectiveMode = 'simple';
      }
    }

    // 调试：显示模式决策
    SWC.debugLog('模式决策', [
      { k: '搜索开关', v: searchEnabled ? 'ON' : 'OFF' },
      { k: '搜索模式配置', v: searchMode },
      { k: '有搜索 Key', v: hasSearchKey ? 'YES' : 'NO' },
      { k: '模型支持 tools 缓存', v: SWC.isModelSupportTools(model) ? 'YES' : 'NO' },
      { k: '是否 CF 端点', v: SWC.isCloudflareEndpoint(c.apiBase) ? 'YES' : 'NO' },
      { k: '最终 effectiveMode', v: effectiveMode }
    ]);

    if (effectiveMode === 'agent' && sc.systemHint) {
      ctx.messages.push({ role: 'system', content: sc.systemHint });
    }
    ctx.messages.push({ role: 'user', content: text });

    const ac = new AbortController();
    const run = {
      ac, turnIdx: ti, turn,
      domRef: { wrap: aiWrap, bubble: aiBubble, reasonEl: null, reasonContentEl: null },
      autoCollapsed: false, saveTimer: null
    };
    st.runningConvs.set(convId, run);
    if (SWC.updateSendButton) SWC.updateSendButton();
    if (SWC.renderConvList) SWC.renderConvList();

    run.saveTimer = setInterval(() => {
      const m = SWC.S.meta(convId);
      if (m) { m.savedAt = Date.now(); SWC.S.setMeta(convId, m); }
      SWC.S.setTurn(convId, ti, turn);
    }, 2000);

    function updateStreamingUI() {
      const r = run.domRef;
      if (!r || !r.wrap || !document.contains(r.wrap)) return;
      if (turn.assistant.reasoning_content) {
        if (!r.reasonEl) {
          r.reasonEl = document.createElement('details');
          r.reasonEl.className = 'reason';
          r.reasonEl.open = true;
          r.reasonEl.innerHTML = '<summary>推理过程</summary><div class="rc"></div>';
          r.reasonContentEl = r.reasonEl.querySelector('.rc');
          r.wrap.insertBefore(r.reasonEl, r.bubble);
        }
        r.reasonContentEl.textContent = turn.assistant.reasoning_content;
        if (!run.autoCollapsed) r.reasonEl.open = true;
      }
      if (turn.assistant.content) {
        if (r.reasonEl && c.autoCollapseReason !== false && !run.autoCollapsed) {
          r.reasonEl.open = false;
          run.autoCollapsed = true;
        }
        r.bubble.innerHTML = SWC.md(turn.assistant.content);
      }
      if (SWC.autoScroll) SWC.autoScroll();
    }

    function showStatus(text, autoRemoveMs) {
      const el = document.createElement('div');
      el.className = 'search-status';
      el.textContent = text;
      chatEl.insertBefore(el, aEl);
      chatEl.scrollTop = chatEl.scrollHeight;
      if (autoRemoveMs) setTimeout(() => { if (el.parentNode) el.remove(); }, autoRemoveMs);
      return el;
    }

    const flowCtx = { c, model, turn, sc, text, convId, ti, ac, aiBubble, updateStreamingUI, showStatus };

    try {
      if (effectiveMode === 'agent') {
        await runAgentFlow(ctx.messages, flowCtx);
      } else if (effectiveMode === 'simple') {
        await runSimpleFlow(ctx.messages, flowCtx);
      } else {
        await runPlainFlow(ctx.messages, flowCtx);
      }
      if (!turn.assistant.content && !turn.assistant.reasoning_content) {
        turn.assistant.content = '（无内容返回）';
        aiBubble.innerHTML = SWC.md(turn.assistant.content);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (!turn.assistant.content && !turn.assistant.reasoning_content) {
          turn.assistant.content = '（已停止）';
          aiBubble.innerHTML = SWC.md(turn.assistant.content);
        }
      } else {
        if (!turn.assistant.content) {
          turn.assistant.content = '⚠ ' + err.message;
          aiBubble.innerHTML = SWC.md(turn.assistant.content);
        }
      }
    } finally {
      if (run.saveTimer) clearInterval(run.saveTimer);
      SWC.S.setTurn(convId, ti, turn);
      const m = SWC.S.meta(convId);
      if (m) { m.savedAt = Date.now(); SWC.S.setMeta(convId, m); }
      st.runningConvs.delete(convId);
      SWC.setSyncState(convId, 'local-newer');
      if (SWC.updateSendButton) SWC.updateSendButton();
      if (SWC.renderConvList) SWC.renderConvList();

      if (st.curId === convId && turn.searchResults && turn.searchResults.length > 0 && !aiWrap.querySelector('.search-refs')) {
        aiWrap.appendChild(SWC.buildRefsPanel(turn.searchResults));
        chatEl.scrollTop = chatEl.scrollHeight;
      }
    }
  };

})(window.SWC);
