/* 订单来了蓝皮书 · 站点逻辑：路由 / 大目录 / 小蓝面板 / 搜索 / 进度记忆 */
(function () {
  const $ = (s) => document.querySelector(s);
  const coverView = $("#coverView"), articleView = $("#articleView"),
        tocView = $("#tocView"), tocViewBody = $("#tocViewBody"),
        topbar = $("#topbar"), fab = $("#fab");
  let M = null;            // manifest
  const cache = {};        // article fragments
  let spy = null;

  const PICKS = ["04", "10", "12", "17"];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------------- 数据 ---------------- */
  function embeddedJSON(id) {
    const el = document.getElementById(id);
    return el ? JSON.parse(el.textContent) : null;
  }
  async function load() {
    M = embeddedJSON("manifest-json") || await (await fetch("data/manifest.json")).json();
    renderCover();
    buildTocView();
    buildPet();
    route();
  }
  async function loadArticle(id) {
    if (cache[id]) return cache[id];
    const emb = embeddedJSON("articles-json");
    cache[id] = emb ? (emb[id] || "") : await (await fetch(`articles/${id}.html`)).text();
    return cache[id];
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
      (c.onclick = (e) => { e.stopPropagation(); openPet(); }));

    const last = JSON.parse(localStorage.getItem("hb-last") || "null");
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
      <section class="tocv-group">
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
    const last = JSON.parse(localStorage.getItem("hb-last") || "null");
    $("#petPanelFt").innerHTML =
      (last && byId(last.id) ? `<a class="ppf-cont" href="#/p/${last.id}">↪ 继续读《${esc(byId(last.id).short)}》</a>` : "") +
      `<button id="ppfSearch">搜索</button><button id="ppfContact">联系我</button><a href="#/">封面</a>`;
    $("#ppfSearch").onclick = () => { closePet(); openSearch(); };
    $("#ppfContact").onclick = () => { closePet(); openContact(); };
  }
  function openPet() {
    petPanel.hidden = false; petBubble.hidden = true; petOpened = true;
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
    const h = location.hash;
    const m = h.match(/^#\/p\/([\w-]+)/);
    if (m && byId(m[1])) showArticle(byId(m[1]), h.split("#s")[1]);
    else if (h.startsWith("#/toc")) showToc();
    else showCover();
  }
  window.addEventListener("hashchange", route);

  function showToc() {
    coverView.hidden = true; articleView.hidden = true; tocView.hidden = false;
    topbar.hidden = false; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "全书目录 · 订单来了蓝皮书";
    closePet();
    window.scrollTo(0, 0);
  }

  function showCover() {
    coverView.hidden = false; articleView.hidden = true; tocView.hidden = true;
    topbar.hidden = true; fab.hidden = true;
    readProgress.hidden = true;
    document.title = "订单来了酒店民宿 AI 实操入门蓝皮书";
    closePet();
    const last = JSON.parse(localStorage.getItem("hb-last") || "null");
    if (last && byId(last.id)) {
      $("#continueTitle").textContent = byId(last.id).short;
      $("#continueLink").href = `#/p/${last.id}`;
      $("#continueLink").hidden = false;
    }
    window.scrollTo(0, 0);
  }

  async function showArticle(a, sec) {
    coverView.hidden = true; articleView.hidden = false; tocView.hidden = true;
    topbar.hidden = false; fab.hidden = false;
    readProgress.hidden = false; readProgress.style.width = "0";
    closePet();
    document.title = `${a.short} · 订单来了蓝皮书`;
    markActive(a.id);
    localStorage.setItem("hb-last", JSON.stringify({ id: a.id }));

    $("#crumb").innerHTML = `<a href="#/">封面</a>　/　${esc(a.groupName)}｜${esc(a.groupSub)}`;
    $("#artTitle").textContent = a.title;
    $("#artMeta").innerHTML =
      (a.tag ? `<span class="art-tag">${esc(a.tag)}</span><br>` : "") +
      `${pieceNo(a)}　·　${a.shots ? a.shots + " 张真机图　·　" : ""}约 ${a.mins} 分钟`;

    const body = $("#artBody");
    body.innerHTML = await loadArticle(a.id);
    addCopyButtons(body);

    // 本页目录
    const secs = [...body.querySelectorAll("h3")];
    const toc = $("#artToc");
    if (secs.length) {
      toc.innerHTML = `<div class="toc-tt">本页</div>` +
        secs.map((h) => `<a href="#/p/${a.id}#${h.id}" data-t="${h.id}">${esc(h.textContent)}</a>`).join("");
      toc.querySelectorAll("a").forEach((l) => (l.onclick = (e) => {
        e.preventDefault();
        document.getElementById(l.dataset.t)?.scrollIntoView({ behavior: "smooth" });
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
        navigator.clipboard.writeText(pre.innerText).then(() => {
          b.textContent = "已复制 ✓"; setTimeout(() => (b.textContent = "复制"), 1500);
        });
      };
      hd.appendChild(b);
    });
  }

  /* ---------------- 分享 / 回顶 ---------------- */
  function share() {
    navigator.clipboard.writeText(location.href).then(() => toast("本篇链接已复制，发给别人就能直接打开"));
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

  function openSearch() { mask.hidden = false; input.value = ""; doSearch(""); input.focus(); }
  function closeSearch() { mask.hidden = true; }
  $("#searchBtn").onclick = openSearch;
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
    if (!q) { results = []; paint(); $("#searchFoot").textContent = `↑↓ 选择 · 回车打开 · 共 ${M.meta.total} 篇可检索`; list.innerHTML = ""; return; }
    const ql = q.toLowerCase();
    results = M.articles
      .map((a) => {
        const ti = a.title.toLowerCase().indexOf(ql);
        const bi = a.text.toLowerCase().indexOf(ql);
        if (ti < 0 && bi < 0) return null;
        let sn = "";
        if (bi >= 0) {
          const s = Math.max(0, bi - 30);
          sn = (s > 0 ? "…" : "") + a.text.slice(s, bi + q.length + 60) + "…";
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
