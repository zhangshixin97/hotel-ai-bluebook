/* 订单来了蓝皮书 · 站点逻辑：路由 / 大目录 / 小蓝面板 / 搜索 / 进度记忆 */
(function () {
  const $ = (s) => document.querySelector(s);
  const coverView = $("#coverView"), articleView = $("#articleView"),
        tocView = $("#tocView"), tocViewBody = $("#tocViewBody"),
        topbar = $("#topbar"), fab = $("#fab");
  let M = null;            // manifest
  const cache = {};        // article fragments
  const pendingArticles = {};
  let routeVersion = 0;
  let searchText = null, searchLoading = null, searchVersion = 0;
  let spy = null;

  function readLast() {
    try { return JSON.parse(localStorage.getItem("hb-last") || "null"); }
    catch (_) { return null; }
  }
  function saveLast(id) {
    try { localStorage.setItem("hb-last", JSON.stringify({ id })); } catch (_) {}
  }
  async function fetchResource(url, kind) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response[kind]();
    } finally { clearTimeout(timer); }
  }

  const PICKS = ["04", "10", "12", "17"];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- 数据 ---------------- */
  function embeddedJSON(id) {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  }
  async function load() {
    const status = $("#siteStatus");
    status.hidden = false;
    status.innerHTML = '<span role="status">正在加载目录…</span>';
    try {
      M = embeddedJSON("manifest-json") || await fetchResource("data/manifest-lite.json", "json");
      renderCover();
      buildTocView();
      buildPet();
      status.hidden = true;
      route();
    } catch (_) {
      status.innerHTML = '<span role="alert">目录暂时没加载成功，请检查网络后重试。</span><button id="retrySite">重新加载</button>';
      $("#retrySite").onclick = load;
    }
  }
  async function loadArticle(id) {
    if (cache[id]) return cache[id];
    if (!pendingArticles[id]) {
      pendingArticles[id] = (async () => {
        const emb = embeddedJSON("articles-json");
        const content = emb ? (emb[id] || "") : await fetchResource(`articles/${id}.html`, "text");
        if (!content.trim()) throw new Error("Empty article");
        cache[id] = content;
        return content;
      })().finally(() => { delete pendingArticles[id]; });
    }
    return pendingArticles[id];
  }

  const byId = (id) => M.articles.find((a) => a.id === id);
  const pieceNo = (a) => `第 ${a.n} / ${M.meta.total} 篇`;

  /* ---------------- 封面 ---------------- */
  function renderCover() {
    const m = M.meta;
    $("#tocCount").textContent = m.total;
    $("#heroStats").textContent =
      `${m.total} 篇 · 约 ${(m.chars / 10000).toFixed(1)} 万字 · ${m.shots} 张真机截图 · 64 条官方指令`;

    const titles = M.articles.map((a) => a.short);
    $("#marqueeTrack").innerHTML = [...titles, ...titles].map((t) => `<span>${esc(t)}</span>`).join("");

    $("#pickGrid").innerHTML = PICKS.map((id, i) => {
      const a = byId(id); if (!a) return "";
      return `<div class="pick-card" data-id="${a.id}">
        <span class="pick-tag">${esc(a.groupName)}</span>
        <span class="pick-no">${String(i + 1).padStart(2, "0")}</span>
        <h3 class="pick-title">${esc(a.short)}</h3>
        <p class="pick-ex">${esc(a.excerpt)}…</p>
        <span class="pick-meta">约 ${a.mins} 分钟 · 可照做</span>
        <button class="pick-go">→</button>
      </div>`;
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
      return `<div class="file-card" data-g="${k}">
        <span class="file-no">FILE / ${String(i + 1).padStart(2, "0")}</span>
        <h3 class="file-name">${esc(g.name)}</h3>
        <p class="file-desc">${descs[k]}</p>
        <span class="file-count"><b>${g.count}</b> 篇 <span>→</span></span>
      </div>`;
    }).join("");
    $("#fileGrid").innerHTML = files;
    document.querySelectorAll(".file-card").forEach((c) =>
      (c.onclick = (e) => { e.stopPropagation(); location.hash = `#/toc/${c.dataset.g}`; }));

    const last = readLast();
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
    const last = readLast();
    $("#petPanelFt").innerHTML =
      (last && byId(last.id) ? `<a class="ppf-cont" href="#/p/${last.id}">↪ 继续读《${esc(byId(last.id).short)}》</a>` : "") +
      `<button id="ppfSearch">搜索</button><button id="ppfContact">联系我</button><a href="#/">封面</a>`;
    $("#ppfSearch").onclick = () => { closePet(); openSearch(); };
    $("#ppfContact").onclick = () => { closePet(); openContact(); };
  }
  function openPet() {
    petPanel.hidden = false; petBubble.hidden = true; petOpened = true;
    fab.hidden = true;
  }
  function closePet() { petPanel.hidden = true; fab.hidden = articleView.hidden; }
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
    const version = ++routeVersion;
    const h = location.hash;
    const m = h.match(/^#\/p\/([\w-]+)(?:#([\w-]+))?$/);
    if (m && byId(m[1])) showArticle(byId(m[1]), m[2], version);
    else if (h.startsWith("#/toc")) showToc(h.split("/")[2]);
    else showCover();
  }
  window.addEventListener("hashchange", route);

  function showToc(group) {
    coverView.hidden = true; articleView.hidden = true; tocView.hidden = false;
    topbar.hidden = false; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "全书目录 · 订单来了蓝皮书";
    closePet();
    window.scrollTo(0, 0);
    if (group) document.getElementById(`group-${group}`)?.scrollIntoView();
  }

  function showCover() {
    coverView.hidden = false; articleView.hidden = true; tocView.hidden = true;
    topbar.hidden = true; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "订单来了酒店民宿 AI 实操入门蓝皮书";
    closePet();
    const last = readLast();
    if (last && byId(last.id)) {
      $("#continueTitle").textContent = byId(last.id).short;
      $("#continueLink").href = `#/p/${last.id}`;
      $("#continueLink").hidden = false;
    }
    window.scrollTo(0, 0);
  }

  async function showArticle(a, sec, version) {
    coverView.hidden = true; articleView.hidden = false; tocView.hidden = true;
    topbar.hidden = false; fab.hidden = false;
    readProgress.hidden = false; readProgress.style.width = "0";
    closePet();
    document.title = `${a.short} · 订单来了蓝皮书`;
    markActive(a.id);

    $("#crumb").innerHTML = `<a href="#/">封面</a>　/　${esc(a.groupName)}｜${esc(a.groupSub)}`;
    $("#artTitle").textContent = a.title;
    $("#artMeta").innerHTML =
      (a.tag ? `<span class="art-tag">${esc(a.tag)}</span><br>` : "") +
      `${pieceNo(a)}　·　${a.shots ? a.shots + " 张真机图　·　" : ""}约 ${a.mins} 分钟`;

    const body = $("#artBody");
    if (spy) { spy.disconnect(); spy = null; }
    $("#artToc").innerHTML = "";
    $("#mobileToc").hidden = true;
    $("#mobileToc").open = false;
    $("#artNav").innerHTML = "";
    body.setAttribute("aria-busy", "true");
    body.innerHTML = '<div class="load-state" role="status">正在加载正文…</div>';
    window.scrollTo(0, 0);
    let content;
    try { content = await loadArticle(a.id); }
    catch (_) {
      if (version !== routeVersion) return;
      body.setAttribute("aria-busy", "false");
      body.innerHTML = '<div class="load-state" role="alert"><p>正文暂时没加载成功，请检查网络后重试。</p><button id="retryArticle">重新加载</button><a href="#/toc">返回目录</a></div>';
      $("#retryArticle").onclick = route;
      return;
    }
    if (version !== routeVersion) return;
    body.innerHTML = content;
    body.setAttribute("aria-busy", "false");
    saveLast(a.id);
    addCopyButtons(body);
    enhanceArticle(body);

    // 本页目录
    const secs = [...body.querySelectorAll("h3")];
    const toc = $("#artToc");
    $("#mobileToc").hidden = !secs.length;
    $("#mobileTocBody").innerHTML = secs.map((h) =>
      `<a href="#/p/${a.id}#${h.id}">${esc(h.textContent)}</a>`).join("");
    if (secs.length) {
      toc.innerHTML = `<div class="toc-tt">本页</div>` +
        secs.map((h) => `<a href="#/p/${a.id}#${h.id}" data-t="${h.id}">${esc(h.textContent)}</a>`).join("");
      toc.querySelectorAll("a").forEach((l) => (l.onclick = (e) => {
        e.preventDefault();
        location.hash = l.getAttribute("href");
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

    window.scrollTo(0, 0);
    if (sec) document.getElementById(sec)?.scrollIntoView();
    onScrollProgress();
  }

  /* ---------------- 手机表格 / 截图放大 ---------------- */
  const imageDialog = $("#imageDialog"), viewerImage = $("#viewerImage");
  function enhanceArticle(root) {
    root.querySelectorAll("table").forEach((table) => {
      const region = document.createElement("div");
      const wide = (table.querySelector("tr")?.children.length || 0) >= 3;
      region.className = wide ? "table-scroll is-wide" : "table-scroll";
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", wide ? "数据表格，可左右滑动查看" : "数据表格");
      table.before(region); region.appendChild(table);
    });
    root.querySelectorAll(".shot-fig img").forEach((img) => {
      const link = document.createElement("a");
      link.className = "shot-open";
      link.href = img.dataset.fullSrc || img.src;
      const caption = img.closest("figure")?.querySelector("figcaption")?.textContent.trim();
      img.alt = caption || img.alt;
      link.setAttribute("aria-label", `放大截图：${caption || img.alt}`);
      img.before(link); link.appendChild(img);
      const hint = document.createElement("span");
      hint.className = "shot-hint"; hint.textContent = "点击放大查看";
      link.appendChild(hint);
      link.onclick = (e) => {
        if (!imageDialog.showModal) return;
        e.preventDefault();
        viewerImage.src = link.href; viewerImage.alt = img.alt;
        viewerImage.classList.remove("zoomed");
        $("#imageZoom").textContent = "放大细节";
        $("#imageZoom").setAttribute("aria-pressed", "false");
        imageDialog.showModal(); document.body.classList.add("image-open");
      };
      img.addEventListener("error", () => { hint.textContent = "图片暂未加载，点击重试或查看大图"; });
      img.addEventListener("load", onScrollProgress, { once: true });
    });
  }
  $("#imageClose").onclick = () => imageDialog.close();
  imageDialog.addEventListener("close", () => {
    document.body.classList.remove("image-open");
    viewerImage.removeAttribute("src");
  });
  imageDialog.onclick = (e) => { if (e.target === imageDialog) imageDialog.close(); };
  $("#imageZoom").onclick = () => {
    const zoomed = viewerImage.classList.toggle("zoomed");
    $("#imageZoom").textContent = zoomed ? "适合屏幕" : "放大细节";
    $("#imageZoom").setAttribute("aria-pressed", String(zoomed));
  };
  $("#viewerImage").onerror = () => toast("大图暂未加载，请关闭后重试");
  $(".skip-link").onclick = (e) => {
    e.preventDefault();
    const target = articleView.hidden ? (tocView.hidden ? coverView : tocView) : $("#main");
    target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView();
  };

  /* ---------------- 复制提示词 ---------------- */
  function addCopyButtons(root) {
    root.querySelectorAll(".saybox").forEach((box) => {
      const hd = box.querySelector(".say-hd"), pre = box.querySelector("pre");
      if (!hd || !pre || hd.querySelector(".copy-btn")) return;
      const b = document.createElement("button");
      b.className = "copy-btn"; b.textContent = "复制";
      b.onclick = async () => {
        if (await copyText(pre.innerText)) {
          b.textContent = "已复制 ✓"; setTimeout(() => (b.textContent = "复制"), 1500);
        }
      };
      hd.appendChild(b);
    });
  }

  /* ---------------- 分享 / 回顶 ---------------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const field = document.createElement("textarea");
      field.value = text; field.className = "copy-fallback";
      document.body.appendChild(field); field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (_) {}
      field.remove();
      if (!copied) toast("复制未成功，请长按文字或复制浏览器地址");
      return copied;
    }
  }
  async function share() {
    if (await copyText(location.href)) toast("本篇链接已复制，发给别人就能直接打开");
  }
  $("#fabShare").onclick = share;
  $("#mobileShare").onclick = share;
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

  async function loadSearchText() {
    if (searchText) return;
    if (!searchLoading) searchLoading = (async () => {
      const embedded = embeddedJSON("manifest-json");
      searchText = embedded?.articles?.every((a) => typeof a.text === "string")
        ? Object.fromEntries(embedded.articles.map((a) => [a.id, a.text]))
        : await fetchResource("data/search-index.json", "json");
    })().finally(() => { searchLoading = null; });
    await searchLoading;
  }
  async function openSearch() {
    if (!M) { toast("目录正在加载，请稍后再试"); return; }
    const version = ++searchVersion;
    mask.hidden = false; input.value = ""; results = []; sel = 0;
    list.innerHTML = '<div class="search-empty" role="status">正在准备全文搜索…</div>';
    input.focus();
    try {
      await loadSearchText();
      if (version === searchVersion && !mask.hidden) doSearch(input.value.trim());
    } catch (_) {
      if (version !== searchVersion || mask.hidden) return;
      list.innerHTML = '<div class="search-empty" role="alert">搜索暂时不可用，请检查网络后重试。<button id="retrySearch">重试</button></div>';
      $("#retrySearch").onclick = openSearch;
    }
  }
  function closeSearch() { mask.hidden = true; ++searchVersion; }
  $("#searchBtn").onclick = openSearch;
  $("#searchClose").onclick = closeSearch;
  document.querySelectorAll('[data-act="search"]').forEach((b) => (b.onclick = openSearch));
  document.querySelectorAll('[data-act="toc"]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); goToc(); }));
  mask.onclick = (e) => { if (e.target === mask) closeSearch(); };

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") {
      if (!mask.hidden) closeSearch();
      if (!contactMask.hidden) closeContact();
      if (!petPanel.hidden) closePet();
    }
  });

  /* ---------------- 联系我 ---------------- */
  const contactMask = $("#contactMask");
  function openContact() { contactMask.hidden = false; }
  function closeContact() { contactMask.hidden = true; }
  document.querySelectorAll('[data-act="contact"]').forEach((b) => (b.onclick = openContact));
  $("#contactClose").onclick = closeContact;
  $("#copyWechat").onclick = async () => {
    if (await copyText("zhang916148898")) toast("微信号已复制");
  };
  contactMask.onclick = (e) => { if (e.target === contactMask) closeContact(); };
  input.addEventListener("input", () => { if (searchText) doSearch(input.value.trim()); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); paint(); }
    if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === "Enter" && results[sel]) {
      location.hash = `#/p/${results[sel].id}`; closeSearch();
    }
  });

  function doSearch(q) {
    sel = 0;
    if (!q) { results = []; paint(); $("#searchFoot").textContent = `↑↓ 选择 · 回车打开 · 共 ${M.meta.total} 篇可检索`; list.innerHTML = ""; return; }
    const ql = q.toLowerCase();
    results = M.articles
      .map((a) => {
        const ti = a.title.toLowerCase().indexOf(ql);
        const text = searchText[a.id] || "";
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

  load();
})();
