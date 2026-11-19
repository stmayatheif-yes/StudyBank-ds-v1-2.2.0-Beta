/* ==========================================
   雲端同步（Google 登入 + Firestore）
   使用方式：把本檔放在 GitHub 專案根目錄，並在 index.html 的 </body> 前加上：
   <script type="module" src="sync.js"></script>
   （舊的 Firebase 測試程式請刪掉，本檔會自己初始化）
   ========================================== */

/*PURE-START*/
const STORE_KEYS = { chinese: "qb_study", english: "qb_study_english" };
const SETTING_KEYS = ["style", "bg_type", "bg_color_1", "bg_color_2", "text_color", "current_preset"];
const CUSTOM_KEYS = ["custom_gradients", "custom_solids"];
const MIN_MANUAL_QUESTIONS = 5;
const COOLDOWN_MS = 60 * 1000;

// 物件依 key 排序後轉字串，用來比較兩份資料是否相同
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function parseOr(raw, fallback) {
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
}

// 讀取本機目前狀態（records = 各科刷題紀錄；settings = 外觀設定與自定義顏色）
function readLocal(st) {
  const records = {};
  for (const k in STORE_KEYS) records[k] = parseOr(st.getItem(STORE_KEYS[k]), null);
  const settings = {};
  SETTING_KEYS.forEach(k => { settings[k] = st.getItem(k); });
  CUSTOM_KEYS.forEach(k => { settings[k] = parseOr(st.getItem(k), []); });
  return { records, settings };
}

// 作答題數 = 各科 t 的總和
function answeredCount(snap) {
  let n = 0;
  for (const k in snap.records) n += (snap.records[k] && snap.records[k].t) || 0;
  return n;
}

// 把一份資料寫回本機（覆蓋本機時使用）
function writeLocal(snap, st) {
  for (const k in STORE_KEYS) {
    const v = snap.records[k];
    if (v == null) st.removeItem(STORE_KEYS[k]);
    else st.setItem(STORE_KEYS[k], JSON.stringify(v));
  }
  SETTING_KEYS.forEach(k => {
    const v = snap.settings[k];
    if (v == null) st.removeItem(k); else st.setItem(k, v);
  });
  CUSTOM_KEYS.forEach(k => st.setItem(k, JSON.stringify(snap.settings[k] || [])));
}

function canManualSync(snap, lastAt, now) {
  return answeredCount(snap) >= MIN_MANUAL_QUESTIONS && now - lastAt >= COOLDOWN_MS;
}

// 離開時自動同步：本機有變動，且不在冷卻中
function shouldAutoSync(snap, lastJson, lastAt, now) {
  return canonical(snap) !== lastJson && now - lastAt >= COOLDOWN_MS;
}
/*PURE-END*/

// ---------- Firebase ----------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc }
  from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBv77zKJ-18WXYdv533TUoiBAyHNda24zk",
  authDomain: "github-studybank-v1.firebaseapp.com",
  projectId: "github-studybank-v1",
  storageBucket: "github-studybank-v1.firebasestorage.app",
  messagingSenderId: "583900786899",
  appId: "1:583900786899:web:a67cad692505871cf06426"
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- 狀態 ----------
const LAST_AT_KEY = "sync_last_at";
const LAST_JSON_KEY = "sync_last_json";
let user = null;
let pending = false;      // 登入後有出入，等待使用者選擇覆蓋方向
let cloudSnap = null;

const getLastAt = () => Number(localStorage.getItem(LAST_AT_KEY) || 0);
const getLastJson = () => localStorage.getItem(LAST_JSON_KEY) || "";
function markSynced(snap) {
  localStorage.setItem(LAST_AT_KEY, String(Date.now()));
  localStorage.setItem(LAST_JSON_KEY, canonical(snap));
}

// ---------- 雲端讀寫 ----------
const cloudRef = () => doc(db, "users", user.uid, "data", "sync");
async function fetchCloud() {
  const snap = await getDoc(cloudRef());
  return snap.exists() ? snap.data() : null;
}
async function uploadLocal(snap) {
  await setDoc(cloudRef(), {
    records: snap.records,
    settings: snap.settings,
    updatedAt: Date.now()
  });
}

// ---------- 確認彈窗（網站樣式，放在最上層） ----------
const confirmEl = document.createElement("div");
confirmEl.id = "syncConfirm";
confirmEl.className = "modal-overlay";
confirmEl.style.zIndex = "2000";
confirmEl.innerHTML = `
  <div class="modal-content" onclick="event.stopPropagation()" style="width:min(380px,90vw);text-align:center">
    <h3 id="scTitle" style="justify-content:center"></h3>
    <p id="scText" style="text-align:left;line-height:1.7;margin:8px 0 18px"></p>
    <div class="modal-actions" style="margin-top:0">
      <button class="go" id="scOk"></button>
      <button class="go" id="scCancel" style="background:var(--bd);color:var(--text-color);box-shadow:none">取消</button>
    </div>
  </div>`;
confirmEl.style.zIndex = "1100";   // 高於同步頁，避免被蓋住
document.body.appendChild(confirmEl);

function askConfirm(title, text, okText) {
  return new Promise(resolve => {
    document.getElementById("scTitle").textContent = title;
    document.getElementById("scText").textContent = text;
    const ok = document.getElementById("scOk");
    const cancel = document.getElementById("scCancel");
    ok.textContent = okText;
    const done = v => { confirmEl.classList.remove("active"); ok.onclick = cancel.onclick = confirmEl.onclick = null; resolve(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    confirmEl.onclick = e => { if (e.target === confirmEl) done(false); };
    confirmEl.classList.add("active");
  });
}

// ---------- 雲端同步頁（和設定頁一樣，渲染在主畫面） ----------
let msgText = "";
let syncPageOn = false;

function btn(label, onClick, cls) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = cls || "go";
  b.style.marginTop = "8px";
  b.onclick = onClick;
  return b;
}

function renderSyncPage() {
  const box = document.getElementById("app");
  box.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="header-row"><h2>☁️ 雲端同步</h2></div>`;
  box.appendChild(card);

  const p = document.createElement("p");
  p.style.cssText = "line-height:1.7;margin:4px 0 12px";
  if (!user) {
    p.textContent = "登入 Google 以同步刷題記錄（錯題本、作答紀錄、外觀設定）。未登入時仍可正常使用，紀錄只存在本機。";
    card.appendChild(p);
    card.appendChild(btn("登入／註冊（Google）", login));
  } else {
    p.textContent = "已登入：" + (user.email || "");
    card.appendChild(p);
    if (pending) {
      const q = document.createElement("p");
      q.style.cssText = "line-height:1.7;margin:4px 0";
      q.textContent = "雲端已有不同的紀錄，請選擇要以哪一邊為準：";
      card.appendChild(q);
      card.appendChild(btn("覆蓋本機（拿雲端資料覆蓋本機）", overwriteLocal));
      card.appendChild(btn("覆蓋雲端（拿本機資料覆蓋雲端）", overwriteCloud));
    } else {
      card.appendChild(btn("同步刷題記錄", manualSync));
    }
    card.appendChild(btn("登出", logout));
  }
  const m = document.createElement("p");
  m.id = "syncMsg";
  m.style.cssText = "min-height:1.4em;margin:12px 0 0;font-size:.9rem;opacity:.8";
  m.textContent = msgText;
  card.appendChild(m);
}
function setMsg(t) { msgText = t || ""; const m = document.getElementById("syncMsg"); if (m) m.textContent = msgText; }

function setSyncNav(on) {
  const item = document.getElementById("navSync");
  if (item) item.classList.toggle("active", on);
  badge();
}
function badge() {
  const item = document.getElementById("navSync");
  if (!item) return;
  item.textContent = "☁️ 雲端同步" + (pending ? "  ●" : "");
}

// 開啟雲端同步頁：和設定頁相同的切換方式
function openSyncPage() {
  const sb = document.getElementById("sidebar");
  if (sb && sb.classList.contains("active") && typeof toggleSidebar === "function") toggleSidebar();
  syncPageOn = true;
  currentPage = "sync";
  window.__artActive = false;
  document.getElementById("navHome").classList.remove("active");
  document.getElementById("navSettings").classList.remove("active");
  document.getElementById("subjectNav").style.display = "none";
  setSyncNav(true);
  renderSyncPage();
}

// 離開雲端同步頁：切換到首頁、設定頁或科目時呼叫
function closeSyncPageState() {
  if (!syncPageOn) return;
  syncPageOn = false;
  setSyncNav(false);
}

// 側邊欄加入「雲端同步」（放在設定下面）
const navSettings = document.getElementById("navSettings");
if (navSettings) {
  const item = document.createElement("div");
  item.className = "sidebar-item";
  item.id = "navSync";
  item.textContent = "☁️ 雲端同步";
  item.onclick = openSyncPage;
  navSettings.insertAdjacentElement("afterend", item);
}

// 其他導覽動作會離開雲端同步頁：包住既有函式
const _switchPage = switchPage;
switchPage = function (p) { closeSyncPageState(); return _switchPage(p); };
const _go = go;
go = function (k, f) { closeSyncPageState(); return _go(k, f); };

// ---------- 功能 ----------
async function login() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { setMsg("登入失敗：" + e.code); renderSyncPage(); }
}
async function logout() {
  const ok = await askConfirm("登出", "確定要登出雲端帳號嗎？登出後仍可在本機刷題，但不會同步。", "登出");
  if (ok) await signOut(auth);
}

// 登入後：比對本機與雲端
async function checkAfterLogin() {
  cloudSnap = await fetchCloud();
  if (!cloudSnap) { pending = false; return; }
  const local = readLocal(localStorage);
  pending = canonical(local) !== canonical({ records: cloudSnap.records, settings: cloudSnap.settings });
  if (!pending) markSynced(local);
  badge();                       // 有出入：側邊欄顯示提示點，使用者自己點進去選擇
}

async function overwriteLocal() {
  const ok = await askConfirm("覆蓋本機", "確定要用雲端資料覆蓋本機嗎？本機目前的紀錄與設定會被取代，此操作無法復原。", "覆蓋本機");
  if (!ok) return;
  writeLocal({ records: cloudSnap.records, settings: cloudSnap.settings }, localStorage);
  markSynced({ records: cloudSnap.records, settings: cloudSnap.settings });
  location.reload();
}

async function overwriteCloud() {
  const ok = await askConfirm("覆蓋雲端", "確定要用本機資料覆蓋雲端嗎？雲端的紀錄會被取代，此操作無法復原。", "覆蓋雲端");
  if (!ok) return;
  const local = readLocal(localStorage);
  try {
    await uploadLocal(local);
    markSynced(local);
    pending = false;
    setMsg("已用本機資料覆蓋雲端");
  } catch (e) { setMsg("覆蓋失敗，請稍後再試"); }
  renderSyncPage();
}

async function manualSync() {
  const now = Date.now();
  const local = readLocal(localStorage);
  if (answeredCount(local) < MIN_MANUAL_QUESTIONS) {
    setMsg("刷題紀錄少於 " + MIN_MANUAL_QUESTIONS + " 題，暫時不能同步");
    renderSyncPage(); return;
  }
  if (now - getLastAt() < COOLDOWN_MS) {
    setMsg("操作太頻繁，請稍後再試");
    renderSyncPage(); return;
  }
  try {
    await uploadLocal(local);
    markSynced(local);
    setMsg("已同步：" + new Date().toLocaleTimeString());
  } catch (e) {
    setMsg("同步失敗，資料仍保留在本機，請稍後再試");
  }
  renderSyncPage();
}

// 離開網站：有變動就自動同步（不受 5 題限制）；首次有出入還沒選擇時不動雲端
function autoSyncOnLeave() {
  if (!user || pending) return;
  const local = readLocal(localStorage);
  if (!shouldAutoSync(local, getLastJson(), getLastAt(), Date.now())) return;
  localStorage.setItem(LAST_AT_KEY, String(Date.now()));
  uploadLocal(local).then(() => markSynced(local)).catch(() => {});
}
window.addEventListener("pagehide", autoSyncOnLeave);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoSyncOnLeave(); });

// ---------- 啟動 ----------
onAuthStateChanged(auth, async (u) => {
  user = u;
  if (u) await checkAfterLogin();
  else { pending = false; cloudSnap = null; badge(); }
  if (syncPageOn) renderSyncPage();
});
