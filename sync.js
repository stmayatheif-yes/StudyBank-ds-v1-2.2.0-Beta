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

// ---------- 介面 ----------
const bar = document.createElement("div");
bar.id = "syncBar";
bar.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:9998;max-width:calc(100% - 20px);background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;box-shadow:var(--shadow);font-size:.9rem;color:var(--text-color)";
bar.innerHTML = `
  <div id="syncMsg" style="margin-bottom:6px"></div>
  <div id="syncBtns" style="display:flex;flex-wrap:wrap;gap:6px"></div>`;
document.body.appendChild(bar);

const msgEl = () => document.getElementById("syncMsg");
const btnsEl = () => document.getElementById("syncBtns");
function setMsg(t) { msgEl().textContent = t || ""; }
function btn(label, onClick, disabled) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = !!disabled;
  b.onclick = onClick;
  return b;
}
function renderBar() {
  btnsEl().innerHTML = "";
  if (!user) {
    setMsg("登入 Google 以同步刷題記錄");
    btnsEl().appendChild(btn("登入／註冊（Google）", login));
    return;
  }
  setMsg("已登入：" + (user.email || ""));
  if (pending) {
    setMsg("雲端已有不同的紀錄，請選擇要以哪一邊為準：");
    btnsEl().appendChild(btn("覆蓋本機", overwriteLocal));
    btnsEl().appendChild(btn("覆蓋雲端", overwriteCloud));
  } else {
    btnsEl().appendChild(btn("同步刷題記錄", manualSync));
  }
  btnsEl().appendChild(btn("登出", logout));
}

// ---------- 功能 ----------
async function login() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { setMsg("登入失敗：" + e.code); }
}
async function logout() {
  await signOut(auth);
}

// 登入後：比對本機與雲端
async function checkAfterLogin() {
  cloudSnap = await fetchCloud();
  if (!cloudSnap) { pending = false; renderBar(); return; }   // 雲端還沒有資料：不需選擇
  const local = readLocal(localStorage);
  pending = canonical(local) !== canonical({ records: cloudSnap.records, settings: cloudSnap.settings });
  if (!pending) markSynced(local);
  renderBar();
}

async function overwriteLocal() {
  if (!confirm("確定要用雲端資料覆蓋本機嗎？本機紀錄將被取代，此操作無法復原。")) return;
  writeLocal({ records: cloudSnap.records, settings: cloudSnap.settings }, localStorage);
  markSynced({ records: cloudSnap.records, settings: cloudSnap.settings });
  location.reload();
}

async function overwriteCloud() {
  if (!confirm("確定要用本機資料覆蓋雲端嗎？雲端紀錄將被取代，此操作無法復原。")) return;
  const local = readLocal(localStorage);
  await uploadLocal(local);
  markSynced(local);
  pending = false;
  setMsg("已用本機資料覆蓋雲端");
  btnsEl().innerHTML = "";
  btnsEl().appendChild(btn("同步刷題記錄", manualSync));
  btnsEl().appendChild(btn("登出", logout));
}

// 手動同步（同步一律是「本機覆蓋雲端」）
async function manualSync() {
  const now = Date.now();
  const local = readLocal(localStorage);
  if (answeredCount(local) < MIN_MANUAL_QUESTIONS) {
    setMsg("刷題紀錄少於 " + MIN_MANUAL_QUESTIONS + " 題，暫時不能同步");
    return;
  }
  if (now - getLastAt() < COOLDOWN_MS) {
    setMsg("操作太頻繁，請稍後再試");
    return;
  }
  try {
    await uploadLocal(local);
    markSynced(local);
    setMsg("已同步：" + new Date().toLocaleTimeString());
  } catch (e) {
    setMsg("同步失敗，資料仍保留在本機，請稍後再試");
  }
}

// 離開網站：有變動就自動同步（不受題數門檻限制），但首次有出入還沒選擇時不動雲端
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
  else { pending = false; cloudSnap = null; renderBar(); }
});
renderBar();
