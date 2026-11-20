/* ==========================================
   第一階段工具：答案表、模擬測驗、學習統計
   使用方式：放在 GitHub 專案根目錄，並在 index.html 的 </body> 前、
   sync.js 之前加上：<script src="tools.js"></script>
   ========================================== */

/*PURE-START*/
const TOOL_STATS_KEY = "tools_attempts";
const TOOL_EXAM_KEY = "tools_exam";
const TOOL_MAX_ATTEMPTS = 2000;
const TOOL_TESTS_KEY = "tools_tests";
const TOOL_MAX_TESTS = 200;

// 同題組的題目要一起出：回傳 { 題號範圍: [a,b] }，找不到回傳 null
function groupRangeOf(all, q) {
  const n = parseInt(q.n, 10);
  for (const x of all) {
    if (x.y !== q.y) continue;
    const m = x.q.match(/【(\d+)~(\d+)題為題組題】/);
    if (m && n >= +m[1] && n <= +m[2]) return [+m[1], +m[2]];
  }
  return null;
}

// 把題目切成「單位」：單題一個，題組整組一個（只含池內題目）
function buildUnits(all, pool) {
  const inPool = new Set(pool.map(q => q.id));
  const seen = new Set();
  const units = [];
  pool.forEach(q => {
    if (seen.has(q.id)) return;
    const r = groupRangeOf(all, q);
    if (r) {
      const members = all.filter(x => x.y === q.y && +x.n >= r[0] && +x.n <= r[1] && inPool.has(x.id))
                         .sort((a, b) => +a.n - +b.n);
      members.forEach(x => seen.add(x.id));
      units.push(members);
    } else {
      seen.add(q.id);
      units.push([q]);
    }
  });
  return units;
}

// 抽題：與隨機刷題相同規則（單題能放就放，題組放不下先跳過，不足才整組補入）
function pickUnitsN(units, N, rnd) {
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = shuffle(units);
  const chosen = [], deferred = [];
  let count = 0;
  for (const u of order) {
    if (count >= N) break;
    if (count + u.length <= N) { chosen.push(u); count += u.length; }
    else deferred.push(u);
  }
  for (const u of deferred) {
    if (count >= N) break;
    chosen.push(u); count += u.length;
  }
  return shuffle(chosen).flat();
}

// 判分（第一階段：多選只有完全答對才算對）
function gradeChoice(q, picks) {
  if (!picks || !picks.length) return "skip";
  const p = [...picks].sort().join("");
  return p === q.a ? "correct" : "wrong";
}

// 統計：依模式過濾後計算
function summarize(attempts, mode) {
  const list = attempts.filter(a => mode === "all" || (a.mode || "practice") === mode);
  const total = list.length;
  const correct = list.filter(a => a.ok).length;
  const byYear = {};
  list.forEach(a => {
    const y = String(a.id || "").split("-")[0] || "?";
    byYear[y] = byYear[y] || { t: 0, c: 0 };
    byYear[y].t++; if (a.ok) byYear[y].c++;
  });
  const wrongCount = {};
  list.forEach(a => { if (!a.ok && a.id) wrongCount[a.id] = (wrongCount[a.id] || 0) + 1; });
  return { total, correct, byYear, wrongCount };
}
/*PURE-END*/

// ---------- 讀寫 ----------
const TOOL_PAGES = { answers: "答案表", mock: "模擬測驗", stats: "學習統計" };
const toolRead = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const toolWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// 舊資料基準點：第一次載入新版時，把當時卡片上的數字存起來，之後的練習不影響它
function ensureBaseline() {
  if (localStorage.getItem("tools_baseline")) return;
  const s = toolRead("qb_study", { w: {}, c: 0, t: 0 });
  toolWrite("tools_baseline", { t: s.t || 0, c: s.c || 0, w: Object.keys(s.w || {}) });
}
// 清掉早期版本留下的無效紀錄（沒有題號的）
function purgeInvalid() {
  const arr = toolRead(TOOL_STATS_KEY, []);
  const clean = arr.filter(a => a && typeof a.id === "string" && /^\d{3}-\d+$/.test(a.id));
  if (clean.length !== arr.length) toolWrite(TOOL_STATS_KEY, clean);
}
ensureBaseline();
purgeInvalid();
const fmtDay = ts => { const d = new Date(ts); return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0"); };
let _qSrc = null, _qCache = [];
const qidOf = q => q.id || (q.y + "-" + q.n);
// 題目 id 統一為「年-題號」，並快取（主程式載入的題庫沒有 id 欄位）
const chineseQ = () => {
  const src = (typeof DATA !== "undefined" && DATA.chinese) ? DATA.chinese : [];
  if (src !== _qSrc) { _qSrc = src; _qCache = src.map(q => q.id ? q : Object.assign({}, q, { id: qidOf(q) })); }
  return _qCache;
};
const toolYears = () => [...new Set(chineseQ().map(q => q.y))].sort((a, b) => a - b);

function addAttempt(id, ok, mode) {
  if (!localStorage.getItem("tools_first_ts")) toolWrite("tools_first_ts", Date.now());
  const arr = toolRead(TOOL_STATS_KEY, []);
  arr.push({ id, ok, mode, ts: Date.now() });
  toolWrite(TOOL_STATS_KEY, arr.slice(-TOOL_MAX_ATTEMPTS));
}

// 模擬測驗與練習共用的錯題本（qb_study）
function bumpStudy(id, ok) {
  const s = toolRead("qb_study", { w: {}, c: 0, t: 0 });
  s.t = (s.t || 0) + 1;
  if (ok) { s.c = (s.c || 0) + 1; delete s.w[id]; } else { s.w[id] = 1; }
  toolWrite("qb_study", s);
}

// ---------- 導覽 ----------
function setToolNav(name) {
  ["navHome", "navSettings", "navSync"].forEach(x => { const el = document.getElementById(x); if (el) el.classList.remove("active"); });
  Object.keys(TOOL_PAGES).forEach(k => { const el = document.getElementById("nav_" + k); if (el) el.classList.toggle("active", k === name); });
}
async function openTool(name) {
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  window.__syncActive = false;
  window.__extraPage = name;
  currentPage = "tool";
  document.getElementById("subjectNav").style.display = "none";
  setToolNav(name);
  history.replaceState(null, "", "#tool-" + name);
  document.getElementById("app").innerHTML = `<div class="card"><p class="meta"><span>載入中…</span></p></div>`;
  if (typeof loadSubject === "function" && !LOADED.chinese) await loadSubject("chinese");
  if (window.__extraPage === name) renderTool(name);
}
function renderTool(name) {
  if (name === "answers") return renderAnswers();
  if (name === "mock") return renderMockEntry();
  if (name === "stats") return renderStats();
}

// ---------- 答案表 ----------
let answerYear = "all";
function renderAnswers() {
  const years = toolYears();
  const data = chineseQ().filter(q => answerYear === "all" || String(q.y) === String(answerYear))
                         .sort((a, b) => (a.y - b.y) || (+a.n - +b.n));
  const btns = ["all", ...years].map(y => `<button class="go" style="width:auto;padding:6px 12px;margin:0 6px 8px 0;${String(answerYear) === String(y) ? "" : "background:var(--bd);color:var(--text-color);box-shadow:none"}" onclick="AnswerTable.year('${y}')">${y === "all" ? "全部" : y + " 年"}</button>`).join("");
  const cells = data.map(q => `<div style="display:flex;justify-content:space-between;padding:6px 10px;border:1px solid var(--bd);border-radius:8px"><span>${answerYear === "all" ? q.y + "‧" : ""}${q.n}</span><strong>${q.a}</strong></div>`).join("");
  document.getElementById("app").innerHTML = `
    <div class="card">
      <div class="header-row"><h2>📋 答案表</h2></div>
      <div>${btns}</div>
      <span class="helper-text">多選題以字母合併顯示，例如 CD。作答後的對錯請以刷題紀錄為準。</span>
      ${data.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:12px">${cells}</div>` : `<p class="meta"><span>目前沒有題目資料。</span></p>`}
    </div>`;
  window.scrollTo(0, 0);
}
const AnswerTable = { year(y) { answerYear = y; renderAnswers(); } };
window.AnswerTable = AnswerTable;

// ---------- 模擬測驗 ----------
let mockForm = { year: "all", count: 25, minutes: 45 };
let mockTimer = null;

function renderMockEntry() {
  const saved = toolRead(TOOL_EXAM_KEY, null);
  const years = toolYears();
  const resume = saved && !saved.done
    ? `<div class="card" style="margin-bottom:16px"><p style="margin:0 0 8px">有未完成的模擬測驗（${saved.ids.length} 題）。</p>
       <button class="go" onclick="MockExam.resume()">繼續作答</button>
       <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="MockExam.discard()">放棄並重新設定</button></div>` : "";
  const yearOpts = `<option value="all">全部年度（混合）</option>` + years.map(y => `<option value="${y}" ${String(mockForm.year) === String(y) ? "selected" : ""}>${y} 年</option>`).join("");
  document.getElementById("app").innerHTML = `
    ${resume}
    <div class="card">
      <div class="header-row"><h2>📝 模擬測驗</h2></div>
      <p style="margin:0 0 6px;font-weight:bold">範圍</p>
      <select id="mkYear" style="width:100%">${yearOpts}</select>
      <p style="margin:14px 0 6px;font-weight:bold">題數</p>
      <input type="number" id="mkCount" min="1" value="${mockForm.count}" style="width:100%">
      <p style="margin:14px 0 6px;font-weight:bold">時間（分鐘）</p>
      <input type="number" id="mkMin" min="1" value="${mockForm.minutes}" style="width:100%">
      <span class="helper-text">只抽選擇題（單選與多選），題組整組一起出。時間到自動交卷。</span>
      <p id="mkMsg" style="color:var(--no);min-height:1.2em;margin:8px 0 0;font-size:.9rem"></p>
      <button class="go" onclick="MockExam.start()">開始測驗</button>
    </div>`;
  window.scrollTo(0, 0);
}

function examPool() {
  const y = document.getElementById("mkYear").value;
  return chineseQ().filter(q => y === "all" || String(q.y) === String(y));
}

const MockExam = {
  start() {
    const pool = examPool();
    let N = parseInt(document.getElementById("mkCount").value, 10);
    let M = parseInt(document.getElementById("mkMin").value, 10);
    const msg = document.getElementById("mkMsg");
    if (!pool.length) { msg.textContent = "這個範圍沒有題目"; return; }
    if (!N || N < 1) { msg.textContent = "請輸入題數"; return; }
    if (!M || M < 1) { msg.textContent = "請輸入時間"; return; }
    if (N > pool.length) {               // 超過範圍：留在設定畫面，數字改成上限
      document.getElementById("mkCount").value = pool.length;
      msg.textContent = "超過範圍題數，已改為 " + pool.length + " 題";
      return;
    }
    mockForm = { year: document.getElementById("mkYear").value, count: N, minutes: M };
    const ids = pickUnitsN(buildUnits(chineseQ(), pool), N, Math.random).map(q => qidOf(q));
    const st = { ids, idx: 0, ans: {}, scope: document.getElementById("mkYear").value, startAt: Date.now(), endAt: Date.now() + M * 60000, done: false };
    toolWrite(TOOL_EXAM_KEY, st);
    this.run(st);
  },
  resume() { const st = toolRead(TOOL_EXAM_KEY, null); if (st && !st.done) this.run(st); },
  discard() { localStorage.removeItem(TOOL_EXAM_KEY); renderMockEntry(); },
  run(st) {
    clearInterval(mockTimer);
    mockTimer = setInterval(() => this.tick(), 1000);
    this.st = st;
    this.render();
    this.tick();
  },
  tick() {
    const st = this.st; if (!st || st.done) return;
    const left = Math.max(0, st.endAt - Date.now());
    const el = document.getElementById("mkTimer");
    if (el) el.textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor(left / 1000) % 60).padStart(2, "0");
    if (left <= 0) this.submit(true);
  },
  q() { return chineseQ().find(x => x.id === this.st.ids[this.st.idx]); },
  pick(letter) {
    const q = this.q(), st = this.st;
    if (q.a.length > 1) {
      const arr = st.ans[q.id] || [];
      st.ans[q.id] = arr.includes(letter) ? arr.filter(x => x !== letter) : [...arr, letter].sort();
    } else {
      st.ans[q.id] = [letter];
    }
    toolWrite(TOOL_EXAM_KEY, st);
    this.render();
  },
  go(i) { this.st.idx = Math.max(0, Math.min(this.st.ids.length - 1, i)); toolWrite(TOOL_EXAM_KEY, this.st); this.render(); window.scrollTo(0, 0); },
  render() {
    const st = this.st, q = this.q(), letters = "ABCDEFGHIJ";
    const picks = st.ans[q.id] || [];
    const grid = st.ids.map((id, i) => `<button onclick="MockExam.go(${i})" style="padding:4px 0;margin:0;${i === st.idx ? "border-color:var(--ac);" : ""}${(st.ans[id] || []).length ? "background:color-mix(in srgb,var(--ac) 20%,var(--card));" : ""}">${i + 1}</button>`).join("");
    const body = groupPassageText(q);
    document.getElementById("app").innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed var(--bd)">
          <span>第 ${st.idx + 1} / ${st.ids.length} 題</span>
          <span id="mkTimer" style="font-weight:bold;color:var(--ac)"></span>
          <button onclick="MockExam.confirmSubmit()" style="padding:6px 12px;margin:0">交卷</button>
        </div>
        <p style="white-space:pre-wrap;font-size:1.05rem;line-height:1.8">${escT(body)}</p>
        ${q.a.length > 1 ? `<span class="helper-text">多選題，可選多個。</span>` : ""}
        ${q.o.map((o, k) => `<button class="opt ${picks.includes(letters[k]) ? "sel" : ""}" onclick="MockExam.pick('${letters[k]}')">${o}</button>`).join("")}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button style="flex:1;margin:0" ${st.idx === 0 ? "disabled" : ""} onclick="MockExam.go(${st.idx - 1})">上一題</button>
          <button style="flex:1;margin:0" ${st.idx === st.ids.length - 1 ? "disabled" : ""} onclick="MockExam.go(${st.idx + 1})">下一題</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;margin-top:14px">${grid}</div>
      </div>`;
    const el = document.getElementById("mkTimer");
    if (el) { const left = Math.max(0, st.endAt - Date.now()); el.textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor(left / 1000) % 60).padStart(2, "0"); }
  },
  confirmSubmit() {
    const unanswered = this.st.ids.filter(id => !(this.st.ans[id] || []).length).length;
    const msg = unanswered ? `還有 ${unanswered} 題未作答，確定交卷？交卷後無法修改。` : "確定交卷？交卷後無法修改。";
    if (confirm(msg)) this.submit(false);
  },
  submit(auto) {
    const st = this.st; if (!st || st.done) return;
    clearInterval(mockTimer);
    st.done = true;
    let correct = 0; const rows = [];
    st.ids.forEach((id, i) => {
      const q = chineseQ().find(x => x.id === id);
      const picks = st.ans[id] || [];
      const r = gradeChoice(q, picks);
      if (r === "correct") correct++;
      if (r !== "skip") { addAttempt(id, r === "correct", "mock"); bumpStudy(id, r === "correct"); }
      const cls = r === "correct" ? "color:var(--ok)" : r === "skip" ? "opacity:.6" : "color:var(--no)";
      const txt = r === "correct" ? "✔ 答對" : r === "skip" ? "未作答" : "✘ 答錯";
      rows.push(`<details style="margin-bottom:8px"><summary>${i + 1}. <span style="${cls}">${txt}</span>　${escT(q.q.replace(/【\d+~\d+題為題組題】\n*/g, "").slice(0, 30))}</summary>
        <p style="margin:6px 0">你的答案：${picks.join("") || "—"}　正確答案：<strong>${q.a}</strong></p>
        <div style="font-size:.9rem;line-height:1.7;white-space:pre-wrap">${escT(q.e || "暫無解析")}</div></details>`);
    });
    st.result = { correct, total: st.ids.length, auto };
    toolWrite(TOOL_EXAM_KEY, st);
    const tests = toolRead(TOOL_TESTS_KEY, []);
    const usedMs = Math.min(Date.now() - (st.startAt || Date.now()), (st.endAt - (st.startAt || Date.now())) || Infinity);
    tests.push({ scope: st.scope || "all", correct, total: st.ids.length, auto, secs: Math.round(usedMs / 1000), ts: Date.now() });
    toolWrite(TOOL_TESTS_KEY, tests.slice(-TOOL_MAX_TESTS));
    const pct = st.ids.length ? Math.round(correct / st.ids.length * 100) : 0;
    document.getElementById("app").innerHTML = `
      <div class="card">
        <div class="header-row"><h2>📝 測驗結果</h2></div>
        <div style="text-align:center;margin:12px 0 18px">
          <div style="font-size:3rem;font-weight:bold;color:var(--ac)">${pct}%</div>
          <p style="margin:4px 0">答對 <strong>${correct}</strong> / ${st.ids.length} 題${auto ? "（時間到自動交卷）" : ""}</p>
        </div>
        ${rows.join("")}
        <button class="go" onclick="MockExam.finish()">完成，回到模擬測驗</button>
      </div>`;
    window.scrollTo(0, 0);
  },
  finish() { localStorage.removeItem(TOOL_EXAM_KEY); this.st = null; renderMockEntry(); }
};
window.MockExam = MockExam;

// 題組引文（與刷題頁一樣：附屬題前面接上組首引文）
function groupPassageText(q) {
  const all = chineseQ();
  const r = groupRangeOf(all, q);
  if (!r) return q.q;
  const start = all.find(x => x.y === q.y && +x.n === r[0]);
  if (!start) return q.q.replace(/【\d+~\d+題為題組題】\n*/g, "");
  if (+q.n === r[0]) return q.q.replace(/【\d+~\d+題為題組題】\n*/g, "");
  const raw = start.q.replace(/【\d+~\d+題為題組題】\n*/g, "");
  const br = raw.lastIndexOf("\n\n");
  return br !== -1 ? raw.substring(0, br) + "\n\n" + q.q : q.q;
}
function escT(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ---------- 學習統計 ----------
let statsMode = "all";
function renderStats() {
  try { renderStatsInner(); }
  catch (e) { document.getElementById("app").innerHTML = `<div class="card"><h2>📊 學習統計</h2><p>統計載入失敗：${escT(e.message)}</p></div>`; }
}
function renderStatsInner() {
  const attempts = toolRead(TOOL_STATS_KEY, []).filter(a => a && a.id);
  const firstTs = toolRead("tools_first_ts", null);
  const firstDay = firstTs ? fmtDay(firstTs) : "（尚未開始）";
  const s = summarize(attempts, statsMode);
  const pct = s.total ? Math.round(s.correct / s.total * 100) : 0;
  const yearRows = Object.keys(s.byYear).sort().map(y => {
    const v = s.byYear[y], p = Math.round(v.c / v.t * 100);
    return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:.9rem"><span>${y} 年</span><span>${p}%（${v.c}/${v.t}）</span></div>
      <div style="height:10px;background:var(--bd);border-radius:6px;overflow:hidden"><div style="height:100%;width:${p}%;background:var(--ac)"></div></div></div>`;
  }).join("") || `<p class="meta"><span>還沒有作答紀錄。</span></p>`;
  const wrongRank = Object.keys(s.wrongCount).sort((a, b) => s.wrongCount[b] - s.wrongCount[a]).slice(0, 10)
    .map(id => { const q = chineseQ().find(x => x.id === id); return `<button onclick="StatsView.q('${id}')" style="display:flex;width:100%;justify-content:space-between;text-align:left;padding:8px 10px;margin:4px 0;background:var(--bg)"><span>${q ? q.y + " 年 第" + q.n + " 題" : escT(id)}</span><strong>錯 ${s.wrongCount[id]} 次</strong></button>`; }).join("") || `<p class="meta"><span>目前沒有錯題。</span></p>`;
  const tests = toolRead(TOOL_TESTS_KEY, []).slice(-20).reverse();
  const fmtSecs = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const recent = (statsMode === "practice") ? `<p class="meta"><span>練習沒有測驗紀錄，請切換到「全部」或「模擬」。</span></p>` :
    (tests.map(t => {
      const d = new Date(t.ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const label = t.scope === "all" || !t.scope ? "全範圍" : t.scope + " 年";
      return `<div style="padding:8px 0;border-bottom:1px dashed var(--bd)"><div style="display:flex;justify-content:space-between"><span>${label}　模擬</span><strong>${t.correct}/${t.total}</strong></div><div class="meta" style="margin:2px 0 0;font-size:.85rem">${d}　用時 ${fmtSecs(t.secs || 0)}${t.auto ? "（時間到自動交卷）" : ""}</div></div>`;
    }).join("") || `<p class="meta"><span>還沒有模擬測驗紀錄。</span></p>`);
  const tab = (k, label) => `<button class="go" style="width:auto;padding:6px 12px;margin:0 6px 8px 0;${statsMode === k ? "" : "background:var(--bd);color:var(--text-color);box-shadow:none"}" onclick="StatsView.mode('${k}')">${label}</button>`;
  document.getElementById("app").innerHTML = `
    <div class="card">
      <div class="header-row"><h2>📊 學習統計</h2></div>
      <div>${tab("all", "全部")}${tab("practice", "練習")}${tab("mock", "模擬")}</div>
      <span class="helper-text">統計從 ${firstDay} 開始記錄，之前的練習請看各科卡片。多選題需完全答對才算答對。</span>
      <button onclick="StatsView.old()" style="margin:4px 0 8px;padding:6px 12px;font-size:.85rem">舊資料</button>
      <div style="display:flex;gap:10px;margin:12px 0">
        <div class="card" style="flex:1;margin:0;text-align:center"><div class="meta" style="margin:0">作答題數</div><strong style="font-size:1.4rem">${s.total}</strong></div>
        <div class="card" style="flex:1;margin:0;text-align:center"><div class="meta" style="margin:0">正確率</div><strong style="font-size:1.4rem">${pct}%</strong></div>
      </div>
      <p style="font-weight:bold;margin:16px 0 4px">各年度正確率</p>${yearRows}
      <p style="font-weight:bold;margin:20px 0 4px">最常答錯（前 10 題）</p>${wrongRank}
      <p style="font-weight:bold;margin:20px 0 4px">最近模擬測驗（最近 20 次）</p>${recent}
    </div>`;
  window.scrollTo(0, 0);
}
const StatsView = {
  mode(k) { statsMode = k; renderStats(); },
  old() { openOldModal(); },
  q(id) { openQModal(id); }
};
window.StatsView = StatsView;

// ---------- 彈窗（網站樣式） ----------
function toolModal(id) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement("div");
    m.id = id;
    m.className = "modal-overlay";
    m.style.zIndex = "1500";
    m.onclick = e => { if (e.target === m) m.classList.remove("active"); };
    document.body.appendChild(m);
  }
  return m;
}
function openQModal(id) {
  const q = chineseQ().find(x => qidOf(x) === id);
  const m = toolModal("statQModal");
  const body = q ? `
    <p style="white-space:pre-wrap;line-height:1.7;margin:0 0 12px">${escT(groupPassageText(q))}</p>
    ${q.o.map((o, k) => `<p style="margin:4px 0;${q.a.includes("ABCDEFGHIJ"[k]) ? "color:var(--ok);font-weight:bold" : ""}">${escT(o)}</p>`).join("")}
    <p style="margin:12px 0 4px">正確答案：<strong>${q.a}</strong></p>
    <div class="analysis-body" style="white-space:pre-wrap">${escT(q.e || "暫無解析")}</div>` : `<p>找不到這一題。</p>`;
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto;width:min(520px,92vw)">
    <h3>${q ? q.y + " 年 第 " + q.n + " 題" : "題目"}</h3>${body}
    <div class="modal-actions"><button class="go" onclick="document.getElementById('statQModal').classList.remove('active')">關閉</button></div></div>`;
  m.classList.add("active");
}
function openOldModal() {
  const b = toolRead("tools_baseline", { t: 0, c: 0, w: [] });
  const cur = toolRead("qb_study", { w: {}, c: 0, t: 0 });
  const still = (b.w || []).filter(id => cur.w && cur.w[id]);
  const pct = b.t ? Math.round(b.c / b.t * 100) : 0;
  const years = ["110", "111", "112", "113", "114", "115"];
  const rows = years.map(y => {
    const nums = still.filter(id => id.split("-")[0] === y).map(id => id.split("-")[1]).sort((a, b) => a - b);
    return `<tr><td style="padding:6px 10px;border:1px solid var(--bd)">${y} 年</td><td style="padding:6px 10px;border:1px solid var(--bd)">${nums.length ? nums.join("、") : "—"}</td></tr>`;
  }).join("");
  const m = toolModal("oldDataModal");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="max-height:80vh;overflow-y:auto;width:min(520px,92vw)">
    <h3>舊資料</h3>
    <p style="margin:0 0 6px">新版本之前的作答：<strong>${b.t}</strong> 題，答對 <strong>${b.c}</strong> 題（${pct}%）</p>
    <p style="font-weight:bold;margin:14px 0 6px">舊版錯題（目前仍在錯題本）</p>
    <table style="width:100%;border-collapse:collapse;font-size:.95rem">${rows}</table>
    <span class="helper-text">舊版只記錄目前仍在錯題本的題號，已答對移出錯題本的題目不會顯示在這裡。</span>
    <div class="modal-actions"><button class="go" onclick="document.getElementById('oldDataModal').classList.remove('active')">關閉</button></div></div>`;
  m.classList.add("active");
}

// 卡片「清除紀錄」：只清除目前科目（國文或英文）
function askClearRecords() {
  if (cur !== "chinese" && cur !== "english") return;
  const name = cur === "chinese" ? "國文" : "英文";
  const extra = cur === "chinese" ? "模擬測驗進度、學習統計資料、" : "";
  const m = toolModal("clearConfirm");
  m.innerHTML = `<div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,90vw);text-align:center">
    <h3 style="justify-content:center">是否確認刪除${name}刷題記錄？</h3>
    <p style="text-align:left;line-height:1.7;margin:8px 0 18px;white-space:pre-wrap">包括：${extra}${name}卡片刷題內容\n\n刪除後無法復原。</p>
    <div class="modal-actions" style="margin-top:0">
      <button class="go" style="background:var(--no)" onclick="doClearRecords()">是，確認刪除</button>
      <button class="go" style="background:var(--bd);color:var(--text-color);box-shadow:none" onclick="document.getElementById('clearConfirm').classList.remove('active')">否，我再想想</button>
    </div></div>`;
  m.classList.add("active");
}
function doClearRecords() {
  const c = cur;
  save({ w: {}, c: 0, t: 0 });                       // 主程式的 save 會存到目前科目
  if (c === "chinese") {
    localStorage.removeItem(TOOL_STATS_KEY);
    localStorage.removeItem(TOOL_EXAM_KEY);
    localStorage.removeItem(TOOL_TESTS_KEY);
    localStorage.removeItem("tools_first_ts");
    toolWrite("tools_baseline", { t: 0, c: 0, w: [] });
    mockTimer && clearInterval(mockTimer);
  }
  const cf = document.getElementById("clearConfirm");
  if (cf) cf.classList.remove("active");
  home();
}

// ---------- 側邊欄 ----------
const _navAfter = document.getElementById("navSettings");
Object.keys(TOOL_PAGES).reverse().forEach(k => {
  const el = document.createElement("div");
  el.className = "sidebar-item";
  el.id = "nav_" + k;
  el.textContent = ({ answers: "📋 答案表", mock: "📝 模擬測驗", stats: "📊 學習統計" })[k];
  el.onclick = () => switchPage(k);
  _navAfter.insertAdjacentElement("afterend", el);
});

// ---------- 包住既有函式 ----------
const _tSwitchPage = switchPage;
switchPage = function (p) {
  if (TOOL_PAGES[p]) { openTool(p); return; }
  window.__extraPage = null;
  Object.keys(TOOL_PAGES).forEach(k => { const el = document.getElementById("nav_" + k); if (el) el.classList.remove("active"); });
  return _tSwitchPage(p);
};
const _tGo = go;
go = function (k, f) { window.__extraPage = null; Object.keys(TOOL_PAGES).forEach(x => { const el = document.getElementById("nav_" + x); if (el) el.classList.remove("active"); }); return _tGo(k, f); };
const _tHome = home;
home = function () { if (window.__extraPage) { renderTool(window.__extraPage); return; } return _tHome(); };

// 記錄刷題練習的每一次作答（只記國文）
const _tSubmit = submit;
submit = function () {
  const q = list[i];
  const ready = !done && picks && picks.size > 0 && q;   // 只在真的送出作答時記錄
  const letters = ready ? [...picks].sort().map(k => L[k]).join("") : "";
  _tSubmit();
  if (ready && cur === "chinese") {
    addAttempt(qidOf(q), letters === q.a, "practice");
  }
};

// 網址是 #tool-xxx 時直接開啟（等主程式初始化完成）
function ensureToolShown() {
  const m = location.hash.match(/^#tool-(answers|mock|stats)$/);
  if (!m) return;
  const sm = document.getElementById("subjectModal"); if (sm) sm.classList.remove("active");
  openTool(m[1]);
}
setTimeout(ensureToolShown, 0);
setTimeout(ensureToolShown, 300);
window.addEventListener("load", ensureToolShown);
