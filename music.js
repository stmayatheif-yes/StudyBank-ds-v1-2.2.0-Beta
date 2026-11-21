/* ==========================================
   底部音樂播放器（本地音源 / YouTube / 播放清單）
   使用方式：把本檔放在 GitHub 專案根目錄，並在 index.html 的 </body> 前加上：
   <script src="music.js"></script>
   本地音樂：把 mp3 放進 music/ 資料夾，然後在下面的 LOCAL_TRACKS 加一行。
   播放清單存在 localStorage 的 music_playlists，已加入 sync.js 的雲端同步。
   ========================================== */
(function () {
  "use strict";

  // ===== ① 本地音樂清單（自己編輯）=====
  // 範例：{ id: "focus1", title: "專注鋼琴", artist: "自己", src: "music/focus1.mp3", cover: "music/focus1.jpg" }
  // id 不可重複；artist、cover 可省略
  const LOCAL_TRACKS = [
  ];

  const PL_KEY = "music_playlists", PREF_KEY = "music_prefs";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const fmt = s => { s = Math.max(0, s | 0); return (s / 60 | 0) + ":" + String(s % 60).padStart(2, "0"); };

  // ===== 資料 =====
  const store = load(PL_KEY, {});
  if (!Array.isArray(store.lists)) store.lists = [];
  if (!store.lists.some(l => l.id === "liked")) store.lists.unshift({ id: "liked", name: "已按讚的歌曲", items: [] });
  if (!Array.isArray(store.yt)) store.yt = [];
  const prefs = Object.assign({ src: "local" }, load(PREF_KEY, {}));
  const persist = () => save(PL_KEY, store);

  const localLib = () => LOCAL_TRACKS.map(t => ({ key: "l:" + t.id, src: "local", url: t.src, title: t.title, artist: t.artist || "", cover: t.cover || "" }));
  const lib = s => s === "yt" ? store.yt.slice() : localLib();
  const snap = t => ({ key: t.key, src: t.src, url: t.url, vid: t.vid, title: t.title, artist: t.artist, cover: t.cover });
  const libLabel = s => s === "yt" ? "YouTube" : "本地音源";

  // ===== 播放狀態 =====
  let queue = lib(prefs.src), idx = 0, cur = queue[0] || null, qLabel = libLabel(prefs.src);
  let playing = false, loadedKey = null, shuffle = false, repeat = false, drag = false;
  const audio = new Audio(); audio.preload = "none";

  // ===== 圖示 =====
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    prev: '<path d="M6 6h2v12H6zM20 6v12L9.5 12z"/>', next: '<path d="M16 6h2v12h-2zM4 6v12l10.5-6z"/>',
    up: `<path ${S} stroke-width="2.5" d="M6 15l6-6 6 6"/>`, down: `<path ${S} stroke-width="2.5" d="M6 9l6 6 6-6"/>`,
    plus: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 8v8M8 12h8"/>`,
    chk: '<circle cx="12" cy="12" r="10" style="fill:var(--ac)"/><path fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M7.5 12.5l3 3 6-6.5"/>',
    shuf: `<path ${S} d="M16 4h4v4M4 20L20 4M20 16v4h-4M4 4l5 5M15 15l5 5"/>`,
    rep: `<path ${S} d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>`,
    list: `<path ${S} d="M4 6h16M4 12h16M4 18h10"/>`, x: `<path ${S} d="M6 6l12 12M18 6L6 18"/>`
  };
  const ic = (n, s) => `<svg viewBox="0 0 24 24" width="${s || 24}" height="${s || 24}" fill="currentColor">${ICON[n]}</svg>`;

  // ===== 樣式 =====
  const css = `
^{--mp-r:14px}
^button{font:inherit;color:inherit;background:none;border:0;border-radius:0;padding:0;margin:0;box-shadow:none;cursor:pointer;transition:none;-webkit-tap-highlight-color:transparent;line-height:1.3}
^button:hover:not(:disabled),^button:active:not(:disabled){transform:none;border-color:transparent}
^#mpBar{position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(640px,calc(100% - 16px));z-index:900;background:var(--card);border:1px solid var(--bd);border-radius:var(--mp-r);box-shadow:var(--shadow);overflow:hidden;cursor:pointer;color:var(--text-color)}
^.mp-row{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 10px}
^.mp-cv{width:44px;height:44px;border-radius:8px;background:var(--ac) center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;flex:none}
^.mp-meta{flex:1;min-width:0}
^.mp-t,^.mp-s{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
^.mp-t{font-weight:700}^.mp-s{font-size:.8rem;opacity:.65}
^.mp-ib{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex:none}
^.mp-prog{height:3px;background:var(--bd)}^.mp-prog i{display:block;height:100%;width:0;background:var(--ac)}
^#mpFull{position:fixed;inset:0;z-index:1100;display:flex;justify-content:center;padding:calc(12px + env(safe-area-inset-top,0px)) 20px calc(20px + env(safe-area-inset-bottom,0px));box-sizing:border-box;background:linear-gradient(var(--bg-angle),var(--bg-color-1),var(--bg-color-2));overflow-y:auto;transform:translateY(100%);visibility:hidden;transition:transform .3s,visibility .3s;color:var(--text-color)}
^#mpFull.open{transform:none;visibility:visible}
^.mp-col{width:min(420px,100%);display:flex;flex-direction:column;gap:14px;margin:auto 0}
^.mp-top{display:flex;align-items:center;justify-content:space-between;text-align:center}
^.mp-top b{font-size:.95rem}^.mp-top small{display:block;opacity:.65;font-size:.78rem}
^.mp-seg{display:flex;background:var(--card);border:1px solid var(--bd);border-radius:999px;padding:3px}
^.mp-seg button{flex:1;text-align:center;padding:8px;border-radius:999px;font-size:.95rem}
^.mp-seg button.on{background:var(--ac);color:#fff}
^.mp-art{width:min(100%,44vh);aspect-ratio:1;margin:0 auto;border-radius:14px;font-size:64px;box-shadow:var(--shadow)}
^.mp-plbtn{display:flex;align-items:center;gap:8px;align-self:flex-start;padding:8px 14px;border:1px solid var(--bd)!important;border-radius:8px;background:var(--card)!important;font-size:.9rem}
^.mp-info{display:flex;align-items:center;gap:12px}
^.mp-info>div{flex:1;min-width:0}
^.mp-info .mp-t{font-size:1.35rem}^.mp-info .mp-s{font-size:1rem}
^input[type=range]{width:100%;margin:0;padding:0;border:0;background:transparent;box-shadow:none;height:24px;accent-color:var(--ac);cursor:pointer}
^.mp-time{display:flex;justify-content:space-between;font-size:.8rem;opacity:.65;margin-top:-6px}
^.mp-ctrl{display:flex;align-items:center;justify-content:space-between}
^.mp-ctrl .mp-ib{width:48px;height:48px}
^.mp-ctrl .big{width:68px;height:68px;background:var(--text-color);color:var(--bg-color-1)}
^.mp-ctrl .on{color:var(--ac)}
^.mp-wrap{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.5);opacity:0;visibility:hidden;transition:.2s;display:flex;align-items:flex-end;justify-content:center;color:var(--text-color)}
^.mp-wrap.open{opacity:1;visibility:visible}
^.mp-sheet{width:min(640px,100%);height:min(78vh,640px);background:var(--card);border:1px solid var(--bd);border-radius:18px 18px 0 0;display:flex;flex-direction:column;transform:translateY(30px);transition:.2s;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
^.mp-wrap.open .mp-sheet{transform:none}
^.mp-sh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
^.mp-sh-head button{color:var(--ac);padding:6px 4px}
^.mp-tabs{display:flex;gap:8px;margin-bottom:8px}
^.mp-tabs button{padding:6px 14px;border-radius:999px;border:1px solid var(--bd)!important;font-size:.9rem}
^.mp-tabs button.on{background:var(--ac);color:#fff;border-color:var(--ac)!important}
^#mpShBody{overflow-y:auto;flex:1}
^.mp-li{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid var(--bd);cursor:pointer}
^.mp-li .mp-meta{display:block}^.mp-li i{display:flex;font-style:normal;opacity:.85}
^.mp-li.now .mp-t{color:var(--ac)}
^.mp-hint{opacity:.65;font-size:.9rem;line-height:1.7;margin:10px 0}
^.mp-new{display:flex;gap:8px;margin:6px 0 10px}
^.mp-new input{flex:1;margin:0;min-width:0}
^.mp-btn{background:var(--ac)!important;color:#fff!important;padding:8px 14px!important;border-radius:8px!important;white-space:nowrap}
^#mpYTwrap{position:fixed;left:-400px;bottom:0;width:200px;height:200px;pointer-events:none}
^#mpToast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:1300;background:rgba(0,0,0,.8);color:#fff;padding:8px 16px;border-radius:999px;font-size:.9rem;opacity:0;pointer-events:none;transition:opacity .2s;max-width:90%;text-align:center}
^#mpToast.show{opacity:1}
html[data-style="glass"] #mpRoot #mpBar,html[data-style="glass"] #mpRoot .mp-sheet{background:color-mix(in srgb,var(--card) 55%,transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%)}
main{padding-bottom:100px!important}`.replace(/\^/g, "#mpRoot ").replace(/#mpRoot #(mp\w+)/g, "#$1");
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  // ===== DOM =====
  const root = document.createElement("div"); root.id = "mpRoot";
  root.innerHTML = `
<div id="mpBar"><div class="mp-row">
  <div class="mp-cv" id="bCv"></div>
  <div class="mp-meta"><div class="mp-t" id="bT"></div><div class="mp-s" id="bS"></div></div>
  <button class="mp-ib" id="bPlay" aria-label="播放／暫停"></button>
  <button class="mp-ib" id="bUp" aria-label="展開播放器">${ic("up")}</button>
</div><div class="mp-prog"><i id="bProg"></i></div></div>

<div id="mpFull"><div class="mp-col">
  <div class="mp-top"><button class="mp-ib" id="fDown" aria-label="收合">${ic("down")}</button>
    <div><small>播放自</small><b id="fQ"></b></div><span style="width:40px"></span></div>
  <div class="mp-seg"><button data-s="local">本地音源</button><button data-s="yt">YouTube</button></div>
  <div class="mp-cv mp-art" id="fCv"></div>
  <button class="mp-plbtn" id="fList">${ic("list", 18)}<span>查看／建立播放清單</span></button>
  <div class="mp-info"><div><div class="mp-t" id="fT"></div><div class="mp-s" id="fS"></div></div>
    <button class="mp-ib" id="fAdd" aria-label="加入播放清單">${ic("plus", 32)}</button></div>
  <div><input type="range" id="fSeek" min="0" max="1000" value="0"><div class="mp-time"><span id="fCur">0:00</span><span id="fDur">0:00</span></div></div>
  <div class="mp-ctrl">
    <button class="mp-ib" id="fShuf" aria-label="隨機">${ic("shuf")}</button>
    <button class="mp-ib" id="fPrev" aria-label="上一首">${ic("prev", 32)}</button>
    <button class="mp-ib big" id="fPlay" aria-label="播放／暫停"></button>
    <button class="mp-ib" id="fNext" aria-label="下一首">${ic("next", 32)}</button>
    <button class="mp-ib" id="fRep" aria-label="單曲循環">${ic("rep")}</button>
  </div>
</div></div>

<div class="mp-wrap" id="mpWrap"><div class="mp-sheet">
  <div class="mp-sh-head"><button id="shClose">關閉</button><b id="shTitle"></b><button id="shNew">新增清單</button></div>
  <div class="mp-tabs" id="shTabs"><button data-t="add">加入這首</button><button data-t="lists">我的清單</button><button data-t="yt">YouTube 連結</button></div>
  <div id="mpShBody"></div>
</div></div>
<div id="mpYTwrap"><div id="mpYTbox"></div></div>
<div id="mpToast"></div>`;
  document.body.appendChild(root);
  const $$ = s => $(s, root);

  let toastTimer;
  function toast(m) { const t = $$("#mpToast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400); }
  function cover(el, url, empty) { el.style.backgroundImage = url ? `url("${url}")` : ""; el.textContent = url ? "" : "♪"; }

  // ===== YouTube =====
  let ytp = null, ytReady = false, ytLoading = false, pendingVid = null, errN = 0;
  function needYT() {
    if (ytLoading) return; ytLoading = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      ytp = new YT.Player("mpYTbox", {
        width: 200, height: 200, playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
        events: {
          onReady: () => { ytReady = true; if (pendingVid) { ytp.loadVideoById(pendingVid); pendingVid = null; } },
          onStateChange: e => {
            if (!cur || cur.src !== "yt") return;
            if (e.data === 1) { playing = true; errN = 0; fixYTInfo(); ui(); }
            else if (e.data === 2) { playing = false; ui(); }
            else if (e.data === 0) next(true);
          },
          onError: () => { toast("這支 YouTube 影片無法嵌入播放，已跳過"); playing = false; ui(); if (++errN < queue.length) setTimeout(() => next(), 800); }
        }
      });
    };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  }
  function fixYTInfo() {   // 抓不到標題時，播放後用播放器資訊補上
    try {
      const d = ytp.getVideoData();
      if (d && d.title && cur.title.indexOf("YouTube ") === 0) {
        cur.title = d.title; cur.artist = d.author || cur.artist;
        [store.yt].concat(store.lists.map(l => l.items)).forEach(a => a.forEach(x => { if (x.key === cur.key) { x.title = cur.title; x.artist = cur.artist; } }));
        persist();
      }
    } catch (e) {}
  }
  const ytId = s => { s = String(s || "").trim(); const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/); return m ? m[1] : null; };

  // ===== 播放引擎 =====
  function stopAll() { audio.pause(); if (ytReady) try { ytp.pauseVideo(); } catch (e) {} }
  function playIdx(i) {
    if (!queue.length) return;
    idx = (i + queue.length) % queue.length; cur = queue[idx];
    stopAll(); loadedKey = cur.key; playing = true;
    if (cur.src === "yt") { needYT(); if (ytReady) ytp.loadVideoById(cur.vid); else pendingVid = cur.vid; }
    else { audio.src = cur.url; audio.play().catch(() => { playing = false; ui(); toast("無法播放這個音檔，請確認檔案路徑"); }); }
    ui();
  }
  function toggle() {
    if (!cur) { toast(prefs.src === "yt" ? "先到「YouTube 連結」貼上網址吧" : "還沒有本地音樂，可先改用 YouTube"); return; }
    if (loadedKey !== cur.key) { playIdx(idx); return; }
    if (cur.src === "yt") { if (ytReady) (playing ? ytp.pauseVideo() : ytp.playVideo()); }
    else (audio.paused ? audio.play().catch(() => {}) : audio.pause());
  }
  function next(auto) {
    if (!queue.length) return;
    if (auto && repeat) return playIdx(idx);
    if (shuffle && queue.length > 1) { let j; do { j = Math.random() * queue.length | 0; } while (j === idx); return playIdx(j); }
    playIdx(idx + 1);
  }
  const pos = () => {
    if (!cur) return [0, 0];
    if (cur.src === "yt") { try { return [ytp.getCurrentTime() || 0, ytp.getDuration() || 0]; } catch (e) { return [0, 0]; } }
    return [audio.currentTime || 0, isFinite(audio.duration) ? audio.duration : 0];
  };
  function seekTo(t) { if (!cur || loadedKey !== cur.key) return; if (cur.src === "yt") { try { ytp.seekTo(t, true); } catch (e) {} } else audio.currentTime = t; }
  function prev() { if (pos()[0] > 3) seekTo(0); else playIdx(idx - 1); }
  function setSource(s) {
    if (prefs.src === s && qLabel === libLabel(s)) return;
    prefs.src = s; save(PREF_KEY, prefs); stopAll(); playing = false; loadedKey = null;
    queue = lib(s); idx = 0; cur = queue[0] || null; qLabel = libLabel(s); ui();
  }
  function playList(items, i, label) { queue = items.map(x => Object.assign({}, x)); qLabel = label; playIdx(i || 0); }

  audio.addEventListener("play", () => { if (cur && cur.src === "local") { playing = true; ui(); } });
  audio.addEventListener("pause", () => { if (cur && cur.src === "local") { playing = false; ui(); } });
  audio.addEventListener("ended", () => { if (cur && cur.src === "local") next(true); });
  audio.addEventListener("error", () => { if (cur && cur.src === "local" && audio.src) { playing = false; ui(); toast("找不到音檔：" + cur.url); } });

  // ===== 畫面更新 =====
  function ui() {
    const t = cur ? cur.title : (prefs.src === "yt" ? "尚未加入 YouTube 歌曲" : "尚未加入本地音樂");
    const a = cur ? (cur.artist || (cur.src === "yt" ? "YouTube" : "")) : "點 ∧ 展開，加入音樂";
    const pi = ic(playing ? "pause" : "play", 26);
    $$("#bT").textContent = $$("#fT").textContent = t; $$("#bS").textContent = $$("#fS").textContent = a;
    cover($$("#bCv"), cur && cur.cover); cover($$("#fCv"), cur && cur.cover);
    $$("#bPlay").innerHTML = $$("#fPlay").innerHTML = pi;
    $$("#fQ").textContent = qLabel;
    const act = cur ? cur.src : prefs.src;
    root.querySelectorAll(".mp-seg button").forEach(b => b.classList.toggle("on", b.dataset.s === act));
    $$("#fShuf").classList.toggle("on", shuffle); $$("#fRep").classList.toggle("on", repeat);
    if ("mediaSession" in navigator && cur) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist || "", artwork: cur.cover ? [{ src: new URL(cur.cover, location.href).href }] : [] }); } catch (e) {}
    }
    if ($$("#mpWrap").classList.contains("open")) renderSheet();
  }
  setInterval(() => {
    if (drag) return;
    const p = pos(), r = p[1] ? p[0] / p[1] : 0;
    $$("#bProg").style.width = r * 100 + "%"; $$("#fSeek").value = r * 1000;
    $$("#fCur").textContent = fmt(p[0]); $$("#fDur").textContent = fmt(p[1]);
  }, 500);

  // ===== 主要按鈕 =====
  const openFull = o => { $$("#mpFull").classList.toggle("open", o); document.body.style.overflow = o ? "hidden" : ""; };
  $$("#mpBar").onclick = e => { if (!e.target.closest("button") || e.target.closest("#bUp")) openFull(true); };
  $$("#bPlay").onclick = toggle; $$("#fPlay").onclick = toggle;
  $$("#fDown").onclick = () => openFull(false);
  $$("#fNext").onclick = () => next(); $$("#fPrev").onclick = prev;
  $$("#fShuf").onclick = () => { shuffle = !shuffle; ui(); };
  $$("#fRep").onclick = () => { repeat = !repeat; ui(); };
  root.querySelectorAll(".mp-seg button").forEach(b => b.onclick = () => setSource(b.dataset.s));
  const sk = $$("#fSeek");
  sk.addEventListener("input", () => { drag = true; $$("#fCur").textContent = fmt(sk.value / 1000 * pos()[1]); });
  sk.addEventListener("change", () => { seekTo(sk.value / 1000 * pos()[1]); drag = false; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if ($$("#mpWrap").classList.contains("open")) openSheet(false); else openFull(false); } });
  if ("mediaSession" in navigator) { try {
    navigator.mediaSession.setActionHandler("play", toggle); navigator.mediaSession.setActionHandler("pause", toggle);
    navigator.mediaSession.setActionHandler("nexttrack", () => next()); navigator.mediaSession.setActionHandler("previoustrack", prev);
  } catch (e) {} }

  // ===== 播放清單面板 =====
  const view = { tab: "add", open: null, creating: false };
  function openSheet(o, tab) {
    if (tab) { view.tab = tab; view.open = null; }
    view.creating = false; $$("#mpWrap").classList.toggle("open", o); if (o) renderSheet();
  }
  $$("#fList").onclick = () => openSheet(true, "lists");
  $$("#fAdd").onclick = () => openSheet(true, "add");
  $$("#shClose").onclick = () => openSheet(false);
  $$("#mpWrap").onclick = e => { if (e.target.id === "mpWrap") openSheet(false); };
  $$("#shNew").onclick = () => { view.creating = true; renderSheet(); const i = $$("#mpNewName"); if (i) i.focus(); };
  $$("#shTabs").onclick = e => { const b = e.target.closest("button"); if (b) { view.tab = b.dataset.t; view.open = null; view.creating = false; renderSheet(); } };

  const row = (t, extra, attrs) => `<div class="mp-li${cur && cur.key === t.key ? " now" : ""}" ${attrs}>
    <div class="mp-cv" style="${t.cover ? `background-image:url('${esc(t.cover)}')` : ""}">${t.cover ? "" : "♪"}</div>
    <div class="mp-meta"><div class="mp-t">${esc(t.title)}</div><div class="mp-s">${esc(t.artist || (t.src === "yt" ? "YouTube" : ""))}</div></div>${extra}</div>`;

  function renderSheet() {
    const tabs = { add: "儲存到", lists: "我的清單", yt: "YouTube 連結" };
    const openList = view.open && store.lists.find(l => l.id === view.open);
    $$("#shTitle").textContent = openList ? openList.name : tabs[view.tab];
    root.querySelectorAll("#shTabs button").forEach(b => b.classList.toggle("on", b.dataset.t === view.tab));
    let h = "";
    if (view.creating) h += `<div class="mp-new"><input id="mpNewName" placeholder="清單名稱" maxlength="30"><button class="mp-btn" data-a="newok">建立</button></div>`;
    if (view.tab === "add") {
      if (!cur) h += `<p class="mp-hint">目前沒有選擇歌曲。先播放一首，再來加入清單。</p>`;
      else h += `<p class="mp-hint">${esc(cur.title)}</p>` + store.lists.map(l => {
        const on = l.items.some(x => x.key === cur.key);
        return `<div class="mp-li" data-a="tog" data-id="${l.id}"><div class="mp-meta"><div class="mp-t">${esc(l.name)}</div><div class="mp-s">${l.items.length} 首</div></div><i>${ic(on ? "chk" : "plus", 28)}</i></div>`;
      }).join("");
    } else if (view.tab === "lists") {
      if (openList) {
        h += `<div style="display:flex;justify-content:space-between;margin:4px 0 6px"><button data-a="back" style="color:var(--ac)">‹ 返回</button><button class="mp-btn" data-a="playall" data-id="${openList.id}">播放全部</button></div>`;
        h += openList.items.length ? openList.items.map((t, i) => row(t, `<i data-a="rm" data-id="${openList.id}" data-i="${i}">${ic("x", 20)}</i>`, `data-a="playin" data-id="${openList.id}" data-i="${i}"`)).join("") : `<p class="mp-hint">這個清單還沒有歌曲。</p>`;
      } else h += store.lists.map(l => `<div class="mp-li" data-a="open" data-id="${l.id}"><div class="mp-meta"><div class="mp-t">${esc(l.name)}</div><div class="mp-s">${l.items.length} 首</div></div>${l.id === "liked" ? "" : `<i data-a="dellist" data-id="${l.id}">${ic("x", 20)}</i>`}</div>`).join("");
    } else {
      h += `<div class="mp-new"><input id="mpYtUrl" placeholder="貼上 YouTube 影片連結" inputmode="url"><button class="mp-btn" data-a="ytadd">新增</button></div>`;
      h += store.yt.length ? store.yt.map((t, i) => row(t, `<i data-a="ytrm" data-i="${i}">${ic("x", 20)}</i>`, `data-a="ytplay" data-i="${i}"`)).join("") : `<p class="mp-hint">支援一般影片連結與 youtu.be 短網址（單支影片，不含整份播放清單）。部分影片作者不允許嵌入播放。</p>`;
    }
    const scroll = $$("#mpShBody").scrollTop; $$("#mpShBody").innerHTML = h; $$("#mpShBody").scrollTop = scroll;
  }

  async function addYT() {
    const inp = $$("#mpYtUrl"), id = ytId(inp.value);
    if (!id) return toast("看不懂這個連結，請貼完整的 YouTube 影片網址");
    if (store.yt.some(t => t.vid === id)) return toast("這支影片已經在清單裡了");
    const t = { key: "y:" + id, src: "yt", vid: id, title: "YouTube " + id, artist: "", cover: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" };
    try {
      const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
      if (r.ok) { const d = await r.json(); t.title = d.title || t.title; t.artist = d.author_name || ""; }
    } catch (e) {}
    store.yt.push(t); persist();
    if (qLabel === libLabel("yt")) { queue = lib("yt"); if (!cur) { idx = 0; cur = queue[0]; } }
    toast("已新增"); ui(); renderSheet();
  }

  $$("#mpShBody").onclick = e => {
    const el = e.target.closest("[data-a]"); if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, i = +el.dataset.i;
    const list = store.lists.find(l => l.id === id);
    if (a === "tog" && cur && list) {
      const k = list.items.findIndex(x => x.key === cur.key);
      if (k >= 0) list.items.splice(k, 1); else list.items.push(snap(cur));
      persist(); renderSheet();
    } else if (a === "newok") {
      const n = $$("#mpNewName").value.trim(); if (!n) return toast("請輸入清單名稱");
      const l = { id: "l" + Date.now().toString(36), name: n, items: [] };
      if (view.tab === "add" && cur) l.items.push(snap(cur));
      store.lists.push(l); persist(); view.creating = false; renderSheet();
    } else if (a === "open") { view.open = id; renderSheet(); }
    else if (a === "back") { view.open = null; renderSheet(); }
    else if (a === "dellist") { if (confirm("確定要刪除這個播放清單嗎？")) { store.lists = store.lists.filter(l => l.id !== id); persist(); renderSheet(); } }
    else if (a === "rm" && list) { list.items.splice(i, 1); persist(); renderSheet(); }
    else if (a === "playall" && list) { if (list.items.length) { playList(list.items, 0, list.name); openSheet(false); } else toast("清單是空的"); }
    else if (a === "playin" && list) { playList(list.items, i, list.name); openSheet(false); }
    else if (a === "ytadd") addYT();
    else if (a === "ytrm") { store.yt.splice(i, 1); persist(); if (qLabel === libLabel("yt")) { queue = lib("yt"); if (cur && !queue.some(x => x.key === cur.key)) { stopAll(); playing = false; loadedKey = null; idx = 0; cur = queue[0] || null; } else if (cur) idx = queue.findIndex(x => x.key === cur.key); } ui(); renderSheet(); }
    else if (a === "ytplay") { prefs.src = "yt"; save(PREF_KEY, prefs); playList(store.yt, i, libLabel("yt")); openSheet(false); }
  };
  $$("#mpShBody").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (e.target.id === "mpYtUrl") addYT(); else if (e.target.id === "mpNewName") $$("#mpShBody").querySelector('[data-a="newok"]').click();
  });

  ui();
})();
