/* ==========================================
   英文單字（梯次一：瀏覽、排序、搜尋、收藏、不熟）
   使用方式：
   1. 把 vocab.json 放到 GitHub 專案根目錄（與 index.html 同層）
   2. 在 index.html 的 tools.js 之後加上：<script src="vocab.js"></script>
   ========================================== */

/*PURE-START*/
const VOCAB_STAR_KEY = "vocab_star";
const VOCAB_HARD_KEY = "vocab_hard";

// 排序：by = "alpha" 字母 ｜ "level" 等級；dir = "asc" 正序 ｜ "desc" 倒序
function sortVocab(list, by, dir) {
  const arr = list.slice().sort((a, b) => {
    const ea = a.en.toLowerCase(), eb = b.en.toLowerCase();
    if (by === "level") return (a.level - b.level) || (ea < eb ? -1 : ea > eb ? 1 : 0);
    return ea < eb ? -1 : ea > eb ? 1 : 0;
  });
  return dir === "desc" ? arr.reverse() : arr;
}

// 篩選：mode = "all" ｜ "star" 收藏 ｜ "hard" 不熟；query 搜尋英文或中文
function filterVocab(list, mode, stars, hards, query) {
  const q = (query || "").trim().toLowerCase();
  const sSet = new Set(stars), hSet = new Set(hards);
  return list.filter(w => {
    if (mode === "star" && !sSet.has(w.id)) return false;
    if (mode === "hard" && !hSet.has(w.id)) return false;
    if (q && !(w.en.toLowerCase().includes(q) || w.zh.includes(q))) return false;
    return true;
  });
}
/*PURE-END*/

// ---------- 狀態與資料 ----------
let VOCAB = null;                  // 單字全部資料（第一次進入單字頁才載入）
let vocabLoading = null;
const vocabUI = { by: "alpha", dir: "asc", mode: "all", query: "" };
const vocabRead = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
const vocabWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const vEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function loadVocab() {
  if (VOCAB) return Promise.resolve(VOCAB);
  if (!vocabLoading) vocabLoading = fetch("./vocab.json").then(r => { if (!r.ok) throw new Error("找不到 vocab.json"); return r.json(); })
    .then(d => { VOCAB = d; return d; })
    .catch(e => { vocabLoading = null; throw e; });
  return vocabLoading;
}

// ---------- 導覽 ----------
function setVocabNav(on) {
  const el = document.getElementById("navVocab");
  if (el) el.classList.toggle("active", on);
  ["navHome", "navSettings", "navSync", "nav_answers", "nav_mock", "nav_stats"].forEach(x => {
    const e = document.getElementById(x); if (e) e.classList.remove("active");
  });
}
async function openVocab() {
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  window.__syncActive = false;
  window.__extraPage = null;
  window.__vocabActive = true;
  cur = "english";
  currentPage = "vocab";
  document.getElementById("subjectNav").style.display = "none";
  setVocabNav(true);
  history.replaceState(null, "", "#vocab");
  removeVocabTabs();
  A.innerHTML = `<div class="card"><p class="meta"><span>載入單字中…</span></p></div>`;
  try {
    await loadVocab();
    if (window.__vocabActive) renderVocab();
  } catch (e) {
    A.innerHTML = `<div class="card"><h2>📚 英文單字</h2><p>無法載入單字資料：${vEsc(e.message)}</p><p class="meta"><span>請確認 vocab.json 已上傳到專案根目錄。</span></p></div>`;
  }
}
function closeVocabFlag() { window.__vocabActive = false; setVocabNav(false); removeVocabTabs(); }

// 底部橢圓：直接掛在 body 下，固定於視窗底部（不放在卡片裡，避免卡片的毛玻璃效果影響定位）
function vocabTabsEl() {
  let el = document.getElementById("vocabTabs");
  if (!el) { el = document.createElement("div"); el.id = "vocabTabs"; el.className = "v-tabs"; document.body.appendChild(el); }
  return el;
}
function removeVocabTabs() { const el = document.getElementById("vocabTabs"); if (el) el.remove(); }

// ---------- 單字頁 ----------
// 排序圖示：A~Z（字母）或 Level（等級），箭頭向上為正序、向下為倒序；字母倒序為 Z~A
function vocabSortIcon() {
  const alpha = vocabUI.by === "alpha", desc = vocabUI.dir === "desc";
  const label = alpha ? (desc ? "Z~A" : "A~Z") : "Level";
  const fs = alpha ? 11 : 9;
  return `<svg viewBox="0 0 56 44" width="46" height="36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="30" y2="6"/><line x1="4" y1="14" x2="26" y2="14"/><line x1="12" y1="22" x2="24" y2="22"/>
    <text x="3" y="40" stroke="none" fill="currentColor" font-size="${fs}" font-family="inherit">${label}</text>
    <g transform="${desc ? "translate(0,44) scale(1,-1)" : ""}"><line x1="44" y1="6" x2="44" y2="40"/><polyline points="38,12 44,6 50,12"/></g>
  </svg>`;
}
function renderVocab() {
  const stars = vocabRead(VOCAB_STAR_KEY), hards = vocabRead(VOCAB_HARD_KEY);
  const starSet = new Set(stars), hardSet = new Set(hards);
  const list = sortVocab(filterVocab(VOCAB, vocabUI.mode, stars, hards, vocabUI.query), vocabUI.by, vocabUI.dir);
  const rows = list.map(w => `
    <div class="v-row">
      <div class="v-main">
        <div class="v-en"><span class="v-hard-mark">${hardSet.has(w.id) ? "❗" : ""}</span>${vEsc(w.en)} <span class="v-pos">${vEsc(w.pos)}</span></div>
        <div class="v-zh">${vEsc(w.zh)}</div>
      </div>
      <div class="v-level">L${w.level}</div>
      <button class="v-btn ${starSet.has(w.id) ? "on" : ""}" title="加入收藏" onclick="VocabUI.star(${w.id})">⭐</button>
      <button class="v-btn ${hardSet.has(w.id) ? "on-hard" : ""}" title="標註為不熟" onclick="VocabUI.hard(${w.id})">❗</button>
    </div>`).join("");
  const more = "";
  const sortIcon = vocabSortIcon();
  const tab = (k, label, n) => `<button class="v-tab ${vocabUI.mode === k ? "on" : ""}" onclick="VocabUI.mode('${k}')">${label}<span class="v-n">${n}</span></button>`;
  vocabTabsEl().innerHTML = `${tab("all", "全部", VOCAB.length)}${tab("star", "收藏", stars.length)}${tab("hard", "不熟", hards.length)}`;

  A.innerHTML = `
    <div class="card v-page">
      <div class="v-top">
        <div class="v-pill">
          <button class="v-seg ${vocabUI.by === "alpha" ? "on" : ""}" onclick="VocabUI.by('alpha')">字母</button>
          <button class="v-seg ${vocabUI.by === "level" ? "on" : ""}" onclick="VocabUI.by('level')">等級</button>
        </div>
        <button class="v-sort" title="切換正序／倒序" onclick="VocabUI.dir()">${sortIcon}</button>
        <button class="v-search" title="搜尋單字" onclick="VocabUI.search()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </button>
      </div>
      ${vocabUI.query ? `<div class="v-chip">搜尋：${vEsc(vocabUI.query)} <button onclick="VocabUI.clearQuery()">✕</button></div>` : ""}
      <div class="v-legend"><span>⭐ 加入收藏</span><span>❗ 標註為不熟</span></div>
      <div class="v-list">${rows || `<p class="meta"><span>沒有符合條件的單字。</span></p>`}</div>
      ${more}
      <button class="go" style="margin-top:12px" onclick="VocabUI.back()">← 返回英文刷題</button>
    </div>`;
  window.scrollTo(0, 0);
  bindShrink();
}

// 底部橢圓：滑動時縮小，停止後恢復
let shrinkTimer = null;
function bindShrink() {
  if (window.__vocabShrinkBound) return;
  window.__vocabShrinkBound = true;
  window.addEventListener("scroll", () => {
    if (!window.__vocabActive) return;
    const el = document.getElementById("vocabTabs"); if (!el) return;
    el.classList.add("shrink");
    clearTimeout(shrinkTimer);
    shrinkTimer = setTimeout(() => el.classList.remove("shrink"), 180);
  }, { passive: true });
}

// ---------- 彈窗 ----------
function vModal(id) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement("div");
    m.id = id; m.className = "modal-overlay"; m.style.zIndex = "1400";
    m.onclick = e => { if (e.target === m) m.classList.remove("active"); };
    document.body.appendChild(m);
  }
  return m;
}
function openVocabPrompt() {
  const m = vModal("vocabPrompt");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(360px,90vw);text-align:center">
    <h3 style="justify-content:center">進入英文單字？</h3>
    <p style="text-align:left;line-height:1.7">也可以從側邊欄的「單字」進入。</p>
    <div class="modal-actions" style="margin-top:8px">
      <button class="go" onclick="document.getElementById('vocabPrompt').classList.remove('active');VocabUI.open()">進入</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabPrompt').classList.remove('active')">取消</button>
    </div></div>`;
  m.classList.add("active");
}
function openSearch() {
  const m = vModal("vocabSearch");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(420px,92vw)">
    <h3>搜尋單字</h3>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" id="vSearchInput" placeholder="輸入英文或中文" value="${vEsc(vocabUI.query)}" style="flex:1;margin:0"
        onkeypress="if(event.key==='Enter')VocabUI.doSearch()">
      <button onclick="VocabUI.doSearch()" style="margin:0;background:var(--ac);color:#fff;border:none;flex-shrink:0">搜尋</button>
    </div>
    <div class="modal-actions"><button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('vocabSearch').classList.remove('active')">關閉</button></div>
  </div>`;
  m.classList.add("active");
  setTimeout(() => { const i = document.getElementById("vSearchInput"); if (i) i.focus(); }, 100);
}

// ---------- 介面操作 ----------
const VocabUI = {
  open() { openVocab(); },
  prompt() { openVocabPrompt(); },
  back() { closeVocabFlag(); cur = "english"; go("english"); },
  by(k) { vocabUI.by = k; renderVocab(); },
  dir() { vocabUI.dir = vocabUI.dir === "asc" ? "desc" : "asc"; renderVocab(); },
  mode(k) { vocabUI.mode = k; renderVocab(); },
  search() { openSearch(); },
  doSearch() {
    const v = (document.getElementById("vSearchInput").value || "").trim();
    vocabUI.query = v;
    document.getElementById("vocabSearch").classList.remove("active");
    renderVocab();
  },
  clearQuery() { vocabUI.query = ""; renderVocab(); },
  star(id) {
    const a = vocabRead(VOCAB_STAR_KEY), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    vocabWrite(VOCAB_STAR_KEY, a); renderVocab();
  },
  hard(id) {
    const a = vocabRead(VOCAB_HARD_KEY), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    vocabWrite(VOCAB_HARD_KEY, a); renderVocab();
  }
};
window.VocabUI = VocabUI;

// ---------- 樣式 ----------
const vocabCss = document.createElement("style");
vocabCss.textContent = `
  .v-top{display:flex;gap:10px;align-items:center;margin-bottom:12px}
  .v-pill{display:flex;flex:1;align-items:center;border:1px solid var(--bd);border-radius:999px;background:var(--card);overflow:hidden;padding:3px}
  .v-seg{flex:1;padding:8px 10px;border:none;border-radius:999px;background:transparent;box-shadow:none;margin:0;font-size:.9rem;color:var(--text-color)}
  .v-seg.on{background:#3b82f6;color:#fff}
  .v-dir{flex:1.6;font-weight:bold}
  .v-search{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;margin:0;flex-shrink:0}
  .v-search svg{width:20px;height:20px}
  .v-chip{display:inline-flex;gap:6px;align-items:center;padding:4px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--bd);font-size:.85rem;margin-bottom:8px}
  .v-chip button{padding:0 4px;border:none;background:transparent;box-shadow:none;margin:0}
  .v-legend{display:flex;justify-content:flex-end;gap:12px;font-size:.8rem;opacity:.7;margin-bottom:8px}
  .v-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px dashed var(--bd)}
  .v-main{flex:1;min-width:0}
  .v-en{font-weight:bold;font-size:1.05rem}
  .v-pos{font-weight:normal;font-size:.8rem;opacity:.6;margin-left:4px}
  .v-zh{font-size:.9rem;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .v-hard-mark{margin-right:4px}
  .v-level{font-size:.75rem;opacity:.6;min-width:26px;text-align:center}
  .v-btn{width:38px;height:38px;border-radius:50%;padding:0;margin:0;box-shadow:none;font-size:1rem;opacity:.35;flex-shrink:0}
  .v-btn.on{opacity:1;background:color-mix(in srgb,#facc15 30%,var(--card))}
  .v-btn.on-hard{opacity:1;background:color-mix(in srgb,var(--no) 25%,var(--card))}
  .v-tabs{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);transform-origin:center bottom;z-index:50;display:flex;justify-content:center;gap:6px;padding:6px;width:max-content;max-width:calc(100% - 24px);border-radius:999px;border:1px solid var(--bd);background:var(--card);box-shadow:var(--shadow);transition:transform .25s ease,opacity .25s ease}
  .v-tabs.shrink{transform:translateX(-50%) scale(.82);opacity:.9}
  /* 底部橢圓跟著風格：柔光玻璃 / 液態玻璃 */
  html[data-style="glass"] .v-tabs,
  html[data-style="liquid"] .v-tabs {
    background: rgba(255,255,255,.4) !important;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255,255,255,.6) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.6) !important;
  }
  html[data-theme="dark"][data-style="glass"] .v-tabs,
  html[data-theme="dark"][data-style="liquid"] .v-tabs {
    background: rgba(31,41,55,.4) !important;
    border: 1px solid rgba(255,255,255,.15) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.14) !important;
  }
  html[data-style="liquid"][data-liquid="on"] .v-tabs {
    backdrop-filter: url(#liquid-glass) blur(10px) saturate(180%);
    -webkit-backdrop-filter: url(#liquid-glass) blur(10px) saturate(180%);
  }
  .v-page{padding-bottom:110px}
  .v-row{content-visibility:auto;contain-intrinsic-size:auto 64px}
  .v-sort{width:56px;height:48px;border-radius:12px;padding:0;margin:0;box-shadow:none;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .v-sort svg{width:46px;height:36px}
  .v-tab{padding:8px 16px;border-radius:999px;border:none;background:transparent;box-shadow:none;margin:0;font-size:.95rem}
  .v-tab.on{background:#3b82f6;color:#fff}
  .v-n{margin-left:6px;font-size:.75rem;opacity:.75}
  .v-entry .go{margin-top:12px}
`;
document.head.appendChild(vocabCss);

// ---------- 英文刷題首頁：入口卡片 ----------
function addVocabEntry() {
  if (cur !== "english" || window.__vocabActive) return;
  const first = document.querySelector("#app .card");
  if (!first || document.querySelector(".v-entry")) return;
  first.insertAdjacentHTML("afterend", `
    <div class="card v-entry">
      <div class="header-row"><h2>📚 英文單字</h2></div>
      <p class="meta"><span>學測 6012 個單字｜依字母或等級瀏覽｜收藏與不熟標記</span></p>
      <button class="go" onclick="VocabUI.prompt()">進入</button>
    </div>`);
}

// ---------- 側邊欄「單字」 ----------
const _vStatsNav = document.getElementById("nav_stats") || document.getElementById("navSettings");
const navVocab = document.createElement("div");
navVocab.className = "sidebar-item";
navVocab.id = "navVocab";
navVocab.textContent = "📚 單字";
navVocab.onclick = () => switchPage("vocab");
_vStatsNav.insertAdjacentElement("afterend", navVocab);

// ---------- 包住既有函式 ----------
const _vSwitchPage = switchPage;
switchPage = function (p) {
  if (p === "vocab") { openVocab(); return; }
  closeVocabFlag();
  return _vSwitchPage(p);
};
const _vGo = go;
go = function (k, f) { closeVocabFlag(); return _vGo(k, f); };
const _vHome = home;
home = function () {
  if (window.__vocabActive) { renderVocab(); return; }
  _vHome();
  addVocabEntry();
};

// 網址是 #vocab 時直接開啟（等主程式初始化完成）
function ensureVocabShown() {
  if (location.hash !== "#vocab") return;
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  openVocab();
}
setTimeout(ensureVocabShown, 0);
setTimeout(ensureVocabShown, 300);
window.addEventListener("load", ensureVocabShown);
