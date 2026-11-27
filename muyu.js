/* 學測祈福電子木魚 muyu.js
 * 使用方式：index.html 的 </body> 前面加一行
 *   <script src="muyu.js"></script>
 * 本檔會自己插入 CSS 與木魚按鈕，不需要改其他地方。
 */
(function () {
  if (document.getElementById('muyu')) return; // 避免重複載入

  var KEY = 'sb_muyu_merit', MUTE_KEY = 'sb_muyu_mute';

  // 木魚離底部音樂播放器的距離；播放器更高就調大這個數字
  var BOTTOM_OFFSET = 96;

  // 祈福字樣（可自行增減）
  var BLESS = [
    // 國文
    '閱測文言文秒懂，不需腦補自動翻譯',
    '國寫知性題論點犀利，情意題感動閱卷老師',
    '古文十五篇倒背如流，字音字形零失誤',
    '選擇題「以上皆是」與「以上皆非」一眼看穿',
    '作文靈感湧現，字數精準停在最完美的一行',
    '錯別字退散，修辭判讀百發百中',
    // 英文
    '單字題四個選項全認識，沒有任何生字',
    '閱讀測驗長文一眼抓到主旨，寫完還剩 20 分鐘',
    '綜合測驗與文意選填語感大爆發，介系詞全對',
    '翻譯題句型精準，中式英文自動退散',
    '英文作文寫出高級單字，直接拿下 18 分以上',
    '篇章結構邏輯滿分，前後文完美銜接',
    // 數學
    '計算過程零粗心，正負號永遠不會看錯',
    '看到幾何題自動浮現輔助線，一秒解開',
    '多選題「全對」或「只錯一個」的機率降為零',
    '選填題數字漂亮整齊，不會出現奇怪的根號',
    '混合題手寫步驟完美無瑕，閱卷老師直接給滿分',
    '就算用猜的，骰子也只會擲出正確答案',
    // 自然
    '物理受力分析圖畫得比課本還標準',
    '化學平衡係數一眼看出，沉澱表全部記得',
    '生物演化樹與遺傳機率計算一次算對',
    '地科天氣圖與星等判讀清晰無比，絕不搞混',
    '探究與實作題組圖表全看懂，實驗變因秒抓出',
    '單位換算零失誤，莫耳數計算順暢無比',
    // 社會
    '歷史朝代時間軸清晰，跨時代比較題全對',
    '地理氣候圖與等高線一眼看穿，經緯度不迷路',
    '公民經濟學供需曲線完美平移，法律題精準判斷',
    '題幹再長也能一秒抓出關鍵字，不被誘答選項騙到',
    '跨科整合題思緒清晰，社會 15 級分穩穩入袋',
    // 通用
    '猜題全中，不會寫的題目剛好都選對',
    '劃卡精準無誤，絕對不會發生「整排劃錯格」慘案',
    '考試當天腸胃乖乖聽話，大腦處於巔峰狀態',
    '頂標 +1、滿級分 +1、夢幻志願錄取率 +100%',
    '考場冷氣溫度剛剛好，旁邊同學不會一直抖腳',
    '粗心怪退散，考神文昌帝君全程在線加持'
  ];

  // 外觀：累積功德解鎖
  var SKINS = [
    { at: 0,   name: '原木木魚',     body: '#a8672f', knob: '#8a5224', glow: 0 },
    { at: 100, name: '黃金木魚',     body: '#d9a62e', knob: '#b9851b', glow: 0 },
    { at: 300, name: '文昌帝君加持', body: '#b3261e', knob: '#e0b24a', glow: 1 }
  ];

  var css =
    '#muyu{position:fixed;right:14px;bottom:calc(' + BOTTOM_OFFSET + 'px + env(safe-area-inset-bottom,0px));z-index:900;display:flex;flex-direction:column;align-items:center;gap:2px;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
    '#muyu{touch-action:none}#muyu-hit{width:68px;height:62px;padding:0;border:0;background:none;cursor:grab;touch-action:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.28))}' +
    '#muyu-hit svg{width:100%;height:100%;display:block}' +
    '#muyu-count{font-size:12px;line-height:1.2;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(40,28,18,.78);color:#f6e7c1}' +
    '#muyu-mute{position:absolute;top:-10px;left:-14px;width:26px;height:26px;border-radius:50%;border:0;font-size:13px;cursor:pointer;background:rgba(40,28,18,.78);color:#f6e7c1}' +
    '#muyu-layer{position:fixed;inset:0;pointer-events:none;z-index:901;overflow:hidden}' +
    '.muyu-float{position:fixed;width:max-content;max-width:230px;text-align:center;line-height:1.4;font-size:16px;font-weight:700;letter-spacing:.03em;color:#b8862b;text-shadow:0 1px 0 #fff8,0 0 6px #fff6;animation:muyu-up 1.3s ease-out forwards}' +
    '.muyu-float.gold{color:#d4a017;font-size:20px}' +
    '@keyframes muyu-up{0%{opacity:0;transform:translate(-50%,0)}15%{opacity:1}100%{opacity:0;transform:translate(-50%,-96px)}}' +
    '@keyframes muyu-fade{0%{opacity:0}15%{opacity:1}100%{opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.muyu-float{animation:muyu-fade 1.3s ease-out forwards}}';

  var html =
    '<button id="muyu-mute" type="button" aria-label="切換木魚音效">🔊</button>' +
    '<button id="muyu-hit" type="button" aria-label="敲木魚祈福">' +
      '<svg viewBox="0 0 80 70" aria-hidden="true">' +
        '<ellipse id="mf-glow" cx="40" cy="38" rx="38" ry="31" fill="none" stroke="#ffd966" stroke-width="3" opacity="0"/>' +
        '<ellipse id="mf-body" cx="40" cy="38" rx="32" ry="26" fill="#a8672f"/>' +
        '<ellipse cx="32" cy="28" rx="16" ry="8" fill="#fff" opacity=".18"/>' +
        '<path d="M12 40 Q40 52 68 40" fill="none" stroke="#3b210d" stroke-width="4" stroke-linecap="round"/>' +
        '<circle id="mf-knob" cx="66" cy="18" r="7" fill="#8a5224"/>' +
      '</svg>' +
    '</button>' +
    '<div id="muyu-count">功德 0</div>';

  function init() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'muyu';
    root.innerHTML = html;
    document.body.appendChild(root);

    var layer = document.createElement('div');
    layer.id = 'muyu-layer';
    document.body.appendChild(layer);

    var merit = 0, muted = false, ctx = null;
    try { merit = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) {}
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

    var $hit = document.getElementById('muyu-hit');
    var $count = document.getElementById('muyu-count');
    var $mute = document.getElementById('muyu-mute');
    var $body = document.getElementById('mf-body');
    var $knob = document.getElementById('mf-knob');
    var $glow = document.getElementById('mf-glow');

    function skinFor(n) {
      var s = SKINS[0];
      for (var i = 0; i < SKINS.length; i++) if (n >= SKINS[i].at) s = SKINS[i];
      return s;
    }
    function render() {
      var s = skinFor(merit);
      $body.setAttribute('fill', s.body);
      $knob.setAttribute('fill', s.knob);
      $glow.setAttribute('opacity', s.glow ? '.9' : '0');
      $count.textContent = '功德 ' + merit;
      $mute.textContent = muted ? '🔇' : '🔊';
    }
    function save() {
      try { localStorage.setItem(KEY, String(merit)); } catch (e) {}
    }

    // 用 Web Audio 合成木魚「叩」聲，不需要 mp3 檔
    function knock() {
      if (muted) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        var t = ctx.currentTime;
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(820, t);
        osc.frequency.exponentialRampToValueAtTime(380, t + 0.09);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        osc.connect(g).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.18);

        var o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(1640, t);
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.18, t + 0.003);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o2.connect(g2).connect(ctx.destination);
        o2.start(t); o2.stop(t + 0.06);
      } catch (e) {}
    }

    function floatText(text, gold) {
      if (layer.childElementCount > 12) return;
      var r = $hit.getBoundingClientRect();
      var el = document.createElement('div');
      el.className = 'muyu-float' + (gold ? ' gold' : '');
      el.textContent = text;
      var x = r.left + r.width / 2 + (Math.random() * 60 - 30);
      x = Math.max(120, Math.min(window.innerWidth - 120, x));
      el.style.left = x + 'px';
      el.style.top = (r.top - 6) + 'px';
      layer.appendChild(el);
      setTimeout(function () { el.remove(); }, 1350);
    }

    function tap() {
      var before = skinFor(merit);
      merit++;
      var after = skinFor(merit);
      knock();
      if (navigator.vibrate) navigator.vibrate(8);
      if ($hit.animate) {
        $hit.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1)' }],
          { duration: 140, easing: 'ease-out' }
        );
      }
      floatText(BLESS[Math.floor(Math.random() * BLESS.length)]);
      if (after !== before) floatText('解鎖「' + after.name + '」', true);
      render();
      save();
    }

    // ===== 拖移：按住木魚移動，位置會記住；輕點才算敲木魚 =====
    var POS_KEY = 'sb_muyu_pos', hasPos = false, drag = null, dragged = false;

    function clampPos(l, t) {
      var w = root.offsetWidth, h = root.offsetHeight;
      l = Math.max(18, Math.min(window.innerWidth - w - 4, l)); // 左側留位置給靜音鈕
      t = Math.max(30, Math.min(window.innerHeight - h - 4, t));
      return [l, t];
    }
    function applyPos(l, t) {
      var p = clampPos(l, t);
      root.style.left = p[0] + 'px';
      root.style.top = p[1] + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      hasPos = true;
    }
    function savePos() {
      var r = root.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify([r.left, r.top])); } catch (e) {}
    }
    try {
      var saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && isFinite(saved[0]) && isFinite(saved[1])) applyPos(saved[0], saved[1]);
    } catch (e) {}

    root.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#muyu-mute')) return;
      var r = root.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, l: r.left, t: r.top };
      dragged = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!dragged && Math.sqrt(dx * dx + dy * dy) < 8) return; // 小於 8px 視為點擊
      dragged = true;
      applyPos(drag.l + dx, drag.t + dy);
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (dragged) savePos();
      drag = null;
    }
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', function () {
      if (!hasPos) return;
      var r = root.getBoundingClientRect();
      applyPos(r.left, r.top);
    });

    $hit.addEventListener('click', function () {
      if (dragged) { dragged = false; return; } // 剛拖完不算敲
      tap();
    });
    $mute.addEventListener('click', function () {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      render();
    });

    // 給 sync.js 用：讀寫功德值（雲端同步時只往大的更新）
    window.SB_MUYU = {
      get: function () { return merit; },
      set: function (n) {
        n = parseInt(n, 10) || 0;
        if (n > merit) { merit = n; render(); save(); }
      }
    };

    render();
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
