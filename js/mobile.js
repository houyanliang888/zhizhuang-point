/* ===========================================================
   智装点位通 · 手机极速报价（v1.24.0）
   -----------------------------------------------------------
   定位：工地上手机快速报价，只留基础功能。
   - 型号二选一（Z1 / X30），空间填开关总数，按键自动按经验分配
   - 常用设备（网关/传感器/音箱）步进器
   - 电动窗帘（电机+轨道套装，按宽度档）
   - 底部固定合计：设备费 + 安装调试费(30%) = 总计
   价格口径与电脑版完全一致：全部复用 quote-switch.js 的
   数据与纯函数（switchPrice / sumSwitchQuote / allocSmart /
   curtainPriceAt / quoteTablePrice / EXTRA_INSTALL_RATE），
   报价表（products.js）改价这里自动跟涨。

   草稿存 localStorage，刷新/断网不丢。
   =========================================================== */

var MB_DRAFT_KEY = 'zzpt_mobile_draft_v1';

var MB = {
  model: 'z1',      /* 'z1' | 'x30' */
  rooms: {},        /* roomId -> 开关总数 */
  extras: {},       /* devId -> 数量 */
  curtains: []      /* [{ series, width, qty }] */
};

/* ---------- 草稿 ---------- */
function mbSave() {
  try { localStorage.setItem(MB_DRAFT_KEY, JSON.stringify(MB)); } catch (e) {}
}
function mbLoad() {
  try {
    var s = localStorage.getItem(MB_DRAFT_KEY);
    if (!s) return;
    var d = JSON.parse(s);
    if (d && d.model) {
      MB.model = (d.model === 'x30') ? 'x30' : 'z1';
      MB.rooms = d.rooms || {};
      MB.extras = d.extras || {};
      MB.curtains = Array.isArray(d.curtains) ? d.curtains : [];
    }
  } catch (e) {}
}
function mbReset() {
  MB.model = 'z1'; MB.rooms = {}; MB.extras = {}; MB.curtains = [];
  mbSave(); mbRenderAll();
}

/* ---------- 计算（与桌面版同一套口径） ---------- */

/* 空间开关 → recs：每空间总数按经验分配摊到 1~4 键 */
function mbSwitchRecs() {
  var recs = [];
  allSwitchRooms().forEach(function (rm) {
    var n = Math.max(0, parseInt(MB.rooms[rm.id], 10) || 0);
    if (!n) return;
    var alloc = allocSmart(n);
    SWITCH_KEY_ORDER.forEach(function (k) {
      if (alloc[k]) recs.push({ model: MB.model, room: rm.id, roomName: rm.name, key: k, qty: alloc[k] });
    });
  });
  return recs;
}

function mbCalc() {
  var sw = sumSwitchQuote(mbSwitchRecs());

  var extraRows = [], extrasTotal = 0;
  EXTRA_ORDER.forEach(function (id) {
    var q = Math.max(0, parseInt(MB.extras[id], 10) || 0);
    if (!q) return;
    var d = EXTRA_DEVICES[id];
    if (!d) return;
    extrasTotal += d.price * q;
    extraRows.push({ name: d.icon + ' ' + d.name, qty: q, price: d.price, sub: d.price * q });
  });

  var curtainRows = [], curtainTotal = 0;
  MB.curtains.forEach(function (c) {
    var s = CURTAIN_SERIES[c.series];
    var q = Math.max(0, parseInt(c.qty, 10) || 0);
    if (!s || !q) return;
    var price = curtainPriceAt(c.series, c.width);
    curtainTotal += price * q;
    curtainRows.push({ name: s.icon + ' ' + s.name.split('（')[0] + ' ' + c.width + 'm', qty: q, price: price, sub: price * q });
  });

  var device = sw.total + extrasTotal + curtainTotal;
  var install = Math.round(device * EXTRA_INSTALL_RATE);
  return {
    sw: sw, extraRows: extraRows, curtainRows: curtainRows,
    device: device, install: install, grand: device + install
  };
}

/* ---------- 金额格式 ---------- */
function mbMoney(n) { return '¥' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ---------- 渲染 ---------- */

function mbRenderModels() {
  var html = '';
  ['z1', 'x30'].forEach(function (id) {
    var m = SWITCH_MODELS[id];
    var on = MB.model === id;
    html += '<button class="model-card' + (on ? ' on' : '') + '" data-act="model" data-id="' + id + '">'
      + '<span class="m-name">' + m.short + '</span>'
      + '<span class="m-brand">' + m.brand + '</span>'
      + '<span class="m-price">' + mbMoney(m.keys[0].price) + ' 起</span>'
      + '</button>';
  });
  document.getElementById('mbModels').innerHTML = html;
}

function mbRenderRooms() {
  var html = '';
  allSwitchRooms().forEach(function (rm) {
    var n = Math.max(0, parseInt(MB.rooms[rm.id], 10) || 0);
    html += '<div class="row' + (n ? ' has' : '') + '">'
      + '<span class="r-icon">' + rm.icon + '</span>'
      + '<span class="r-name">' + rm.name + '</span>'
      + '<span class="stepper">'
      + '<button class="step-btn" data-act="room-dec" data-id="' + rm.id + '">−</button>'
      + '<span class="step-num" id="num_' + rm.id + '">' + n + '</span>'
      + '<button class="step-btn plus" data-act="room-inc" data-id="' + rm.id + '">+</button>'
      + '</span>'
      + '</div>';
  });
  document.getElementById('mbRooms').innerHTML = html;
}

function mbRenderExtras() {
  var html = '';
  EXTRA_ORDER.forEach(function (id) {
    var d = EXTRA_DEVICES[id];
    var q = Math.max(0, parseInt(MB.extras[id], 10) || 0);
    html += '<div class="row' + (q ? ' has' : '') + '">'
      + '<span class="r-icon">' + d.icon + '</span>'
      + '<span class="r-name">' + d.name + '<em>' + mbMoney(d.price) + '/' + d.unit + '</em></span>'
      + '<span class="stepper">'
      + '<button class="step-btn" data-act="extra-dec" data-id="' + id + '">−</button>'
      + '<span class="step-num" id="ex_' + id + '">' + q + '</span>'
      + '<button class="step-btn plus" data-act="extra-inc" data-id="' + id + '">+</button>'
      + '</span>'
      + '</div>';
  });
  document.getElementById('mbExtras').innerHTML = html;
}

function mbCurtainRowHTML(c, i) {
  var s = CURTAIN_SERIES[c.series] || CURTAIN_SERIES.C200;
  var ws = curtainWidths(s.id);
  var wOpts = '';
  ws.forEach(function (x) {
    wOpts += '<option value="' + x.w + '"' + (+x.w === +c.width ? ' selected' : '') + '>' + x.w + '米</option>';
  });
  var q = Math.max(0, parseInt(c.qty, 10) || 0);
  return '<div class="c-row">'
    + '<select class="c-series" data-act="curtain-series" data-i="' + i + '">'
    + CURTAIN_ORDER.map(function (id) {
        return '<option value="' + id + '"' + (id === s.id ? ' selected' : '') + '>' + CURTAIN_SERIES[id].name.split('（')[0] + '</option>';
      }).join('')
    + '</select>'
    + '<select class="c-width" data-act="curtain-width" data-i="' + i + '">' + wOpts + '</select>'
    + '<span class="stepper">'
    + '<button class="step-btn" data-act="curtain-dec" data-i="' + i + '">−</button>'
    + '<span class="step-num">' + q + '</span>'
    + '<button class="step-btn plus" data-act="curtain-inc" data-i="' + i + '">+</button>'
    + '</span>'
    + '<button class="c-del" data-act="curtain-del" data-i="' + i + '">✕</button>'
    + '</div>';
}

function mbRenderCurtains() {
  var box = document.getElementById('mbCurtainRows');
  if (!MB.curtains.length) {
    box.innerHTML = '<div class="c-empty">还没加窗帘，点下面按钮添加</div>';
    return;
  }
  var html = '';
  MB.curtains.forEach(function (c, i) { html += mbCurtainRowHTML(c, i); });
  box.innerHTML = html;
}

/* 底部合计（不重绘空间/设备列表，只刷数字，避免打乱点击节奏） */
function mbRenderTotals() {
  var r = mbCalc();
  document.getElementById('tDevice').textContent = mbMoney(r.device);
  document.getElementById('tInstall').textContent = mbMoney(r.install);
  document.getElementById('tGrand').textContent = mbMoney(r.grand);
  document.getElementById('tCount').textContent = r.sw.totalQty
    ? ('开关 ' + r.sw.totalQty + ' 面')
    : '';
}

function mbRenderAll() {
  mbRenderModels();
  mbRenderRooms();
  mbRenderExtras();
  mbRenderCurtains();
  mbRenderTotals();
}

/* ---------- 明细抽屉 ---------- */
function mbToggleDetail(show) {
  var d = document.getElementById('mbDetail');
  d.classList.toggle('open', show);
  if (!show) return;
  var r = mbCalc();
  var html = '';

  if (r.sw.totalQty) {
    var m = switchModel(MB.model);
    html += '<h4>' + m.short + ' 开关（按键自动分配）</h4>';
    r.sw.byModel[MB.model].rows.forEach(function (row) {
      var keyName = '';
      m.keys.forEach(function (kk) { if (kk.k === row.k) keyName = kk.name; });
      html += '<div class="d-row"><span>' + keyName + '</span><span>×' + row.qty
        + '</span><span>' + mbMoney(row.price) + '</span><b>' + mbMoney(row.sub) + '</b></div>';
    });
  }
  if (r.extraRows.length) {
    html += '<h4>网关 / 传感器 / 设备</h4>';
    r.extraRows.forEach(function (x) {
      html += '<div class="d-row"><span>' + x.name + '</span><span>×' + x.qty
        + '</span><span>' + mbMoney(x.price) + '</span><b>' + mbMoney(x.sub) + '</b></div>';
    });
  }
  if (r.curtainRows.length) {
    html += '<h4>电动窗帘（电机+轨道套装）</h4>';
    r.curtainRows.forEach(function (x) {
      html += '<div class="d-row"><span>' + x.name + '</span><span>×' + x.qty
        + '</span><span>' + mbMoney(x.price) + '</span><b>' + mbMoney(x.sub) + '</b></div>';
    });
  }
  if (!html) html = '<div class="d-empty">还没选任何东西，在上方 + 号开始加</div>';

  html += '<div class="d-sum">'
    + '<div class="d-row"><span>设备费合计</span><b>' + mbMoney(r.device) + '</b></div>'
    + '<div class="d-row"><span>安装调试服务费（设备费×30%）</span><b>' + mbMoney(r.install) + '</b></div>'
    + '<div class="d-row grand"><span>客户总计</span><b>' + mbMoney(r.grand) + '</b></div>'
    + '</div>';

  document.getElementById('mbDetailBody').innerHTML = html;
}

/* ---------- 事件 ---------- */
function mbStep(id, delta) {
  var n = Math.max(0, (parseInt(MB.rooms[id], 10) || 0) + delta);
  MB.rooms[id] = n;
  document.getElementById('num_' + id).textContent = n;
  document.getElementById('num_' + id).closest('.row').classList.toggle('has', n > 0);
  mbSave(); mbRenderTotals();
}
function mbStepExtra(id, delta) {
  var n = Math.max(0, (parseInt(MB.extras[id], 10) || 0) + delta);
  MB.extras[id] = n;
  document.getElementById('ex_' + id).textContent = n;
  document.getElementById('ex_' + id).closest('.row').classList.toggle('has', n > 0);
  mbSave(); mbRenderTotals();
}
function mbStepCurtain(i, delta) {
  var c = MB.curtains[i];
  if (!c) return;
  c.qty = Math.max(0, (parseInt(c.qty, 10) || 0) + delta);
  if (!c.qty) { MB.curtains.splice(i, 1); mbRenderCurtains(); }
  else { mbRenderCurtains(); }
  mbSave(); mbRenderTotals();
}

function mbBind() {
  document.body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var id = t.getAttribute('data-id');
    var i = parseInt(t.getAttribute('data-i'), 10);

    if (act === 'model') { MB.model = id; mbSave(); mbRenderModels(); mbRenderTotals(); }
    else if (act === 'room-inc') mbStep(id, +1);
    else if (act === 'room-dec') mbStep(id, -1);
    else if (act === 'extra-inc') mbStepExtra(id, +1);
    else if (act === 'extra-dec') mbStepExtra(id, -1);
    else if (act === 'curtain-add') { MB.curtains.push({ series: 'C200', width: CURTAIN_DEFAULT_WIDTH, qty: 1 }); mbSave(); mbRenderCurtains(); mbRenderTotals(); }
    else if (act === 'curtain-del') { MB.curtains.splice(i, 1); mbSave(); mbRenderCurtains(); mbRenderTotals(); }
    else if (act === 'curtain-inc') mbStepCurtain(i, +1);
    else if (act === 'curtain-dec') mbStepCurtain(i, -1);
    else if (act === 'detail-open') mbToggleDetail(true);
    else if (act === 'detail-close') mbToggleDetail(false);
    else if (act === 'reset') {
      if (confirm('清空本单所有数量？')) mbReset();
    }
  });

  document.body.addEventListener('change', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var i = parseInt(t.getAttribute('data-i'), 10);
    if (act === 'curtain-series') {
      var c = MB.curtains[i];
      if (c) { c.series = t.value; c.width = CURTAIN_DEFAULT_WIDTH; mbSave(); mbRenderCurtains(); mbRenderTotals(); }
    } else if (act === 'curtain-width') {
      var c2 = MB.curtains[i];
      if (c2) { c2.width = parseFloat(t.value) || CURTAIN_DEFAULT_WIDTH; mbSave(); mbRenderTotals(); }
    }
  });

  /* 折叠区展开时才渲染，省一次初始绘制 */
  ['secExtras', 'secCurtain'].forEach(function (secId) {
    var sec = document.getElementById(secId);
    sec.addEventListener('toggle', function () {
      if (sec.open) { mbRenderExtras(); mbRenderCurtains(); }
    });
  });
}

/* ---------- 启动 ---------- */
function mbInit() {
  mbLoad();
  mbBind();
  mbRenderAll();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mbInit);
} else {
  mbInit();
}
