/* 订单来了蓝皮书 · 站点逻辑：路由 / 大目录 / 小蓝面板 / 搜索 / 进度记忆 */
(function () {
  const $ = (s) => document.querySelector(s);
  const coverView = $("#coverView"), articleView = $("#articleView"),
        tocView = $("#tocView"), tocViewBody = $("#tocViewBody"),
        topbar = $("#topbar"), fab = $("#fab");
  let M = null;            // manifest
  const cache = {};        // article fragments
  let spy = null, routeVersion = 0, searchData = null, searchPromise = null;
  const getLast = () => { try { return JSON.parse(localStorage.getItem("hb-last") || "null"); } catch { return null; } };
  async function getResource(url, json = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try { const r = await fetch(url, { signal: controller.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await (json ? r.json() : r.text()); }
    finally { clearTimeout(timer); }
  }

  const PICKS = ["04", "10", "12", "17"];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- 数据 ---------------- */
  function embeddedJSON(id) {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  }
  async function load() {
    M = embeddedJSON("manifest-json") || await getResource("data/manifest.json", true);
    renderCover();
    buildTocView();
    buildPet();
    route();
  }
  async function loadArticle(id) {
    if (Object.prototype.hasOwnProperty.call(cache, id)) return cache[id];
    const emb = embeddedJSON("articles-json");
    cache[id] = emb ? (emb[id] || "") : await getResource(`articles/${id}.html`);
    return cache[id];
  }

  const byId = (id) => M.articles.find((a) => a.id === id);
  const pieceNo = (a) => `全书第 ${a.n} / ${M.meta.total} 篇${/^\d+$/.test(a.id) ? " · 实操 " + a.id : ""}`;

  /* ---------------- 封面 ---------------- */
  function renderCover() {
    const m = M.meta;
    $("#tocCount").textContent = m.total;
    $("#heroStats").textContent =
      `${m.total} 篇 · 约 ${(m.chars / 10000).toFixed(1)} 万字 · ${m.shots} 张真机截图 · 64 条官方指令`;

    $(".tocv-title").textContent = `${m.total} 篇，照着做就落地`;
    $(".sec-all").textContent = `全部 ${m.total} 篇 →`;
    $("#heroStats").textContent += ` · 其中 ${M.articles.filter(a => /^\d+$/.test(a.id)).length} 篇编号实操`;
    $("#readingPaths").innerHTML = [["第一次使用", "02", "注册登录 → 跑成第一件事"], ["日常运营", "10", "晨报、交班、点评回复"], ["收益增长", "17", "调价、竞对、淡日去化"], ["多店管理", "24", "多店日报、协作与 SOP"]].map(([name,id,desc]) => `<a href="#/p/${id}" class="path-card"><strong>${name}</strong><span>${desc}</span><b aria-hidden="true">→</b></a>`).join("");
    const titles = M.articles.map((a) => a.short);
    $("#marqueeTrack").innerHTML = [...titles, ...titles].map((t) => `<span>${esc(t)}</span>`).join("");

    $("#pickGrid").innerHTML = PICKS.map((id, i) => {
      const a = byId(id); if (!a) return "";
      return `<a class="pick-card" href="#/p/${a.id}" data-id="${a.id}">
        <span class="pick-tag">${esc(a.groupName)}</span>
        <span class="pick-no">${String(i + 1).padStart(2, "0")}</span>
        <h3 class="pick-title">${esc(a.short)}</h3>
        <p class="pick-ex">${esc(a.excerpt)}…</p>
        <span class="pick-meta">约 ${a.mins} 分钟 · 可照做</span>
        <span class="pick-go" aria-hidden="true">→</span>
      </a>`;
    }).join("");
    document.querySelectorAll(".pick-card").forEach((c) =>
      (c.onclick = () => (location.hash = `#/p/${c.dataset.id}`)));

    const files = ["use", "starter", "revenue", "chain"].map((k, i) => {
      const g = m.groups.find((g) => g.key === k);
      const descs = {
        use: "先把工作台跑通。下载注册、主界面、第一件事、喂资料、手机接力、权限三道锁……",
        starter: "开店一天的高频动作。晨报、交班、差评、咨询、好评、周复盘，照着做就落地。",
        revenue: "让每间房卖出对的价。调价建议、竞对、淡日去化、节假日三套方案、ROI……",
        chain: "一个人把管理半径拉大。多店日报、企业微信打通、SOP 造技能、新店 30 天上线。",
      };
      return `<a class="file-card" href="#/toc/${k}" data-g="${k}">
        <span class="file-no">FILE / ${String(i + 1).padStart(2, "0")}</span>
        <h3 class="file-name">${esc(g.name)}</h3>
        <p class="file-desc">${descs[k]}</p>
        <span class="file-count"><b>${g.count}</b> 篇 <span>→</span></span>
      </a>`;
    }).join("");
    $("#fileGrid").innerHTML = files;
    document.querySelectorAll(".file-card").forEach((c) =>
      (c.onclick = () => { location.hash = `#/toc/${c.dataset.g}`; }));

    const last = getLast();
    if (last && byId(last.id)) {
      $("#continueTitle").textContent = byId(last.id).short;
      const link = $("#continueLink");
      link.href = `#/p/${last.id}`;
      link.hidden = false;
    }
  }

  /* ---------------- 大目录页 ---------------- */
  function buildTocView() {
    tocViewBody.innerHTML = M.meta.groups.map((g, gi) => {
      const list = M.articles.filter((a) => a.group === g.key);
      const sub = list.length ? list[0].groupSub : "";
      return `
      <section class="tocv-group" id="group-${g.key}">
        <div class="tocv-ghead">
          <span class="tocv-gno">${String(gi + 1).padStart(2, "0")}</span>
          <span class="tocv-gname">${esc(g.name)}</span>
          <span class="tocv-gsub">${esc(sub || "")}</span>
          <span class="tocv-gcnt">${g.count} 篇</span>
        </div>
        ${list.map((a) => `
        <a class="tocv-item" href="#/p/${a.id}">
          <span class="tocv-no">${String(a.n).padStart(2, "0")}</span>
          <span class="tocv-name">${esc(a.short)}</span>
          <span class="tocv-meta">${a.shots ? a.shots + " 图 · " : ""}约 ${a.mins} 分钟</span>
        </a>`).join("")}
      </section>`;
    }).join("");
  }
  function markActive(id) {
    $("#petPanelBody").querySelectorAll(".pg-item").forEach((it) =>
      it.classList.toggle("active", it.dataset.id === id));
  }

  /* ---------------- 小蓝 · 宠物目录 ---------------- */
  const pet = $("#pet"), petPanel = $("#petPanel"), petBubble = $("#petBubble");
  let petOpened = false;
  function buildPet() {
    $("#petPanelBody").innerHTML = M.meta.groups.map((g) => `
      <div class="pg">
        <div class="pg-hd"><span>${esc(g.name)}</span><span class="pg-cnt">${g.count} 篇</span></div>
        <div class="pg-items">
          ${M.articles.filter((a) => a.group === g.key).map((a) =>
            `<a class="pg-item" href="#/p/${a.id}" data-id="${a.id}"><span class="pg-no">${String(a.n).padStart(2, "0")}</span><span>${esc(a.short)}</span></a>`).join("")}
        </div>
      </div>`).join("");
    $("#petPanelBody").querySelectorAll(".pg-item").forEach((it) =>
      it.addEventListener("click", () => closePet()));
    const last = getLast();
    $("#petPanelFt").innerHTML =
      (last && byId(last.id) ? `<a class="ppf-cont" href="#/p/${last.id}">↪ 继续读《${esc(byId(last.id).short)}》</a>` : "") +
      `<button id="ppfSearch">搜索</button><button id="ppfContact">联系我</button><a href="#/">封面</a>`;
    $("#ppfSearch").onclick = () => { closePet(); openSearch(); };
    $("#ppfContact").onclick = () => { closePet(); openContact(); };
  }
  function openPet() {
    petPanel.hidden = false; petBubble.hidden = true; petOpened = true; $("#petPanelClose").focus();
  }
  function closePet() { petPanel.hidden = true; }
  $("#petBtn").onclick = () => { petPanel.hidden ? openPet() : closePet(); };
  $("#petPanelClose").onclick = closePet;
  document.addEventListener("click", (e) => {
    if (!petPanel.hidden && !petPanel.contains(e.target) && !pet.contains(e.target)) closePet();
  });
  // 首次到访 1.4s 后打招呼，打开过一次就不再打扰
  setTimeout(() => { if (!petOpened) petBubble.hidden = false; }, 1400);
  setTimeout(() => { petBubble.hidden = true; }, 9000);

  /* ---------------- 阅读进度条 ---------------- */
  const readProgress = $("#readProgress");
  function onScrollProgress() {
    if (articleView.hidden) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    readProgress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  window.addEventListener("scroll", onScrollProgress, { passive: true });

  function goToc() { location.hash = "#/toc"; }
  $("#tocBtn").onclick = (e) => { e.stopPropagation(); goToc(); };

  /* ---------------- 路由 ---------------- */
  function route() {
    if (!M) return;
    ++routeVersion;
    const h = location.hash;
    closeSearch(); closeContact(); closeImage();
    const m = h.match(/^#\/p\/([\w-]+)/);
    if (m && byId(m[1])) showArticle(byId(m[1]), h.split("#")[2]);
    else if (h.startsWith("#/toc")) showToc();
    else showCover();
  }
  window.addEventListener("hashchange", route);

  function showToc() {
    document.body.classList.remove("reading");
    coverView.hidden = true; articleView.hidden = true; tocView.hidden = false;
    topbar.hidden = false; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "全书目录 · 订单来了蓝皮书";
    closePet();
    window.scrollTo(0, 0);
    const group = location.hash.split("/")[2];
    if (group) document.getElementById(`group-${group}`)?.scrollIntoView();
  }

  function showCover() {
    document.body.classList.remove("reading");
    coverView.hidden = false; articleView.hidden = true; tocView.hidden = true;
    topbar.hidden = true; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "订单来了酒店民宿 AI 实操入门蓝皮书";
    closePet();
    const last = getLast();
    if (last && byId(last.id)) {
      $("#continueTitle").textContent = byId(last.id).short;
      $("#continueLink").href = `#/p/${last.id}`;
      $("#continueLink").hidden = false;
    }
    window.scrollTo(0, 0);
  }

  async function showArticle(a, sec) {
    const version = routeVersion;
    document.body.classList.add("reading");
    if (spy) { spy.disconnect(); spy = null; }
    $("#artToc").innerHTML = ""; $("#mobileToc").hidden = true; $("#mobileToc").open = false; $("#artNav").innerHTML = "";
    coverView.hidden = true; articleView.hidden = false; tocView.hidden = true;
    topbar.hidden = false; fab.hidden = false;
    readProgress.hidden = false; readProgress.style.width = "0";
    closePet();
    document.title = `${a.short} · 订单来了蓝皮书`;
    markActive(a.id);
    try { localStorage.setItem("hb-last", JSON.stringify({ id: a.id })); } catch {}

    $("#crumb").innerHTML = `<a href="#/">封面</a>　/　${esc(a.groupName)}｜${esc(a.groupSub)}`;
    $("#artTitle").textContent = a.title;
    $("#artMeta").innerHTML =
      (a.tag ? `<span class="art-tag">${esc(a.tag)}</span><br>` : "") +
      `${pieceNo(a)}　·　${a.shots ? a.shots + " 张真机图　·　" : ""}约 ${a.mins} 分钟<span class="art-edition">成书：2026 年 9 月 · 产品操作以当前版本为准</span>`;

    const body = $("#artBody");
    body.innerHTML = '<p class="load-state" role="status">正在打开这一篇…</p>'; window.scrollTo(0, 0);
    try {
      const html = await loadArticle(a.id);
      if (version !== routeVersion) return;
      body.innerHTML = html;
    } catch {
      if (version !== routeVersion) return;
      body.innerHTML = '<p class="load-state">这一篇暂时没有加载成功，请检查网络后重试。</p><button class="retry-btn" id="articleRetry">重新加载</button>';
      $("#articleRetry").onclick = () => showArticle(a, sec); return;
    }
    addCopyButtons(body);
    body.querySelectorAll("table").forEach(table => { const wrap = document.createElement("div"); wrap.className = "table-scroll"; wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "表格，可左右滑动查看"); table.before(wrap); wrap.appendChild(table); });
    body.querySelectorAll("img[data-full]").forEach(img => { const button = document.createElement("button"); button.className = "shot-open"; button.setAttribute("aria-label", "放大查看截图"); img.before(button); button.appendChild(img); button.onclick = () => openImage(img); });

    // 本页目录
    const secs = [...body.querySelectorAll("h3")];
    const toc = $("#artToc");
    if (secs.length) {
      $("#mobileToc").hidden = false;
      $("#mobileTocLinks").innerHTML = secs.map(h => `<a href="#/p/${a.id}#${h.id}">${esc(h.textContent)}</a>`).join("");
      $("#mobileTocLinks").querySelectorAll("a").forEach((link, i) => { link.onclick = e => { e.preventDefault(); $("#mobileToc").open = false; secs[i].scrollIntoView({behavior:"smooth"}); history.replaceState(null,"",`#/p/${a.id}#${secs[i].id}`); }; });
      toc.innerHTML = `<div class="toc-tt">本页</div>` +
        secs.map((h) => `<a href="#/p/${a.id}#${h.id}" data-t="${h.id}">${esc(h.textContent)}</a>`).join("");
      toc.querySelectorAll("a").forEach((l) => (l.onclick = (e) => {
        e.preventDefault();
        document.getElementById(l.dataset.t)?.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null,"",`#/p/${a.id}#${l.dataset.t}`);
      }));
      if (spy) spy.disconnect();
      spy = new IntersectionObserver((es) => {
        es.forEach((e) => {
          if (e.isIntersecting)
            toc.querySelectorAll("a").forEach((l) => l.classList.toggle("on", l.dataset.t === e.target.id));
        });
      }, { rootMargin: "-20% 0px -70% 0px" });
      secs.forEach((h) => spy.observe(h));
    } else toc.innerHTML = "";

    // 上一节 / 下一节
    const prev = M.articles[a.n - 2], next = M.articles[a.n];
    $("#artNav").innerHTML =
      (next ? `<div class="next-label">下一节</div><a class="next-card" href="#/p/${next.id}">${esc(next.short)}</a>` : "") +
      `<div class="art-nav-links">
        ${prev ? `<a href="#/p/${prev.id}">上一节：${esc(prev.short)}</a>` : ""}
        <button id="navToc">目录</button>
        <button id="navShare">分享本篇</button>
      </div>`;
    $("#navToc").onclick = (e) => { e.stopPropagation(); goToc(); };
    $("#navShare").onclick = share;

    if (sec) setTimeout(() => document.getElementById(sec)?.scrollIntoView(), 60);
  }

  /* ---------------- 复制提示词 ---------------- */
  function addCopyButtons(root) {
    root.querySelectorAll(".saybox").forEach((box) => {
      const hd = box.querySelector(".say-hd"), pre = box.querySelector("pre");
      if (!hd || !pre || hd.querySelector(".copy-btn")) return;
      const b = document.createElement("button");
      b.className = "copy-btn"; b.textContent = "复制";
      b.onclick = () => {
        copyText(pre.innerText).then(ok => {
          if (!ok) { toast("请长按话术文字，选择复制"); return; }
          b.textContent = "已复制 ✓"; setTimeout(() => (b.textContent = "复制"), 1500);
        });
      };
      hd.appendChild(b);
    });
  }

  /* ---------------- 分享 / 回顶 ---------------- */
  async function copyText(text) {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
    const box = document.createElement("textarea"); box.value = text; box.style.cssText = "position:fixed;top:0;left:-9999px"; document.body.appendChild(box); box.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {} box.remove(); return ok;
  }
  async function share() {
    if (await copyText(location.href)) toast("本篇链接已复制，发给别人就能直接打开");
    else { window.prompt("请复制本篇链接，或使用微信右上角菜单分享", location.href); }
  }
  $("#fabShare").onclick = share;
  $("#fabTop").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  /* ---------------- 搜索 ---------------- */
  const mask = $("#searchMask"), input = $("#searchInput"), list = $("#searchList");
  let sel = 0, results = [];

  let modalFocus = null, lockedY = 0, locked = false;
  function lockScroll() {
    if (locked) return; locked = true; lockedY = window.scrollY; modalFocus = document.activeElement;
    document.body.style.position = "fixed"; document.body.style.top = `-${lockedY}px`; document.body.style.width = "100%";
  }
  function unlockScroll() {
    if (!locked) return; locked = false; document.body.style.position = ""; document.body.style.top = ""; document.body.style.width = "";
    window.scrollTo({top:lockedY,behavior:"instant"}); modalFocus?.focus({preventScroll:true});
  }
  async function ensureSearch() {
    if (searchData) return;
    if (!searchPromise) searchPromise = (async () => { searchData = embeddedJSON("search-json") || await getResource("data/search.json", true); })().finally(() => { searchPromise = null; });
    await searchPromise;
  }
  async function openSearch() {
    if (!M) return;
    closeContact(); closeImage(); lockScroll(); mask.hidden = false; input.value = ""; input.focus();
    results = []; list.innerHTML = '<p class="load-state">正在准备全文搜索…</p>'; $("#searchFoot").textContent = "";
    try { await ensureSearch(); if (!mask.hidden) doSearch(input.value.trim()); }
    catch { if (!mask.hidden) { list.innerHTML = '<p class="load-state">搜索暂时不可用，请检查网络。</p><button class="retry-btn" id="searchRetry">重试</button>'; $("#searchRetry").onclick = openSearch; } }
  }
  function closeSearch() { if (!mask.hidden) { mask.hidden = true; unlockScroll(); } }
  $("#searchClose").onclick = closeSearch;
  $("#searchBtn").onclick = openSearch;
  document.querySelectorAll('[data-act="search"]').forEach((b) => (b.onclick = openSearch));
  document.querySelectorAll('[data-act="toc"]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); goToc(); }));
  mask.onclick = (e) => { if (e.target === mask) closeSearch(); };

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") {
      closeImage();
      if (!mask.hidden) closeSearch();
      if (!contactMask.hidden) closeContact();
      if (!petPanel.hidden) closePet();
    }
  });

  /* ---------------- 联系我 ---------------- */
  const contactMask = $("#contactMask");
  function openContact() { closeSearch(); closeImage(); lockScroll(); contactMask.hidden = false; const img = contactMask.querySelector("img"); if (!img.getAttribute("src")) img.src = img.dataset.src; $("#contactClose").focus(); }
  function closeContact() { if (!contactMask.hidden) { contactMask.hidden = true; unlockScroll(); } }
  document.querySelectorAll('[data-act="contact"]').forEach((b) => (b.onclick = openContact));
  $("#contactClose").onclick = closeContact;
  contactMask.onclick = (e) => { if (e.target === contactMask) closeContact(); };
  input.addEventListener("input", () => doSearch(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); paint(); }
    if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === "Enter" && results[sel]) {
      location.hash = `#/p/${results[sel].id}`; closeSearch();
    }
  });

  function doSearch(q) {
    sel = 0;
    if (!M || !searchData) return;
    if (!q) { results = []; paint(); $("#searchFoot").textContent = `↑↓ 选择 · 回车打开 · 共 ${M.meta.total} 篇可检索`; list.innerHTML = ""; return; }
    const ql = q.toLowerCase();
    results = M.articles
      .map((a) => {
        const ti = a.title.toLowerCase().indexOf(ql);
        const text = searchData[a.id] || "";
        const bi = text.toLowerCase().indexOf(ql);
        if (ti < 0 && bi < 0) return null;
        let sn = "";
        if (bi >= 0) {
          const s = Math.max(0, bi - 30);
          sn = (s > 0 ? "…" : "") + text.slice(s, bi + q.length + 60) + "…";
        }
        return { id: a.id, title: a.short, group: a.groupName, sn, q, score: ti >= 0 ? 0 : 1 };
      })
      .filter(Boolean).sort((x, y) => x.score - y.score).slice(0, 12);
    paint();
    $("#searchFoot").textContent = `${results.length} 条结果`;
  }
  function paint() {
    list.innerHTML = results.length
      ? results.map((r, i) => `<a class="sr${i === sel ? " sel" : ""}" data-id="${r.id}">
          <div><span class="sr-tt">${hl(r.title, r.q)}</span><span class="sr-gp">${esc(r.group)}</span></div>
          ${r.sn ? `<div class="sr-sn">${hl(r.sn, r.q)}</div>` : ""}
        </a>`).join("")
      : (input.value.trim() ? `<div class="search-empty">没有找到「${esc(input.value.trim())}」相关的篇目</div>` : "");
    list.querySelectorAll(".sr").forEach((el) => (el.onclick = () => {
      location.hash = `#/p/${el.dataset.id}`; closeSearch();
    }));
  }
  const hl = (s, q) => esc(s).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`);

  const imageMask = $("#imageMask"), imageFull = $("#imageFull");
  let imageScale = 1;
  function openImage(img) {
    closeSearch(); closeContact(); lockScroll(); imageScale = 1; imageMask.hidden = false;
    imageFull.src = img.dataset.full; imageFull.alt = img.alt; imageFull.style.width = "100%";
    $("#imageStage").scrollTo(0,0); $("#imageClose").focus();
  }
  function closeImage() { if (!imageMask.hidden) { imageMask.hidden = true; imageFull.removeAttribute("src"); unlockScroll(); } }
  $("#imageClose").onclick = closeImage;
  $("#imagePlus").onclick = () => { imageScale = Math.min(4,imageScale + .5); imageFull.style.width = `${imageScale*100}%`; };
  $("#imageMinus").onclick = () => { imageScale = Math.max(1,imageScale - .5); imageFull.style.width = `${imageScale*100}%`; };
  imageFull.onerror = () => toast("截图暂时无法打开，请稍后重试");
  document.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const active = [mask,contactMask,imageMask].find(el => !el.hidden); if (!active) return;
    const nodes = [...active.querySelectorAll('button,input,a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
    if (!nodes.length) return;
    const first=nodes[0], last=nodes[nodes.length-1];
    if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
  });
  function boot() { load().catch(() => {
    $("#heroStats").innerHTML = '目录暂时没有加载成功。<button class="retry-btn" id="bootRetry">重新加载</button>';
    $("#bootRetry").onclick = boot;
  }); }
  boot();
})();
