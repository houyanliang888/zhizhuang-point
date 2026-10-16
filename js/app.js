/* ===========================================================
   智装点位通 · 主逻辑
   =========================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var uidSeed = 0;
  function uid(p) { uidSeed++; return (p || 'x') + '_' + Date.now().toString(36) + '_' + uidSeed; }

  /* ---------- 存储封装（图片：IndexedDB 优先，降级 localStorage） ---------- */
  var IMG = (function () {
    var db = null, mode = null;
    function openDB(cb) {
      try {
        var req = indexedDB.open('zd_point_imgs', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('imgs'); };
        req.onsuccess = function () { db = req.result; mode = 'idb'; cb(true); };
        req.onerror = function () { mode = 'ls'; cb(false); };
        req.onblocked = function () { mode = 'ls'; cb(false); };
      } catch (e) { mode = 'ls'; cb(false); }
    }
    openDB(function () { });
    function tx(m, fn) {
      return new Promise(function (res) {
        if (mode === 'idb' && db) {
          var t = db.transaction('imgs', m);
          var r = fn(t.objectStore('imgs'));
          t.oncomplete = function () { res(r && r.result); };
          t.onerror = function () { res(null); };
        } else res(null);
      });
    }
    return {
      put: function (id, data) {
        return tx('readwrite', function (s) { s.put(data, id); }).then(function () { return true; })
          .catch(function () { return false; });
      },
      get: function (id) {
        return tx('readonly', function (s) { return s.get(id); });
      },
      del: function (id) {
        return tx('readwrite', function (s) { s.delete(id); });
      }
    };
  })();

  /* ---------- 产品库 ---------- */
  /* PRODUCTS 来自 js/products.js（你的真实供货价），可在「产品库」里追加导入 */
  var LIB = (PRODUCTS || []).slice();
  var SRC_ORDER = ['Aqara绿米', 'Yeelight驭光', 'Yeelight', '网络覆盖', '家庭影院', '背景音乐', '楼宇对讲', '电动升降帘', '线性灯型材'];
  var EXTRA_KEY = 'zd_products_extra';
  try {
    var ex = localStorage.getItem(EXTRA_KEY);
    if (ex) { var o = JSON.parse(ex); if (o && o.length) LIB = LIB.concat(o); }
  } catch (e) { }

  function srcRank(p) {
    var i = SRC_ORDER.indexOf(p.src);
    return i < 0 ? 99 : i;
  }

  /* 按点位模板的品类挑产品：关键词命中 → 首选来源 → 价格由低到高 */
  function pickProducts(devKeys, prefSrc, word) {
    var cats = [];
    (devKeys && devKeys.length ? devKeys : [devKeys]).forEach(function (d) {
      var c = tplCat(d); if (cats.indexOf(c) < 0) cats.push(c);
    });
    var list = LIB.filter(function (p) {
      return cats.indexOf(p.cat) >= 0 && !isExcluded(p);
    });
    if (word) {
      var hit = list.filter(function (p) { return (p.type + ' ' + p.name).indexOf(word) >= 0; });
      if (hit.length) list = hit;
    }
    /* must：产品名必须命中的字（防止错配，宁可报缺货） */
    var must = arguments[3];
    if (must) {
      var ok = list.filter(function (p) { return (p.type + ' ' + p.name).indexOf(must) >= 0; });
      if (!ok.length) return [];
      list = ok;
    }
    list.sort(function (a, b) {
      var ra = srcRank(a), rb = srcRank(b);
      if (ra !== rb) return ra - rb;
      return a.price - b.price;
    });
    if (prefSrc) {
      var pref = list.filter(function (p) { return p.src === prefSrc; });
      if (pref.length) {
        var rest = list.filter(function (p) { return p.src !== prefSrc; });
        list = pref.concat(rest);
      }
    }
    return list;
  }

  function devOptions(p) {
    var tpl = TEMPLATES.filter(function (t) { return t.id === p._tplId; })[0];
    var keys = (tpl && tpl.devAlt && tpl.devAlt.length) ? tpl.devAlt : [tpl ? tpl.dev : p.devCat];
    return pickProducts(keys, tpl ? tpl.src : '', tpl ? tpl.w : '', tpl ? tpl.must : '');
  }
  function findProd(sel) {
    if (!sel) return null;
    for (var i = 0; i < LIB.length; i++) {
      if ((LIB[i].src + '|' + LIB[i].type + '|' + LIB[i].name) === sel) return LIB[i];
    }
    return null;
  }
  function prodKey(p) { return p.src + '|' + p.type + '|' + p.name; }

  /* ---------- 价格记忆（以产品为键） ---------- */
  function getPrice(k, dflt) {
    try {
      var v = localStorage.getItem('zdprice_' + k);
      return v === null ? dflt : (parseFloat(v) || dflt);
    } catch (e) { return dflt; }
  }
  function setPrice(k, v) {
    try { localStorage.setItem('zdprice_' + k, v); } catch (e) { }
  }

  /* ---------- 状态 ---------- */
  var S = {
    projectName: '',
    wire: 'unknown',
    rooms: [],
    gNeeds: [],                 // 全屋级需求 id
    rNeeds: {},                 // uid -> [needId]
    tier: 2,
    note: '',
    points: [],
    installFee: 0,
    extraFee: 0,
    date: '',
    imgs: [],
    planId: null,
    planDrag: {},              // 点位拖拽偏移：key -> {dx, dy}（相对自动排布）
    panelLabels: {},           // 面板按键功能标签：key -> 文字（手动编辑覆盖自动推断）
    markers: []                // 平面图设备标注：{id,type,x,y,label,room}  x/y 为相对图比例 0-1
  };

  /* 平面图设备标注：可标注的设备类型（图标用 emoji，颜色用于标注图与标记） */
  var DEV_TYPES = {
    'switch':  { name: '智能开关', icon: '🔘', color: '#e8590c' },
    'sensor':  { name: '传感器',   icon: '📡', color: '#1c7ed6' },
    'curtain': { name: '窗帘电机', icon: '🪟', color: '#7048e8' },
    'lock':    { name: '智能门锁', icon: '🔒', color: '#2f9e44' },
    'camera':  { name: '摄像头',   icon: '📷', color: '#0c8599' },
    'hub':     { name: '中控屏',   icon: '🖥', color: '#495057' },
    'socket':  { name: '智能插座', icon: '🔌', color: '#f08c00' },
    'light':   { name: '智能灯具', icon: '💡', color: '#f1b211' },
    'other':   { name: '其他',     icon: '❔', color: '#868e96' }
  };
  var DEV_ORDER = ['switch', 'sensor', 'curtain', 'lock', 'camera', 'hub', 'socket', 'light', 'other'];
  var activeDevType = 'switch';
  var devMode = false;

  function fmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmt0(n) { n = Number(n) || 0; return Math.round(n).toLocaleString('zh-CN'); }

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  /* 通用模态弹窗：替代浏览器原生 prompt/confirm（Electron 桌面版会禁用原生弹窗，导致无法输入） */
  function modalBox(cfg) {
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    var box = document.createElement('div');
    box.className = 'modal-box';
    var html = '<div class="modal-title">' + (cfg.title || '') + '</div><div class="modal-body">';
    (cfg.fields || []).forEach(function (f) {
      if (f.type === 'select') {
        html += '<label class="modal-field"><span>' + f.label + '</span>' +
          '<select data-k="' + f.key + '" class="w100" style="border:1px solid var(--line);border-radius:8px;padding:8px;font-family:inherit;font-size:13.5px">' +
          (f.options || '') + '</select></label>';
      } else {
        html += '<label class="modal-field"><span>' + f.label + '</span>' +
          '<input type="' + (f.type || 'text') + '" data-k="' + f.key + '" placeholder="' + (f.placeholder || '') + '" value="' + (f.value != null ? f.value : '') + '"></label>';
      }
    });
    html += '</div><div class="modal-actions">' +
      '<button class="btn sm" data-act="cancel">' + (cfg.cancelText || '取消') + '</button>' +
      '<button class="btn sm primary" data-act="ok">' + (cfg.okText || '确定') + '</button></div>';
    box.innerHTML = html;
    mask.appendChild(box);
    document.body.appendChild(mask);
    var first = box.querySelector('input, select');
    if (first) setTimeout(function () { first.focus(); }, 30);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    box.querySelector('[data-act="cancel"]').onclick = function () { close(); if (cfg.onCancel) cfg.onCancel(); };
    mask.onclick = function (e) { if (e.target === mask) { close(); if (cfg.onCancel) cfg.onCancel(); } };
    box.querySelector('[data-act="ok"]').onclick = function () {
      var vals = {};
      box.querySelectorAll('[data-k]').forEach(function (inp) { vals[inp.dataset.k] = inp.value; });
      close();
      if (cfg.onOk) cfg.onOk(vals);
    };
    return mask;
  }

  /* =========================================================
     1. 户型
     ========================================================= */
  function renderPlans() {
    var box = $('planList'); box.innerHTML = '';
    FLOOR_PLANS.forEach(function (p) {
      var area = p.rooms.reduce(function (a, r) { return a + r.area; }, 0);
      var b = document.createElement('button');
      b.className = 'plan-card' + (S.planId === p.id ? ' on' : '');
      b.innerHTML = '<div class="ic">' + p.icon + '</div><b>' + p.name + '</b>' +
        '<em>' + p.rooms.length + ' 个空间 · 约 ' + area + '㎡</em>';
      b.onclick = function () {
        pickPlan(p.id);
        toast('已带入「' + p.name + '」');
      };
      box.appendChild(b);
    });
  }

  /* 窗帘轨道选项：value 决定电机台数与型号
     none   不做窗帘（默认走 needs 勾选，这里只是轨道维度）
     single 单轨：1 台电机
     dual   双轨（遮光+纱）：2 台电机 */
  var TRACKS = {
    none:   { name: '不做窗帘', short: '无' },
    single: { name: '单轨',short: '单轨', motors: 1 },
    dual:   { name: '双轨（遮光+纱）', short: '双轨', motors: 2 }
  };

  function renderRooms() {
    var tb = $('roomRows'); tb.innerHTML = '';
    S.rooms.forEach(function (r, i) {
      var tr = document.createElement('tr');
      var track = r.track || 'none';
      var rt = ROOM_TYPES[r.type] || ROOM_TYPES.other;
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        /* 空间：名字自己写，类型由名字自动推断，图标只作提示 */
        '<td><span class="room-ic" title="' + esc(rt.name) + '">' + rt.icon + '</span>' +
        '<input type="text" data-k="name" value="' + esc(r.name) + '" placeholder="如 主卧 / 客厅" style="width:150px">' +
        '<button class="tpick" data-tpick="1" title="改类型">▾</button></td>' +
        /* 开关：直接填数量，0 = 不出开关点位 */
        '<td><input type="number" data-k="sw" min="0" step="1" value="' + (r.sw || 0) + '" style="width:66px"></td>' +
        /* 传感器：同上 */
        '<td><input type="number" data-k="sn" min="0" step="1" value="' + (r.sn || 0) + '" style="width:66px"></td>' +
        /* 周长：灯带米数估算用，可空；不填就退回按面积估 */
        '<td><input type="number" data-k="peri" min="0" step="0.5" value="' + (r.peri || '') + '" placeholder="—" style="width:62px"></td>' +
        '<td><select data-k="track" class="w130">' +
        Object.keys(TRACKS).map(function (k) {
          return '<option value="' + k + '"' + (track === k ? ' selected' : '') + '>' + TRACKS[k].name + '</option>';
        }).join('') + '</select></td>' +
        '<td><button class="del" data-del="' + r.uid + '">删除</button></td>';
      tr.querySelectorAll('[data-k]').forEach(function (el) {
        el.onchange = function () {
          var v = el.value;
          if (el.dataset.k === 'name') {
            r.name = v;
            /* 名字能认出类型就自动跟着换，认不出（other）保持原类型 */
            var guess = guessRoomType(v);
            if (guess !== 'other') r.type = guess;
          } else if (el.dataset.k === 'track') {
            r.track = v;
            /* 选了「不做窗帘」就把该空间的窗帘需求勾清掉，
               免得需求区还亮着「电动窗帘」，两个界面打架 */
            if (v === 'none') {
              var arr = S.rNeeds[r.uid];
              if (arr) S.rNeeds[r.uid] = arr.filter(function (id) { return !/curtain/.test(id); });
            }
          } else if (el.dataset.k === 'sw' || el.dataset.k === 'sn') {
            r[el.dataset.k] = Math.max(0, parseInt(v, 10) || 0);
          } else if (el.dataset.k === 'peri') {
            r.peri = Math.max(0, parseFloat(v) || 0);
          } else r[el.dataset.k] = v;
          renderRooms(); renderNeeds();
          genPoints(true);
        };
      });
      /* ▾ 手动改类型：认不出的空间（如「影音室」）需要手动指定 */
      tr.querySelector('[data-tpick]').onclick = function () {
        var opts = Object.keys(ROOM_TYPES).map(function (k) {
          return '<option value="' + k + '"' + (r.type === k ? ' selected' : '') + '>' +
            ROOM_TYPES[k].icon + ' ' + ROOM_TYPES[k].name + '</option>';
        }).join('');
        modalBox({
          title: '「' + (r.name || '这个空间') + '」按哪类算点位？',
          fields: [{ key: 'type', label: '空间类型', type: 'select', options: opts }],
          okText: '确定',
          onOk: function (v) {
            if (ROOM_TYPES[v.type]) { r.type = v.type; renderRooms(); renderNeeds(); genPoints(true); }
          }
        });
      };
      tr.querySelector('[data-del]').onclick = function () {
        S.rooms = S.rooms.filter(function (x) { return x.uid !== r.uid; });
        delete S.rNeeds[r.uid];
        S.points = S.points.filter(function (p) { return p.roomKey !== r.uid; });
        renderRooms(); renderNeeds();
      };
      tb.appendChild(tr);
    });
    /* 房间清单变了，同步刷新第 7 页「从房间清单带入」那一块的提示和预览 */
    if (typeof swRenderSrcInfo === 'function') {
      try {
        swRenderSrcInfo();
        var pb = $('swPullPlan');
        if (pb && pb.style.display && pb.style.display !== 'none') swRenderPlan();
      } catch (e) { /* 首次启动时元素还没建好，忽略 */ }
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* =========================================================
     2. 需求
     ========================================================= */
  var TIER_TEXT = {
    1: '入门刚需', 2: '标准舒适', 3: '进阶享受', 0: '自定义（全出）'
  };
  /* 点位档次标签：表示「这个点位从哪一档开始纳入」。
     T1 是每个方案都有的基础项，T2/T3 才是升级才多出来的，所以用颜色把它们挑出来。 */
  var TIER_TAG = {
    1: ['入门', '#667788', '#f1f3f6'],
    2: ['标准', '#1a56db', '#e8efff'],
    3: ['进阶', '#c2410c', '#ffefe4']
  };
  function tierTag(t) {
    var d = TIER_TAG[t] || TIER_TAG[1];
    return '<span class="tier-tag" style="color:' + d[1] + ';background:' + d[2] +
      '" title="该点位从「' + d[0] + '」档开始纳入：' +
      (t === 1 ? '入门档就有（基础项）' : '选「' + TIER_TEXT[t] + '」及以上才加') + '">' + d[0] + '</span>';
  }

  function renderNeeds() {
    if (!S.rooms.length) {
      $('needGroups').innerHTML = '<div class="empty">先在「户型与图纸」选个模板或加几个房间。</div>';
      return;
    }
    var html = '';

    /* 全屋级 */
    html += '<div class="need-group"><h4>全屋级 <span class="tag">只算一次</span>' +
      '<span class="tag" style="margin-left:auto">网关/网络/语音/面板</span></h4><div class="need-list">' +
      NEEDS['*'].map(function (n) {
        return chip(n, S.gNeeds.indexOf(n.id) >= 0, 'g', n.id);
      }).join('') + '</div></div>';

    /* 房间级 */
    S.rooms.forEach(function (r) {
      var list = NEEDS[r.type] || NEEDS.other;
      var on = S.rNeeds[r.uid] || [];
      html += '<div class="need-group"><h4>' + (ROOM_TYPES[r.type] || {}).icon + ' ' + esc(r.name) +
        ' <span class="tag">' + (TRACKS[r.track || 'none'] || TRACKS.none).short + '</span>' +
        '<button class="btn sm" style="margin-left:auto" data-allr="' + r.uid + '">全选</button></h4>' +
        '<div class="need-list">' + list.map(function (n) {
          return chip(n, on.indexOf(n.id) >= 0, 'r', n.id, r.uid);
        }).join('') + '</div></div>';
    });

    $('needGroups').innerHTML = html;

    $('needGroups').querySelectorAll('.chip').forEach(function (c) {
      c.onclick = function () {
        var t = c.dataset.t, id = c.dataset.id;
        if (t === 'g') {
          var i = S.gNeeds.indexOf(id); if (i >= 0) S.gNeeds.splice(i, 1); else S.gNeeds.push(id);
        } else {
          var a = S.rNeeds[c.dataset.rk] || (S.rNeeds[c.dataset.rk] = []);
          var j = a.indexOf(id); if (j >= 0) a.splice(j, 1); else a.push(id);
        }
        c.classList.toggle('on');
        autoGen();
      };
    });
    $('needGroups').querySelectorAll('[data-allr]').forEach(function (b) {
      b.onclick = function () {
        var rk = b.dataset.allr, list = NEEDS[S.rooms.filter(function (x) { return x.uid === rk; })[0].type] || NEEDS.other;
        var a = S.rNeeds[rk] || (S.rNeeds[rk] = []);
        list.forEach(function (n) { if (a.indexOf(n.id) < 0) a.push(n.id); });
        renderNeeds(); autoGen();
      };
    });
  }
  function chip(n, on, t, id, rk) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-t="' + t + '" data-id="' + id + '"' + (rk ? ' data-rk="' + rk + '"' : '') + '>' +
      n.name + '<span class="d">' + (n.desc || '') + '</span></button>';
  }

  /* =========================================================
     3. 点位生成
     ========================================================= */
  function autoGen() { genPoints(true); }

  function genPoints(keep) {
    if (!S.rooms.length) { S.points = []; renderPoints(); return; }

    /* 保留旧价格/备注：key = tplId|roomKey */
    var old = {};
    if (keep) S.points.forEach(function (p) { old[p.key] = p; });

    var out = [];
    /* 全屋级 */
    S.gNeeds.forEach(function (nid) {
      TEMPLATES.filter(function (t) { return t.room === '*' && t.need === nid; }).forEach(function (t) {
        var key = t.id + '|G';
        var o = old[key] || null;
        out.push(pointObj(t, 'G', '全屋', 1, o, key));
      });
    });
    /* 房间级 */
    S.rooms.forEach(function (r) {
      var arr = S.rNeeds[r.uid] || [];
      var list = TEMPLATES.filter(function (t) { return t.room === r.type && arr.indexOf(t.need) >= 0; });

      /* 房间清单里填了开关/传感器数量 → 这两类点位以填的数为准。
         原来按需求勾出来的「主灯点位 / 存在传感器 / 温湿度」这些通用项收起来，
         换成一条明确按数量出的点位；专业面板（睡眠面板、背景音乐等）不受影响。 */
      /* 两类通用项分开收拢：只填传感器不会误删开关面板点位，只填开关也不会误删传感器 */
      var swN = Math.max(0, parseInt(r.sw, 10) || 0);
      var snN = Math.max(0, parseInt(r.sn, 10) || 0);
      var isSwitchDev = function (dev) {
        return dev === 'panel' || dev === 'panel_zero' || dev === 'panel_live' || dev === 'dimmer';
      };
      var isSensorDev = function (dev) {
        return dev === 'presence' || dev === 'th';
      };

      if (swN > 0) {
        list = list.filter(function (t) { return !isSwitchDev(t.dev); });
        out.push(pointObj({
          id: 'sw_' + r.uid, room: r.type, need: 'x_sw', tier: 1,
          name: r.name + ' 智能开关面板', dev: 'panel', src: 'z1',
          devAlt: ['panel', 'panel_zero', 'panel_live'], note: '按房间清单所填数量'
        }, r.uid, r.name, swN, old['sw_' + r.uid] || null, 'sw_' + r.uid));
      }
      if (snN > 0) {
        list = list.filter(function (t) { return !isSensorDev(t.dev); });
        out.push(pointObj({
          id: 'sn_' + r.uid, room: r.type, need: 'x_sn', tier: 2,
          name: r.name + ' 传感器', dev: 'presence', src: 'aqara',
          devAlt: ['presence', 'th'], note: '按房间清单所填数量'
        }, r.uid, r.name, snN, old['sn_' + r.uid] || null, 'sn_' + r.uid));
      }

      list.forEach(function (t) {
        var qty = safeQty(t.qty, r);
        if (!qty || qty <= 0) return;
        var key = t.id + '|' + r.uid;
        var o = old[key] || null;
        out.push(pointObj(t, r.uid, r.name, qty, o, key));
      });
    });
    S.points = out;
    renderPoints();
  }

  function safeQty(fn, r) {
    try { return Math.max(0, Math.round(parseFloat(fn(r)) || 0)); } catch (e) { return 0; }
  }

  function pointObj(t, roomKey, roomName, qty, o, key) {
    /* 窗帘这类点位按房间轨道选型号：双轨走罗马杆，单轨走普通电机 */
    var devCat = t.dev;
    if (t.devFn) {
      try { devCat = t.devFn(roomsByKey(roomKey)) || t.dev; } catch (e) { devCat = t.dev; }
    }
    var p = pickProducts([devCat], t.src, t.w, t.must)[0] || null;
    if (o && o.prodKey) {
      var kept = findProd(o.prodKey);
      if (kept) p = kept;
    }
    var price = (o && o.price != null) ? o.price : (p ? getPrice(prodKey(p), p.price) : 0);
    return {
      key: key, id: uid('pt'), roomKey: roomKey, roomName: roomName,
      name: (o && o.name) ? o.name : t.name,
      tier: t.tier, devCat: devCat, src: t.src || '', note: (o && o.note != null) ? o.note : (t.note || ''),
      prodKey: p ? prodKey(p) : null, price: price, qty: qty, _tplId: t.id,
      checked: (S.tier === 0 || t.tier <= S.tier)
    };
  }

  /* 按 roomKey 找房间（全屋级传 'G' 返回 null，devFn 拿不到就走默认型号） */
  function roomsByKey(roomKey) {
    if (!roomKey || roomKey === 'G') return {};
    for (var i = 0; i < S.rooms.length; i++) if (S.rooms[i].uid === roomKey) return S.rooms[i];
    return {};
  }
  function findDev(sel) { return findProd(sel); }

  function renderPoints() {
    var box = $('pointTable');
    if (!S.points.length) {
      box.innerHTML = '<div class="empty">还没有点位。去第 2 步勾几个需求，这里会自动排出来。</div>';
      renderSum(); renderInvoice(); return;
    }
    var html = '<div class="tbl-wrap"><table class="pts"><thead><tr>' +
      '<th style="width:120px">区域</th>' +
      '<th style="width:42px" title="勾上＝纳入本方案；取消＝不报价、不出图、不进面板草图">纳入</th>' +
      '<th>点位名称</th>' +
      '<th style="width:300px">产品（点「换」从产品库选）</th><th style="width:100px">单价</th>' +
      '<th style="width:70px">数量</th><th style="width:100px">小计</th><th style="width:180px">备注</th><th style="width:52px"></th>' +
      '</tr></thead><tbody>';
    var lastRoom = '';
    S.points.forEach(function (p, i) {
      if (p.roomName !== lastRoom) {
        html += '<tr class="room-sep"><td colspan="9">' + esc(p.roomName) + '</td></tr>';
        lastRoom = p.roomName;
      }
      var pr = findProd(p.prodKey);
      var prodCell = pr
        ? '<button class="btn sm pick" data-pick="' + esc(p.key) + '" style="text-align:left;width:270px">' +
          '<span style="color:var(--muted)">[' + esc(pr.src) + ']</span> ' + esc(pr.type) +
          (pr.name ? ' <span style="color:var(--muted)">/' + esc(pr.name) + '</span>' : '') +
          '<br><span style="color:#0f9d58;font-weight:600">¥' + fmt(pr.price) + '</span>' +
          (pr.spec ? ' <span style="color:var(--muted);font-size:11px">' + esc(pr.spec.slice(0, 22)) + '…</span>' : '') +
          '</button>'
        : (devOptions(p).length
            ? '<button class="btn sm pick" data-pick="' + esc(p.key) + '">选产品…</button>'
            : '<button class="btn sm pick miss" data-pick="' + esc(p.key) + '">⚠ 产品库缺货，点这里补</button>');
      html += '<tr data-k="' + p.key + '"' + (p.checked === false ? ' class="unchecked"' : '') + '>' +
        '<td style="font-size:12px;color:var(--muted)">' + esc(p.roomName) + '</td>' +
        '<td class="ctr"><input type="checkbox" data-chk ' + (p.checked !== false ? 'checked' : '') + '></td>' +
        '<td><input type="text" data-f="name" class="w100" value="' + esc(p.name) + '" style="width:170px"></td>' +
        '<td>' + prodCell + '</td>' +
        '<td class="price-cell"><input type="number" data-f="price" value="' + (p.price || 0) + '" step="1" min="0"></td>' +
        '<td class="qty-cell"><input type="number" data-f="qty" value="' + p.qty + '" min="0"></td>' +
        '<td class="sub-cell">' + fmt(p.price * p.qty) + '</td>' +
        '<td><input type="text" data-f="note" value="' + esc(p.note || '') + '" style="width:170px"></td>' +
        '<td class="del-cell"><button data-delp="' + p.key + '">删</button></td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;

    box.querySelectorAll('[data-f]').forEach(function (el) {
      var row = el.closest('tr');
      function apply(f) {
        var p = S.points.filter(function (x) { return x.key === row.dataset.k; })[0];
        if (!p) return null;
        if (f === 'price') { p.price = parseFloat(el.value) || 0; var pk = findProd(p.prodKey); if (pk) setPrice(prodKey(pk), p.price); }
        else if (f === 'qty') p.qty = Math.max(0, parseInt(el.value) || 0);
        else if (f === 'note') p.note = el.value;
        else if (f === 'name') p.name = el.value;
        return p;
      }
      /* 输入过程：只更新本行小计 + 汇总，不重建表格（避免丢焦点） */
      el.oninput = function () {
        var p = apply(el.dataset.f);
        if (!p) return;
        if (el.dataset.f === 'price' || el.dataset.f === 'qty') {
          var sub = row.querySelector('.sub-cell');
          if (sub) sub.textContent = fmt(p.price * p.qty);
        }
        renderSum(); renderInvoice();
      };
      /* 失焦后统一重建一次，保证下拉/表格与数据一致 */
      el.onchange = function () { apply(el.dataset.f); renderPoints(); };
    });
    /* 纳入勾选：决定该点位是否报价 / 出图 / 进面板草图 */
    box.querySelectorAll('[data-chk]').forEach(function (cb) {
      cb.onchange = function () {
        var row = cb.closest('tr');
        var p = S.points.filter(function (x) { return x.key === row.dataset.k; })[0];
        if (!p) return;
        p.checked = cb.checked;
        row.classList.toggle('unchecked', !cb.checked);
        try { persistSaved(); } catch (err) {}
        renderSum(); renderInvoice(); renderPlan(); renderPanels(); renderSpend();
      };
    });
    box.querySelectorAll('[data-delp]').forEach(function (b) {
      b.onclick = function () {
        S.points = S.points.filter(function (x) { return x.key !== b.dataset.delp; });
        renderPoints();
      };
    });
    /* 点产品 → 弹出搜索面板选产品 */
    box.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onclick = function () { openPicker(b.dataset.pick); };
    });
    renderSum(); renderInvoice(); renderPlan(); renderPanels();
  }

  /* =========================================================
     产品选择器（搜索面板）
     ========================================================= */
  var picker = { pointKey: null, base: [] };
  function openPicker(pointKey) {
    var p = S.points.filter(function (x) { return x.key === pointKey; })[0];
    if (!p) return;
    var tpl = TEMPLATES.filter(function (t) { return t.id === p._tplId; })[0];
    var keys = (tpl && tpl.devAlt && tpl.devAlt.length) ? tpl.devAlt : [tpl ? tpl.dev : p.devCat];
    picker.pointKey = pointKey;
    picker.base = pickProducts(keys, tpl ? tpl.src : '', tpl ? tpl.w : '');

    var srcs = {};
    picker.base.forEach(function (x) { srcs[x.src] = 1; });
    var srcList = Object.keys(srcs).sort(function (a, b) { return srcRank(a === a ? { src: a } : 0) - srcRank({ src: b }); });

    $('pickTitle').textContent = '为点位「' + p.name + '」选产品';
    $('pickInfo').textContent = '共 ' + picker.base.length + ' 款可选产品（来自你的产品库）';
    $('pickSearch').value = '';
    $('pickSrc').innerHTML = '<option value="">全部来源</option>' +
      srcList.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
    renderPickerList('');
    $('mask').classList.add('show');
    setTimeout(function () { $('pickSearch').focus(); }, 60);
  }
  function renderPickerList(kw) {
    kw = (kw || '').trim().toLowerCase();
    var src = $('pickSrc').value;
    var cur = S.points.filter(function (x) { return x.key === picker.pointKey; })[0];
    var curKey = cur ? cur.prodKey : null;
    var list = picker.base.filter(function (p) {
      if (src && p.src !== src) return false;
      if (!kw) return true;
      return (p.type + ' ' + p.name + ' ' + p.spec + ' ' + p.src).toLowerCase().indexOf(kw) >= 0;
    }).slice(0, 200);
    $('pickList').innerHTML = list.length ? list.map(function (p) {
      var on = prodKey(p) === curKey;
      return '<div class="pick-item' + (on ? ' on' : '') + '" data-prod="' + esc(prodKey(p)) + '">' +
        '<div class="t">' + esc(p.type) + (p.name ? ' <span class="nm">' + esc(p.name) + '</span>' : '') + '</div>' +
        '<div class="s">[' + esc(p.src) + '] ' + esc((p.spec || '').slice(0, 40)) +
        (p.unit && p.unit !== '个' ? ' · 单位：' + esc(p.unit) : '') + '</div>' +
        '<div class="p">¥' + fmt(p.price) + (on ? ' · 当前' : '') + '</div></div>';
    }).join('') : '<div class="empty">没找到，换个关键词</div>';

    $('pickList').querySelectorAll('[data-prod]').forEach(function (d) {
      d.onclick = function () {
        var pr = findProd(d.dataset.prod);
        if (!pr) return;
        var pt = S.points.filter(function (x) { return x.key === picker.pointKey; })[0];
        if (pt) { pt.prodKey = prodKey(pr); pt.price = getPrice(prodKey(pr), pr.price); }
        closePicker(); renderPoints();
      };
    });
  }
  function closePicker() { $('mask').classList.remove('show'); }

  /* ---------- 汇总 ---------- */
  function sumPoints(list) {
    var total = 0, cnt = 0, rows = 0;
    list.forEach(function (p) { total += p.price * p.qty; cnt += p.qty; rows++; });
    return { total: total, cnt: cnt, rows: rows };
  }
  function curPoints() { return S.points.filter(function (p) { return p.checked !== false; }); }

  /* 计算某一档次的总价（沿用当前价格，用于三档对比） */
  function calcTier(tier) {
    var old = {}; S.points.forEach(function (p) { old[p.key] = p; });
    var list = [];
    S.gNeeds.forEach(function (nid) {
      TEMPLATES.filter(function (t) { return t.room === '*' && t.need === nid && (tier > 0 ? t.tier <= tier : true); })
        .forEach(function (t) { list.push(pointObj(t, 'G', '全屋', 1, old[t.id + '|G'], t.id + '|G')); });
    });
    S.rooms.forEach(function (r) {
      var arr = S.rNeeds[r.uid] || [];
      TEMPLATES.filter(function (t) { return t.room === r.type && arr.indexOf(t.need) >= 0 && (tier > 0 ? t.tier <= tier : true); })
        .forEach(function (t) {
          var qty = safeQty(t.qty, r); if (!qty) return;
          list.push(pointObj(t, r.uid, r.name, qty, old[t.id + '|' + r.uid], t.id + '|' + r.uid));
        });
    });
    return sumPoints(list);
  }

  function renderSum() {
    var s = sumPoints(curPoints());
    var install = parseFloat($('installFee').value) || 0;
    var extra = parseFloat($('extraFee').value) || 0;
    var html = '';
    html += '<div class="sum-box" style="background:#FFF1E6;border-color:#ffd9b8"><div class="k">已选设备合计</div><div class="v" style="color:#C2410C">¥' + fmt0(s.total) + '</div>' +
      '<div class="n">' + s.rows + ' 类 · ' + s.cnt + ' 件（候选 ' + S.points.length + ' 个）</div></div>';
    html += '<div class="sum-box"><div class="k">安装调试 + 其他</div><div class="v">¥' + fmt0(install + extra) + '</div>' +
      '<div class="n">安装 ¥' + fmt0(install) + ' / 其他 ¥' + fmt0(extra) + '</div></div>';
    html += '<div class="sum-box" style="background:#FFF1E6;border-color:#ffd9b8"><div class="k">客户总价（设备+安装+其他）</div>' +
      '<div class="v" style="color:#C2410C">¥' + fmt0(s.total + install + extra) + '</div>' +
      '<div class="n">均价约 ¥' + fmt0((s.total + install + extra) / Math.max(1, S.rooms.length || 1)) + ' / 空间</div></div>';

    /* 分区域小计 */
    var byRoom = {};
    curPoints().forEach(function (p) { byRoom[p.roomName] = (byRoom[p.roomName] || 0) + p.price * p.qty; });
    if (Object.keys(byRoom).length) {
      html += '<div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">' +
        Object.keys(byRoom).map(function (k) {
          return '<div class="sum-box" style="min-width:120px"><div class="k">' + esc(k) + '</div><div class="v" style="font-size:16px">¥' + fmt0(byRoom[k]) + '</div></div>';
        }).join('') + '</div>';
    }
    $('sumBox').innerHTML = html;
  }

  /* =========================================================
     4. 报价单
     ========================================================= */
  function renderInvoice() {
    var box = $('invoice');
    var s = sumPoints(curPoints());
    var install = parseFloat($('installFee').value) || 0;
    var extra = parseFloat($('extraFee').value) || 0;
    var grand = s.total + install + extra;
    var date = $('quoteDate').value || today();

    if (!curPoints().length) {
      box.innerHTML = '<div class="empty">还没有设备清单，先去第 3 步生成点位。</div>';
      return;
    }

    var html = '<h2>智 能 方 案 报 价 单</h2>' +
      '<div class="meta"><span><b>方案：</b>' + esc(S.projectName || '未命名方案') + '</span>' +
      '<span><b>日期：</b>' + esc(date) + '</span><span><b>方案档：</b>自选（已勾选 ' + s.rows + ' 类）</span></div>';

    /* 列序与导出的 Excel 报价清单保持一致 */
    html += '<table><thead><tr><th style="width:34px">序</th><th style="width:70px">区域</th>' +
      '<th style="width:150px">设备类型</th><th style="width:130px">设备型号</th><th>作用</th>' +
      '<th style="width:44px">数量</th><th class="right" style="width:82px">单价</th>' +
      '<th class="right" style="width:96px">小计</th></tr></thead><tbody>';

    var no = 0, lastRoom = '';
    curPoints().forEach(function (p) {
      if (p.roomName !== lastRoom) {
        var sub = 0; curPoints().forEach(function (x) { if (x.roomName === p.roomName) sub += x.price * x.qty; });
        html += '<tr class="sec-title"><td colspan="7">' + esc(p.roomName) +
          '　小计：¥' + fmt(sub) + '</td><td class="right"></td></tr>';
        lastRoom = p.roomName;
      }
      no++;
      var pr = findProd(p.prodKey);
      html += '<tr><td>' + no + '</td><td>' + esc(p.roomName) + '</td>' +
        '<td>' + esc(pr ? (CAT_CN[pr.cat] || pr.type) : '—') + '</td>' +
        '<td>' + esc(pr ? (pr.name || pr.type) : '—') + '</td>' +
        '<td style="color:var(--muted)">' + esc((pr && pr.spec) || '') + '</td>' +
        '<td>' + p.qty + '</td><td class="right">' + fmt(p.price) + '</td>' +
        '<td class="right">' + fmt(p.price * p.qty) + '</td></tr>';
    });
    html += '</tbody></table>';

    html += '<table style="margin-top:14px"><tbody>' +
      '<tr><td style="width:70%">设备材料合计</td><td class="right">¥' + fmt(s.total) + '</td></tr>' +
      '<tr><td>安装调试费（含上门、布线指导、场景配置、交付培训）</td><td class="right">¥' + fmt(install) + '</td></tr>' +
      '<tr><td>其他费用</td><td class="right">¥' + fmt(extra) + '</td></tr>' +
      '<tr class="total"><td>合　计</td><td class="right" style="color:#C2410C">¥' + fmt(grand) + '</td></tr>' +
      '</tbody></table>';

    var wireTxt = { zero: '客户家已确认有零火线', single: '老房单火线，全部走凌动/免改线方案', unknown: '线路情况待现场确认' }[S.wire] || '';
    html += '<div class="notes"><b>说明</b><ul>' +
      '<li>本报价含设备材料、安装调试与场景配置，上门时间与施工条件另议。</li>' +
      '<li>' + wireTxt + '；点位以现场复尺为准，如与现场不符，我这边免费出增补方案。</li>' +
      '<li>以上为设备单价参考，实际按下单当日品牌活动价结算。</li>' +
      '<li>质保：主机一年，面板与灯具按品牌质保，免费上门调试两次。</li>' +
      '</ul><div style="text-align:right;margin-top:10px">设计：智装点位通 · ' + esc(date) + '</div></div>';

    /* ---------- 三档套餐对比（同一套点位按不同档次算总价，供客户横向比） ---------- */
    var t1 = calcTier(1), t2 = calcTier(2), t3 = calcTier(3);
    html += '<h2 style="margin-top:26px;font-size:16px;letter-spacing:1px">三 档 方 案 对 比</h2>' +
      '<div class="tier-cmp">' +
      '<table><thead><tr>' +
      '<th style="width:120px">档位</th><th class="right">设备合计</th>' +
      '<th class="right">类/ 件</th><th class="right">加安装后总价</th><th>主要差在哪</th>' +
      '</tr></thead><tbody>' +
      '<tr><td><b>① 入门刚需</b></td>' +
      '<td class="right">¥' + fmt(t1.total) + '</td>' +
      '<td class="right">' + t1.rows + ' / ' + t1.cnt + '</td>' +
      '<td class="right">¥' + fmt(t1.total + install + extra) + '</td>' +
      '<td>只做开关灯控 + 门锁 + 主窗帘，能用、不能爽</td></tr>' +
      '<tr class="on"><td><b>② 标准舒适</b></td>' +
      '<td class="right">¥' + fmt(t2.total) + '</td>' +
      '<td class="right">' + t2.rows + ' / ' + t2.cnt + '</td>' +
      '<td class="right">¥' + fmt(t2.total + install + extra) + '</td>' +
      '<td>加全屋面板、毫米波、起夜灯、烟感、环境感知</td></tr>' +
      '<tr><td><b>③ 进阶享受</b></td>' +
      '<td class="right">¥' + fmt(t3.total) + '</td>' +
      '<td class="right">' + t3.rows + ' / ' + t3.cnt + '</td>' +
      '<td class="right">¥' + fmt(t3.total + install + extra) + '</td>' +
      '<td>再加摄像头、氛围灯带、背景音乐、影音</td></tr>' +
      '</tbody></table>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.7">' +
      '三档用的是同一份点位清单，只是纳入的档次不同，所以设备型号和价格完全真实，' +
      '不做「换个便宜型号糊弄你」那套。想上哪一档，点第 2 步的档位按钮即可切。' +
      '</div></div>';

    box.innerHTML = html;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* =========================================================
     导出
     ========================================================= */
  /* 加载一张产品图 → 96×96 白底 PNG（canvas 重编码，嵌入 Excel） */
  function loadImgPx(url) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = 96; c.height = 96;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 96, 96);
          var sc = Math.min(96 / im.width, 96 / im.height);
          var w = im.width * sc, h = im.height * sc;
          ctx.drawImage(im, (96 - w) / 2, (96 - h) / 2, w, h);
          c.toBlob(function (b) {
            if (!b) return resolve(null);
            var fr = new FileReader();
            fr.onload = function () { resolve({ data: new Uint8Array(fr.result), ext: 'png', key: url }); };
            fr.onerror = function () { resolve(null); };
            fr.readAsArrayBuffer(b);
          }, 'image/png');
        } catch (e) { resolve(null); }
      };
      im.onerror = function () { resolve(null); };
      im.src = url;
    });
  }

  async function doXlsx() {
    if (!curPoints().length) { toast('还没有点位可导出'); return; }
    var s = sumPoints(curPoints());
    var install = parseFloat($('installFee').value) || 0;
    var extra = parseFloat($('extraFee').value) || 0;
    var grand = s.total + install + extra;
    var date = $('quoteDate').value || today();

    /* —— A4 打印版「空间智能配置表」——
       版式：标题 → 项目信息 → 表头（打印时每页重复）→ 按区域分组（区域列合并）
             → 安装调试费 → 总计；价格列写公式 =单价×数量，Excel 里改数量自动重算 */
    var rows1 = [];
    var merged1 = [], rowH1 = {};
    var CN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    rows1.push([{ v: '空间智能配置表', s: 4 }, '', '', '', '', '', '', '', '']);
    rowH1[1] = 46; merged1.push({ a: 'A1', b: 'I1' });
    rows1.push([{ v: '项目：' + (S.projectName || '未命名') + '　|　报价日期：' + date + '　|　侯哥智改 · 全屋智能设计', s: 11 }, '', '', '', '', '', '', '', '']);
    rowH1[2] = 24; merged1.push({ a: 'A2', b: 'I2' });
    rows1.push(['序号', '区域', '产品名称', '作用 / 说明', '单价', '数量', '价格', '图片', '备注'].map(function (w) { return { v: w, s: 5 }; }));
    rowH1[3] = 28;

    /* 按区域分组（保持房间首次出现顺序），区域列纵向合并 */
    var groups = [], gIdx = {};
    curPoints().forEach(function (p) {
      if (gIdx[p.roomName] === undefined) { gIdx[p.roomName] = groups.length; groups.push({ name: p.roomName, items: [] }); }
      groups[gIdx[p.roomName]].items.push(p);
    });

    var no = 0, firstRow = 4, r = 4;
    var imgJobs = [];
    groups.forEach(function (g) {
      var startRow = r + 1;
      g.items.forEach(function (p) {
        no++;
        var pr = findProd(p.prodKey);
        var model = pr ? (pr.name || pr.type) : '—';
        var spec = pr ? (pr.spec || '') : '';
        var imgUrl = pr ? productImg(pr.type, pr.name || pr.type) : null;
        if (imgUrl) imgJobs.push({ url: imgUrl, row: r });
        rows1.push([
          { v: no, s: 8 },
          { v: (r + 1) === startRow ? g.name : '', s: 10 },
          { v: model, s: 6 },
          { v: spec, s: 7 },
          { v: p.price, s: 9 },
          { v: p.qty, s: 8 },
          { v: '=E' + (r + 1) + '*F' + (r + 1), s: 9 },
          { v: '', s: 8 },
          { v: p.note || '', s: 7 }
        ]);
        rowH1[r + 1] = 30;
        r++;
      });
      if (r > startRow) merged1.push({ a: 'B' + startRow, b: 'B' + r });
      lastRow = r;
    });

    var devEnd = r;
    r++;
    rows1.push([{ v: '安装调试费 + 试机费 · 辅料（设备费 × 30%）', s: 12 }, '', '', '', '', '', { v: install, s: 9 }, { v: '', s: 12 }, { v: '', s: 12 }]);
    merged1.push({ a: 'A' + r, b: 'F' + r });
    rowH1[r] = 30;
    if (extra > 0) {
      r++;
      rows1.push([{ v: '其他费用', s: 12 }, '', '', '', '', '', { v: extra, s: 9 }, { v: '', s: 12 }, { v: '', s: 12 }]);
      merged1.push({ a: 'A' + r, b: 'F' + r });
      rowH1[r] = 30;
    }
    r++;
    rows1.push([{ v: '总　计（含安装调试与辅材）', s: 13 }, '', '', '', '', '',
      { v: '=SUM(G' + firstRow + ':G' + devEnd + ')+G' + (devEnd + 1) + (extra > 0 ? '+G' + (devEnd + 2) : ''), s: 14 },
      { v: '', s: 13 }, { v: '', s: 13 }]);
    merged1.push({ a: 'A' + r, b: 'F' + r });
    rowH1[r] = 36;

    var t1 = calcTier(1), t2 = calcTier(2), t3 = calcTier(3);
    var rows2 = [
      ['方案名称', S.projectName || '未命名方案', '报价日期', date],
      ['方案档', '自选（已勾选 ' + s.rows + ' 类）', '设备件数', s.cnt + ' 件 / ' + s.rows + ' 类'],
      ['空间数', S.rooms.length + ' 个', '窗帘电机', S.rooms.reduce(function (a, r) { return a + curtainQty(r); }, 0) + ' 台'],
      ['电路条件', { zero: '有零火线', single: '单火线老房', unknown: '待确认' }[S.wire] || '待确认', '', ''],
      [],
      ['客户要求', S.note || '—', '', ''],
      [],
      ['三档方案对比（同一点位清单，按档次纳入）', '', '', ''],
      ['档位', '设备合计', '类/件', '加安装后总价', '主要差别'],
      ['① 入门刚需', t1.total, t1.rows + ' / ' + t1.cnt, t1.total + install + extra, '只做开关灯控 + 门锁 + 主窗帘'],
      ['② 标准舒适', t2.total, t2.rows + ' / ' + t2.cnt, t2.total + install + extra, '加全屋面板、毫米波、起夜灯、烟感、环境'],
      ['③ 进阶享受', t3.total, t3.rows + ' / ' + t3.cnt, t3.total + install + extra, '再加摄像头、氛围灯带、背景音乐'],
      [],
      ['房间清单', '', '', ''],
      ['房间', '窗帘轨道', '电机台数', '备注']
    ];
    S.rooms.forEach(function (r) {
      var tk = r.track || 'none';
      rows2.push([r.name, (TRACKS[tk] || TRACKS.none).name, curtainQty(r) || '', r.note || '']);
    });
    rows2.push(['合计','', S.rooms.reduce(function (a, r) { return a + curtainQty(r); }, 0), '']);

    var sheet1 = {
      name: '报价清单', widths: [5.5, 9, 24, 34, 9.5, 6, 11, 7, 14],
      rows: rows1, merged: merged1, rowHeights: rowH1,
      freeze: 3, page: { repeatRows: '3:3' }
    };
    /* 嵌产品图：并行加载（每张缩成 36×36 白底），加载失败的自动跳过不阻断导出 */
    if (imgJobs.length) {
      var loaded = await Promise.all(imgJobs.map(function (j) { return loadImgPx(j.url); }));
      var images = [];
      loaded.forEach(function (res, k) {
        if (res) images.push({ row: imgJobs[k].row - 1, col: 7, data: res.data, w: 36, h: 36, ext: 'png', key: imgJobs[k].url });
      });
      if (images.length) sheet1.images = images;
      toast(images.length ? ('已配 ' + images.length + ' 张产品图') : '未匹配到产品图，仅导出表格');
    }

    var sheets = [
      sheet1,
      { name: '汇总与档位对比', rows: rows2, widths: [16, 18, 16, 30] },
      {
        name: '产品库', widths: [14, 30, 22, 50, 10, 7],
        rows: [['来源', '设备类型', '型号', '作用/参数', '单价', '单位']].concat(LIB.map(function (d) {
          return [d.src, d.type, d.name || '', d.spec || '', d.price, d.unit || '个'];
        }))
      }
    ];

    try {
      var parts = XLSX_UTIL.build(sheets);
      XLSX_UTIL.download(parts, (S.projectName || '智能方案报价') + '.xlsx');
      toast('Excel 已导出');
    } catch (e) { toast('导出失败：' + e.message); }
  }

  /* =========================================================
     保存 / 读取
     ========================================================= */
  function collect() {
    S.projectName = $('projectName').value;
    S.wire = $('wireType').value;
    S.note = $('customerNote').value;
    S.installFee = parseFloat($('installFee').value) || 0;
    S.extraFee = parseFloat($('extraFee').value) || 0;
    S.date = $('quoteDate').value;
    return S;
  }
  function persistSaved() {
    collect();
    var arr = JSON.parse(localStorage.getItem('zd_saved') || '[]');
    arr = arr.filter(function (x) { return x.name !== S.projectName; });
    arr.unshift({ name: S.projectName || '未命名', time: new Date().toLocaleString('zh-CN'), data: JSON.parse(JSON.stringify(S)) });
    localStorage.setItem('zd_saved', JSON.stringify(arr.slice(0, 30)));
  }
  function save() {
    try { persistSaved(); toast('已保存：' + (S.projectName || '未命名')); }
    catch (e) { toast('保存失败：' + e.message); }
  }
  function loadDialog() {
    collect();
    try {
      var arr = JSON.parse(localStorage.getItem('zd_saved') || '[]');
      if (!arr.length) { toast('还没有存过方案'); return; }
      var html = '<div style="max-height:320px;overflow:auto"><table style="width:100%">';
      arr.forEach(function (x, i) {
        html += '<tr><td style="padding:8px;border-bottom:1px solid #eee">' + esc(x.name) + '<br><span style="color:#888;font-size:12px">' + x.time + '</span></td>' +
          '<td style="white-space:nowrap"><button class="btn sm" data-ok="' + i + '">打开</button> ' +
          '<button class="btn sm danger" data-del="' + i + '">删</button></td></tr>';
      });
      html += '</table></div>';
      var w = window.open('', '_blank', 'width=420,height=520');
      if (!w) { toast('浏览器拦截了窗口，请允许弹窗'); return; }
      w.document.write('<meta charset="utf-8"><title>读取方案</title><link rel="stylesheet" href="css/style.css">' +
        '<div style="max-width:420px;margin:16px"><h3>读取已保存方案</h3>' + html + '</div>');
      w.document.close();
      w.document.querySelectorAll('[data-ok]').forEach(function (b) {
        b.onclick = function () { apply(arr[+b.dataset.ok].data); w.close(); };
      });
      w.document.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          arr.splice(+b.dataset.del, 1);
          localStorage.setItem('zd_saved', JSON.stringify(arr));
          w.location.reload();
        };
      });
    } catch (e) { toast('读取失败：' + e.message); }
  }
  function apply(d) {
    S = Object.assign(S, d);
    S.markers = d.markers || [];
    $('projectName').value = S.projectName || '';
    $('wireType').value = S.wire || 'unknown';
    $('customerNote').value = S.note || '';
    $('installFee').value = S.installFee || 0;
    $('extraFee').value = S.extraFee || 0;
    $('quoteDate').value = S.date || today();
    if (S.tier) markTier(S.tier);
    renderRooms(); renderNeeds(); renderPoints();
    renderImgs(); renderMarkerList();
    toast('已打开方案：' + (S.projectName || '未命名'));
  }

  /* =========================================================
     图片
     ========================================================= */
  function handleFiles(files, kind) {
    Array.prototype.forEach.call(files, function (f) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1100, w = img.width, h = img.height;
          if (w > max) { h = Math.round(h * max / w); w = max; }
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var data = cv.toDataURL('image/jpeg', 0.72);
          var id = uid('img');
          IMG.put(id, data).then(function () {
            S.imgs.push({ id: id, kind: kind, data: data });
            renderImgs();
          });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  }
  function renderImgs() {
    var box = $('imgPreview'); box.innerHTML = '';
    /* 主图 + 标注画布 */
    if (S.imgs.length) {
      var main = document.createElement('div');
      main.className = 'draw-wrap';
      main.id = 'drawHost';
      main.innerHTML = '<img src="' + S.imgs[0].data + '"><canvas></canvas><div class="mk-layer" id="mkLayer"></div>';
      box.appendChild(main);
      /* 点击空白区域放置设备标记（仅在标注模式） */
      main.addEventListener('click', function (e) {
        if (!devMode) return;
        if (e.target.closest('.mk')) return;
        var r = main.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        addMarker(activeDevType, x, y);
      });
      renderMarkers();
    }
    S.imgs.forEach(function (g, gi) {
      var d = document.createElement('div'); d.className = 'it' + (gi === 0 ? ' active' : '');
      d.innerHTML = '<img src="' + g.data + '" title="' + (g.kind === 'plan' ? '户型图' : '效果图') + '">' +
        '<button data-delimg="' + g.id + '">×</button>';
      /* 点击缩略图 = 切换为主图（标注画布跟着换图） */
      d.querySelector('img').onclick = function () {
        if (gi === 0) return;
        S.imgs.unshift(S.imgs.splice(gi, 1)[0]);
        renderImgs();
        toast('已切换为主图：' + (g.kind === 'plan' ? '户型图' : '效果图'));
      };
      box.appendChild(d);
    });
    box.querySelectorAll('[data-delimg]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.delimg;
        S.imgs = S.imgs.filter(function (x) { return x.id !== id; });
        IMG.del(id); renderImgs();
      };
    });
  }

  /* =========================================================
     9. 平面图设备标注（开关 / 传感器 / 窗帘电机 等直接标在图上）
     ========================================================= */
  /* 按类型给每个 marker 编序号（同类型 1,2,3…），渲染与导出共用 */
  function markerNos() {
    var counts = {}, nos = {};
    S.markers.forEach(function (m) {
      counts[m.type] = (counts[m.type] || 0) + 1;
      nos[m.id] = counts[m.type];
    });
    return nos;
  }

  function renderMarkers() {
    var layer = $('mkLayer'); if (!layer) return;
    layer.innerHTML = '';
    var nos = markerNos();
    S.markers.forEach(function (m) {
      var t = DEV_TYPES[m.type] || DEV_TYPES.other;
      var el = document.createElement('div');
      el.className = 'mk mk-' + m.type;
      el.style.left = (m.x * 100) + '%';
      el.style.top = (m.y * 100) + '%';
      el.title = t.name + (m.label ? (' · ' + m.label) : '') + ' #' + nos[m.id] +
        (m.room ? (' · ' + m.room) : '');
      el.innerHTML = '<span class="mk-ic">' + t.icon + '</span><span class="mk-no">' + nos[m.id] + '</span>';
      bindMarker(el, m);
      layer.appendChild(el);
    });
  }

  function bindMarker(el, m) {
    var sx = 0, sy = 0, moved = false;
    el.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      e.preventDefault();
      sx = e.clientX; sy = e.clientY; moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!el.hasPointerCapture || !el.hasPointerCapture(e.pointerId)) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      var layer = $('mkLayer'); if (!layer) return;
      var r = layer.getBoundingClientRect();
      m.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      m.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      el.style.left = (m.x * 100) + '%';
      el.style.top = (m.y * 100) + '%';
    });
    el.addEventListener('pointerup', function (e) {
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) { try { persistSaved(); } catch (_) {} toast('已移动标记'); }
      else editMarker(m.id);
    });
  }

  function addMarker(type, x, y) {
    var m = { id: uid('mk'), type: type, x: x, y: y, label: '', room: '' };
    S.markers.push(m);
    renderMarkers(); renderMarkerList();
    try { persistSaved(); } catch (_) {}
    var t = DEV_TYPES[type] || DEV_TYPES.other;
    toast('已放置：' + t.name + '（点它可改名/指定房间/删除）');
  }

  function delMarker(id) {
    S.markers = S.markers.filter(function (x) { return x.id !== id; });
    renderMarkers(); renderMarkerList();
    try { persistSaved(); } catch (_) {}
    toast('已删除标记');
  }

  function editMarker(id) {
    var m = null;
    for (var i = 0; i < S.markers.length; i++) if (S.markers[i].id === id) { m = S.markers[i]; break; }
    if (!m) return;
    var t = DEV_TYPES[m.type] || DEV_TYPES.other;
    var roomOpts = '<option value="">（不指定）</option>' +
      S.rooms.map(function (r) { return '<option value="' + esc(r.name) + '"' +
        (r.name === m.room ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('');
    var typeOpts = DEV_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (k === m.type ? ' selected' : '') + '>' +
        DEV_TYPES[k].icon + ' ' + DEV_TYPES[k].name + '</option>';
    }).join('');
    modalBox({
      title: '编辑标记（' + t.name + '）',
      fields: [
        { key: 'label', label: '备注 / 点位说明', placeholder: '如 玄关双开、门口人体', value: m.label || '' },
        { key: 'room', label: '所在房间', type: 'select', options: roomOpts },
        { key: 'type', label: '设备类型', type: 'select', options: typeOpts }
      ],
      okText: '保存',
      onOk: function (v) {
        m.label = (v.label || '').trim();
        m.room = v.room || '';
        if (DEV_TYPES[v.type]) m.type = v.type;
        renderMarkers(); renderMarkerList();
        try { persistSaved(); } catch (_) {}
        toast('已更新标记');
      }
    });
  }

  /* 设备类型选择器与清单渲染 */
  function renderDevChips() {
    var box = $('devChips'); if (!box) return;
    box.innerHTML = DEV_ORDER.map(function (k) {
      var t = DEV_TYPES[k];
      return '<button class="dev-chip' + (k === activeDevType ? ' on' : '') + '" data-dev="' + k + '" ' +
        'style="--c:' + t.color + '">' + t.icon + ' ' + t.name + '</button>';
    }).join('');
    box.querySelectorAll('[data-dev]').forEach(function (b) {
      b.onclick = function () {
        activeDevType = b.dataset.dev;
        renderDevChips();
        if (!devMode) toggleDevMode(true);
      };
    });
  }

  function toggleDevMode(force) {
    devMode = (typeof force === 'boolean') ? force : !devMode;
    var host = $('drawHost');
    if (host) host.classList.toggle('dev-mode', devMode);
    var btn = $('btnDevMode');
    if (btn) {
      btn.classList.toggle('primary', devMode);
      btn.textContent = devMode ? '✓ 退出标注' : '📍 图上标设备';
    }
    var tip = $('devTip');
    if (tip) tip.style.display = devMode ? 'block' : 'none';
    var tn = $('devTypeName');
    if (tn) tn.textContent = DEV_TYPES[activeDevType].name;
    if (devMode) toast('标注模式：点图上任意位置放「' + (DEV_TYPES[activeDevType].name) + '」');
  }

  function renderMarkerList() {
    var box = $('markerList'); if (!box) return;
    var cnt = $('devCount');
    if (cnt) cnt.textContent = S.markers.length ? ('共 ' + S.markers.length + ' 个标注') : '';
    if (!S.markers.length) {
      box.innerHTML = '<div class="empty small">还没有标注。开「📍 图上标设备」后，点平面图上放开关、传感器、窗帘电机…</div>';
      return;
    }
    var nos = markerNos();
    var byType = {};
    DEV_ORDER.forEach(function (k) { byType[k] = []; });
    S.markers.forEach(function (m) { (byType[m.type] || (byType[m.type] = [])).push(m); });
    var html = '';
    DEV_ORDER.forEach(function (k) {
      var arr = byType[k]; if (!arr || !arr.length) return;
      var t = DEV_TYPES[k];
      html += '<div class="mk-group"><div class="mk-group-h"><span class="dot" style="background:' + t.color + '"></span>' +
        t.icon + ' ' + t.name + ' <b>' + arr.length + '</b></div>';
      arr.forEach(function (m) {
        html += '<div class="mk-row">' +
          '<span class="mk-no-sm">' + nos[m.id] + '</span>' +
          '<span class="mk-meta">' + (m.label ? esc(m.label) : '<i>未命名</i>') +
          (m.room ? ' <em>· ' + esc(m.room) + '</em>' : '') + '</span>' +
          '<button class="mk-x" data-mk="' + m.id + '">×</button></div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-mk]').forEach(function (b) {
      b.onclick = function () { delMarker(b.dataset.mk); };
    });
  }

  /* 导出标注图（把标记合成到原图，下载 PNG） */
  function exportAnnoImg() {
    if (!S.imgs.length) { toast('先上传户型图'); return; }
    if (!S.markers.length) { toast('还没有标注任何设备'); return; }
    var src = S.imgs[0].data;
    var im = new Image();
    im.onload = function () {
      var W = im.naturalWidth, H = im.naturalHeight;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      ctx.drawImage(im, 0, 0, W, H);
      var nos = markerNos();
      S.markers.forEach(function (m) {
        var t = DEV_TYPES[m.type] || DEV_TYPES.other;
        var cx = m.x * W, cy = m.y * H;
        var R = Math.max(15, Math.min(W, H) * 0.022);
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = t.color; ctx.fill();
        ctx.lineWidth = R * 0.18; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + (R * 1.05).toFixed(0) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(nos[m.id]), cx, cy);
      });
      var a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = (S.projectName || '智能标注图') + '_标注.png';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); }, 400);
      toast('标注图已导出 PNG');
    };
    im.src = src;
  }

  /* 导出标注清单（CSV） */
  function exportAnnoList() {
    if (!S.markers.length) { toast('还没有标注任何设备'); return; }
    var nos = markerNos();
    var rows = [['序号', '类型', '说明', '房间', 'X比例', 'Y比例']];
    S.markers.forEach(function (m) {
      var t = DEV_TYPES[m.type] || DEV_TYPES.other;
      rows.push([nos[m.id], t.name, m.label || '', m.room || '', m.x.toFixed(3), m.y.toFixed(3)]);
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }
    ).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.projectName || '智能标注清单') + '_标注清单.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 400);
    toast('标注清单已导出 CSV');
  }

  /* =========================================================
     事件
     ========================================================= */
  function bind() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        $('' + t.dataset.tab).classList.add('active');
        if (t.dataset.tab === 'p3') renderSum();
        if (t.dataset.tab === 'p4') renderInvoice();
        if (t.dataset.tab === 'p5') { renderLibStat(); renderLibTable($('libSearch').value); }
        if (t.dataset.tab === 'p6') renderSpend();
        if (t.dataset.tab === 'p7' || t.dataset.tab === 'p8') { swInit(); swRenderTables(); swRenderLightTable(); swRenderStats(); swRenderStripLines(); }
        if (t.dataset.tab === 'p1') { renderMarkers(); renderMarkerList(); }
      };
    });

    $('projectName').value = '';
    $('quoteDate').value = today();

    $('wireType').onchange = function () { S.wire = this.value; };
    $('customerNote').oninput = function () { S.note = this.value; };
    $('installFee').oninput = function () { renderSum(); renderInvoice(); };
    $('extraFee').oninput = function () { renderSum(); renderInvoice(); };
    $('quoteDate').onchange = function () { renderInvoice(); };

    $('btnAddRoom').onclick = function () {
      S.rooms.push({ uid: uid('r'), type: 'living', name: '新房间', area: 15, windows: 1, note: '', track: 'none', sw: 1, sn: 0, peri: 0 });
      renderRooms(); renderNeeds();
    };
    $('btnAiRoom').onclick = openAiRoom;

    $('btnPlan').onclick = renderPlan;
    $('btnPlanSave').onclick = savePlanSvg;
    $('btnPlanReset').onclick = function () {
      if (!S.planDrag || !Object.keys(S.planDrag).length) { toast('没有手动调整过位置'); return; }
      modalBox({
        title: '恢复自动排布？', fields: [],
        okText: '确认恢复', cancelText: '取消',
        onOk: function () {
          S.planDrag = {};
          try { persistSaved(); } catch (e) { }
          renderPlan();
          toast('已恢复自动排布');
        }
      });
    };

    $('btnPanel').onclick = renderPanels;
    $('btnPanelSave').onclick = savePanelSvg;

    $('aiClose').onclick = closeAiRoom;
    $('aiMask').onclick = function (e) { if (e.target === $('aiMask')) closeAiRoom(); };
    $('aiProv').onchange = function () {
      var p = VISION.PROVIDERS[this.value];
      if (!p) return;
      $('aiUrl').value = p.url;
      $('aiModel').value = p.model;
      $('aiProvTip').textContent = p.name + '：' + p.tip + '，单次 ' + p.cost;
      saveVisionCfg();
    };
    ['aiKey', 'aiUrl', 'aiModel'].forEach(function (k) {
      $(k).oninput = saveVisionCfg;
    });
    $('aiRun').onclick = runAiRoom;
    $('aiApply').onclick = applyAiRooms;

    $('btnReGen').onclick = function () { collect(); genPoints(true); toast('已按当前需求重新排点位'); };
    $('btnClearPts').onclick = function () {
      modalBox({
        title: '清空全部点位？', fields: [],
        okText: '确认清空', cancelText: '取消',
        onOk: function () { S.points = []; renderPoints(); toast('已清空全部点位'); }
      });
    };
    $('btnAddPoint').onclick = function () {
      modalBox({
        title: '手动加点位',
        fields: [
          { key: 'rn', label: '点位名称', placeholder: '如 阳台壁灯' },
          { key: 'rk', label: '所在房间', placeholder: '现有房间：' + (S.rooms.map(function (r) { return r.name; }).join('、') || '（暂未标房间）') }
        ],
        okText: '添加',
        onOk: function (v) {
          var rn = (v.rn || '').trim(); if (!rn) { toast('点位名称不能为空'); return; }
          var rk = (v.rk || '').trim();
          var r = S.rooms.filter(function (x) { return x.name === rk; })[0];
          S.points.push({
            key: uid('mp'), id: uid('pt'), roomKey: r ? r.uid : 'G', roomName: r ? r.name : '全屋',
            name: rn, tier: 1, devCat: 'plug', src: 'Aqara绿米', note: '', prodKey: null, price: 0, qty: 1, checked: true, _tplId: ''
          });
          renderPoints();
          toast('已添加点位：' + rn);
        }
      });
    };

    /* 档次 */
    document.querySelectorAll('[data-tier]').forEach(function (b) {
      b.onclick = function () { markTier(+b.dataset.tier); };
    });

    /* 图片 */
    $('filePlan').onchange = function () { handleFiles(this.files, 'plan'); this.value = ''; };
    $('fileRender').onchange = function () { handleFiles(this.files, 'render'); this.value = ''; };
    $('btnDraw').onclick = function () {
      if (devMode) toggleDevMode(false);
      $('drawTip').style.display = 'block';
      $('btnDrawDone').style.display = 'inline-block';
      enableDrawing();
    };
    $('btnDrawDone').onclick = function () {
      var host = $('drawHost');
      if (host) {
        host.classList.remove('drawing');
        var cv = host.querySelector('canvas');
        if (cv) {
          cv.onmousedown = cv.onmousemove = cv.onmouseup = null;
          cv.ontouchstart = cv.ontouchmove = cv.ontouchend = null;
          var cx = cv.getContext('2d');
          if (cx) cx.clearRect(0, 0, cv.width, cv.height);
        }
      }
      $('drawTip').style.display = 'none';
      $('btnDrawDone').style.display = 'none';
      toast('标注已结束，房间已加入下方表格');
    };

    /* 平面图设备标注 */
    $('btnDevMode').onclick = function () {
      if ($('btnDrawDone').style.display !== 'none') $('btnDrawDone').click();
      toggleDevMode();
    };
    $('btnDevClear').onclick = function () {
      if (!S.markers.length) { toast('还没有标注'); return; }
      modalBox({
        title: '清空所有设备标注？', fields: [], okText: '清空', cancelText: '取消',
        onOk: function () {
          S.markers = [];
          renderMarkers(); renderMarkerList();
          try { persistSaved(); } catch (_) {}
          toast('已清空标注');
        }
      });
    };
    $('btnDevImg').onclick = exportAnnoImg;
    $('btnDevList').onclick = exportAnnoList;

    /* 产品库 */
    $('libSearch').oninput = function () { renderLibTable(this.value); };
    $('libSrc').onchange = function () { renderLibTable($('libSearch').value); };
    $('btnImportLib').onclick = function () {
      var t = $('libPaste').value;
      if (!t.trim()) { toast('先把 Excel 里的内容粘贴进来'); return; }
      var r = parsePasted(t, $('libPasteSrc').value);
      saveLib(); renderLibStat(); renderLibTable($('libSearch').value);
      $('libMsg').textContent = '已更新 ' + r.updated + ' 款，新增 ' + r.added + ' 款';
      toast('产品库已更新');
    };
    $('btnResetLib').onclick = function () {
      modalBox({
        title: '恢复到模板原价？', fields: [],
        okText: '确认恢复', cancelText: '取消',
        onOk: function () {
      LIB = (PRODUCTS || []).slice();
      try { localStorage.removeItem(EXTRA_KEY); } catch (e) { }
      renderLibStat(); renderLibTable($('libSearch').value);
      toast('已恢复内置产品价');
        }
      });
    };

    /* 花钱顺序 */
    $('btnSpendPrint').onclick = printSpend;
    $('btnSpendXlsx').onclick = doSpendXlsx;

    /* 开关快速报价 */
    swInit();
    $('swPrint').onclick = swPrint;
    $('swXlsx').onclick = swXlsx;
    if ($('ltPrint')) $('ltPrint').onclick = function () { window.print(); };
    $('swClear').onclick = function () {
      SW.recs.z1 = blankSwitchRecs('z1');
      SW.recs.x30 = blankSwitchRecs('x30');
      EXTRA_ORDER.forEach(function (id) {
        SW.extras[id] = { qty: 0, price: EXTRA_DEVICES[id].price };
        var cap = id[0].toUpperCase() + id.slice(1);
        var qtyInp = $('sw' + cap + 'Qty');
        var priceInp = $('sw' + cap + 'Price');
        if (qtyInp) qtyInp.value = 0;
        if (priceInp) priceInp.value = EXTRA_DEVICES[id].price;
      });
      swRenderTables(); swRenderStats();
      toast('数量已清空');
    };

    /* 一键清除全部：开关 + 网关/传感器/中控屏 + 窗帘 + 照明灯具，全页归零并二次确认 */
    $('swClearOneKey').onclick = function () {
      modalBox({
        title: '一键清除全部数量？',
        okText: '确认清除',
        fields: [],
        onOk: function () {
          SW.recs.z1 = blankSwitchRecs('z1');
          SW.recs.x30 = blankSwitchRecs('x30');
          EXTRA_ORDER.forEach(function (id) {
            SW.extras[id] = { qty: 0, price: EXTRA_DEVICES[id].price };
            var cap = id[0].toUpperCase() + id.slice(1);
            var qtyInp = $('sw' + cap + 'Qty');
            var priceInp = $('sw' + cap + 'Price');
            if (qtyInp) qtyInp.value = 0;
            if (priceInp) priceInp.value = EXTRA_DEVICES[id].price;
          });
          LIGHT_ORDER.forEach(function (id) {
            SW.lights[id] = { qty: 0, price: LIGHT_FIXTURES[id].price, beam: '' };
          });
          SW.curtainLines = [];
          swRenderTables();
          swRenderLightTable();
          swRenderCurtainTable();
          swRenderStats();
          toast('全部数量已清空');
        }
      });
    };

    /* 照明灯具：清空数量 / 从报价表选 */
    if ($('swLightClear')) {
      $('swLightClear').onclick = function () {
        LIGHT_ORDER.forEach(function (id) {
          SW.lights[id] = { qty: 0, price: LIGHT_FIXTURES[id].price, beam: '' };
        });
        SW.stripLines = [];
        swRenderStripLines();
        swRenderLightTable();
        swRenderStats();
        toast('灯具数量已清空');
      };
    }
    if ($('swLightPick')) {
      $('swLightPick').onclick = swOpenLightPicker;
    }
    /* 增加自定义空间（v1.21） */
    if ($('swAddRoom')) {
      $('swAddRoom').onclick = function () {
        var inp = $('swNewRoom');
        var name = (inp.value || '').trim();
        if (!name) { toast('先写个空间名'); inp.focus(); return; }
        var room = addCustomRoom(name);
        if (!room) { toast('添加失败'); return; }
        /* 给两个型号都补上这个空间的空行 */
        ['z1', 'x30'].forEach(function (mid) {
          var exist = swRec(mid, room.id, 1);
          if (!exist) {
            SWITCH_KEY_ORDER.forEach(function (k) {
              SW.recs[mid].push({ model: mid, room: room.id, roomName: room.name, key: k, qty: 0 });
            });
          }
        });
        inp.value = '';
        swRenderTables();
        swRenderStats();
        toast('已增加空间：' + room.name);
        inp.focus();
      };
      /* 回车也能加 */
      $('swNewRoom').onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); $('swAddRoom').click(); }
      };
    }
    /* 光束角度下拉：跟着「带入门店」联动，只有支持多档角度的才有选项 */
    function syncBeamOptions() {
      var beamSel = $('swLightBeam');
      if (!beamSel) return;
      var f = LIGHT_FIXTURES[$('swLightModel').value];
      var opts = '<option value="">默认</option>';
      if (f && f.beam && f.beam.length > 1) {
        opts += f.beam.map(function (b) {
          return '<option value="' + esc(b.v) + '">' + esc(b.v) + '（¥' + b.price + '）</option>';
        }).join('');
      }
      beamSel.innerHTML = opts;
    }
    if ($('swLightModel')) {
      $('swLightModel').onchange = function () { syncBeamOptions(); };
      syncBeamOptions();
    }
    if ($('swLightStrategy')) {
      $('swLightStrategy').onchange = function () {
        swRenderLightSrcInfo();
        if ($('swLightPlan') && $('swLightPlan').style.display !== 'none') swLightPlanPreview();
      };
    }
    /* 灯带空间明细（v1.22） */
    if ($('swStripStrategy')) {
      $('swStripStrategy').onchange = function () {
        if ($('swStripPlan') && $('swStripPlan').style.display !== 'none') swStripPlanPreview();
      };
    }
    if ($('swStripModel')) {
      $('swStripModel').onchange = function () {
        if ($('swStripPlan') && $('swStripPlan').style.display !== 'none') swStripPlanPreview();
      };
    }
    if ($('swStripPull')) {
      $('swStripPull').onclick = function () { swInitLights(); swApplyStripPlan(); };
    }
    if ($('swStripPreview')) {
      $('swStripPreview').onclick = function () {
        var box = $('swStripPlan');
        if (box.style.display === 'none' || !box.style.display) swStripPlanPreview();
        else box.style.display = 'none';
      };
    }
    if ($('swAddStripLine')) {
      $('swAddStripLine').onclick = function () { swAddStripLine('', 'stripTwo', 0); };
    }
    if ($('swLightPull')) {
      $('swLightPull').onclick = function () { swInitLights(); swApplyLightPlan(); };
    }
    if ($('swLightPreview')) {
      $('swLightPreview').onclick = function () {
        var box = $('swLightPlan');
        if (box.style.display === 'none' || !box.style.display) swLightPlanPreview();
        else box.style.display = 'none';
      };
    }
    swRenderLightSrcInfo();
    swBindLightPicker();
    swRenderLightTable();
    swRenderStripLines();

    /* 电动窗帘（v1.18）：清空 / 从报价表选 */
    if ($('swCurtainClear')) {
      $('swCurtainClear').onclick = function () {
        SW.curtainLines = [];
        swRenderCurtainTable();
        swRenderStats();
        toast('窗帘数量已清空');
      };
    }
    if ($('swCurtainPick')) {
      $('swCurtainPick').onclick = swOpenCurtainPicker;
    }
    /* 按房间清单带入窗帘（v1.20） */
    if ($('swCurtainPull')) {
      $('swCurtainPull').onclick = function () { swInitCurtains(); swApplyCurtainPull(); };
    }
    if ($('swCurtainPullPreview')) {
      $('swCurtainPullPreview').onclick = function () {
        var box = $('swCurtainPullPlan');
        if (box.style.display === 'none' || !box.style.display) swRenderCurtainPullPreview();
        else box.style.display = 'none';
      };
    }
    ['swCurtainPullSingle', 'swCurtainPullDual'].forEach(function (id) {
      var el = $(id);
      if (el) el.onchange = function () {
        if ($('swCurtainPullPlan') && $('swCurtainPullPlan').style.display !== 'none') {
          swRenderCurtainPullPreview();
        }
      };
    });
    swBindCurtainPicker();
    swRenderCurtainTable();
    $('swFillZ1').onclick = function () {
      var v = $('swProjName').value.trim();
      if (!v) { toast('先填方案名称'); return; }
      $('projectName').value = v;
      toast('已同步到总报价单');
    };
    /* 从房间清单带入开关数量 */
    $('swPull').onclick = function () {
      swInit();
      swApplyPlan($('swTarget').value);
    };
    $('swPullPreview').onclick = function () {
      var box = $('swPullPlan');
      if (box.style.display === 'none' || !box.style.display) swRenderPlan();
      else { box.style.display = 'none'; }
    };
    $('swStrategy').onchange = function () { swRenderSrcInfo(); swRenderPlan(); };
    swRenderSrcInfo();

    /* 网关/传感器/中控屏输入 */
    EXTRA_ORDER.forEach(function (id) {
      var cap = id[0].toUpperCase() + id.slice(1);
      var qtyInp = $('sw' + cap + 'Qty');
      var priceInp = $('sw' + cap + 'Price');
      var upd = function () {
        if (!SW.extras[id]) SW.extras[id] = { qty: 0, price: EXTRA_DEVICES[id].price };
        SW.extras[id].qty = Math.max(0, parseInt(qtyInp ? qtyInp.value : 0, 10) || 0);
        SW.extras[id].price = Math.max(0, parseInt(priceInp ? priceInp.value : EXTRA_DEVICES[id].price, 10) || EXTRA_DEVICES[id].price);
        swRenderStats();
      };
      if (qtyInp) qtyInp.oninput = upd;
      if (priceInp) priceInp.oninput = upd;
    });
    $('swIncludeInstall').onchange = function () {
      SW.includeInstall = this.checked;
      swRenderStats();
    };
    /* 项目名和日期跟总报价单联动，省得两边各填一遍 */
    $('projectName').addEventListener('input', function () { $('swProjName').value = this.value; });
    $('swProjName').addEventListener('input', function () { $('projectName').value = this.value; });

    /* 产品选择器 */
    $('pickSearch').oninput = function () { renderPickerList(this.value); };
    $('pickSrc').onchange = function () { renderPickerList($('pickSearch').value); };
    $('pickClose').onclick = closePicker;
    $('mask').onclick = function (e) { if (e.target === $('mask')) closePicker(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePicker(); });

    /* 顶栏 */
    $('btnSave').onclick = save;
    $('btnLoad').onclick = loadDialog;
    $('btnExportFile').onclick = exportFile;
    $('btnImportFile').onclick = function () { $('filePlanJson').click(); };
    $('filePlanJson').onchange = function () { importFile(this.files[0]); this.value = ''; };
    $('btnXlsx').onclick = doXlsx;
    $('btnXlsx2').onclick = doXlsx;
    $('btnPrint').onclick = function () { switchTab('p4'); setTimeout(function () { window.print(); }, 120); };
    $('btnPrint2').onclick = function () { window.print(); };
  }
  function markTier(t) {
    S.tier = t;
    /* 不再按档过滤生成，而是按档「批量预设勾选」，具体哪些要由你逐条勾选决定 */
    S.points.forEach(function (p) { p.checked = (t === 0) ? true : (p.tier <= t); });
    document.querySelectorAll('[data-tier]').forEach(function (b) {
      b.classList.toggle('on', +b.dataset.tier === t);
    });
    renderPoints();
  }
  function switchTab(id) {
    var t = document.querySelector('.tab[data-tab="' + id + '"]'); if (t) t.click();
  }

  /* =========================================================
     5. 产品库
     ========================================================= */
  function renderLibStat() {
    var bySrc = {}, n = 0, minP = 1e9, maxP = 0;
    LIB.forEach(function (p) { bySrc[p.src] = (bySrc[p.src] || 0) + 1; n++; if (p.price < minP) minP = p.price; if (p.price > maxP) maxP = p.price; });
    var html = '<div class="sum-box"><div class="k">产品总数</div><div class="v">' + n + '</div><div class="n">含你所有渠道</div></div>' +
      '<div class="sum-box"><div class="k">价格区间</div><div class="v orange">¥' + fmt0(minP) + '–' + fmt0(maxP) + '</div><div class="n">最低到最高单价</div></div>';
    Object.keys(bySrc).sort(function (a, b) { return bySrc[b] - bySrc[a]; }).forEach(function (k) {
      html += '<div class="sum-box"><div class="k">' + esc(k) + '</div><div class="v" style="font-size:17px">' + bySrc[k] + ' 款</div></div>';
    });
    $('libStat').innerHTML = html;

    /* 缺货提醒：模板配了 must 却在产品库里找不到对应产品 */
    var miss = [];
    TEMPLATES.forEach(function (t) {
      if (!t.must) return;
      var list = LIB.filter(function (p) {
        return (t.devAlt && t.devAlt.indexOf(p.cat) >= 0) || p.cat === tplCat(t.dev);
      });
      if (!list.some(function (p) { return (p.type + ' ' + p.name).indexOf(t.must) >= 0; })) {
        miss.push(t.name + '（需要含「' + t.must + '」的产品）');
      }
    });
    var box = $('libMiss');
    if (box) {
      box.innerHTML = miss.length
        ? '<b style="color:#c5221f">⚠ 产品库缺货 ' + miss.length + ' 项：</b>' + esc(miss.join('、'))
        : '<b style="color:#0f9d58">✓ 所有点位都能在产品库匹配到产品</b>';
      box.style.display = 'block';
    }

    var cur = $('libSrc');
    if (cur.options.length <= 1) {
      cur.innerHTML = '<option value="">全部来源</option>' + SRC_ORDER.map(function (s) {
        return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
      }).join('');
    }
  }

  function renderLibTable(kw) {
    kw = (kw || '').trim().toLowerCase();
    var src = $('libSrc').value;
    var list = LIB.filter(function (p) {
      if (src && p.src !== src) return false;
      if (!kw) return true;
      return (p.type + ' ' + p.name + ' ' + p.spec + ' ' + p.src).toLowerCase().indexOf(kw) >= 0;
    });
    $('libCount').textContent = '搜到 ' + list.length + ' 款';
    if (!list.length) { $('libTable').innerHTML = '<tbody><tr><td class="empty">没有匹配的产品</td></tr></tbody>'; return; }
    $('libTable').innerHTML = '<thead><tr><th>来源</th><th>设备类型</th><th>型号</th><th>作用</th><th style="width:70px">单价</th><th style="width:46px">单位</th></tr></thead><tbody>' +
      list.slice(0, 500).map(function (p) {
        return '<tr><td class="s">' + esc(p.src) + '</td><td>' + esc(p.type) + '</td><td>' + esc(p.name) + '</td>' +
          '<td class="s">' + esc((p.spec || '').slice(0, 60)) + '</td><td class="p">¥' + fmt(p.price) + '</td><td>' + esc(p.unit || '个') + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function parsePasted(text, src) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { updated: 0, added: 0 };
    var cells = lines.map(function (l) {
      var parts = l.split(/\t|\,|，/).map(function (s) { return s.trim(); });
      return parts;
    });
    /* 第一行为表头则跳过 */
    var head = cells[0].join('').toLowerCase();
    var isHeader = /类型|名称|型号|单价|价格|产品/.test(head) && cells[0].length >= 3;
    var data = isHeader ? cells.slice(1) : cells;

    var updated = 0, added = 0;
    data.forEach(function (c) {
      if (c.length < 2) return;
      var price = parseFloat(String(c[c.length - 1]).replace(/[^\d.\-]/g, ''));
      if (!isFinite(price) || price <= 0) return;
      var name = c[0], model = c.length > 2 ? c[1] : '', spec = c.length > 3 ? c.slice(2, c.length - 1).join(' ') : '';
      var key = src + '|' + name + '|' + model;
      var hit = LIB.filter(function (p) { return prodKey(p) === key; })[0];
      if (hit) { hit.price = price; hit.spec = spec || hit.spec; updated++; }
      else {
        LIB.push({
          src: src, type: name, cat: guessCatLib(name + ' ' + model), name: model,
          spec: spec, price: price, unit: '个'
        });
        added++;
      }
    });
    return { updated: updated, added: added };
  }
  /* 简易品类猜测（导入新产品时用） */
  function guessCatLib(t) {
    var list = [
      ['curtain', ['窗帘', '帘', '遮阳', '电机']], ['panel', ['开关', '面板']], ['plug', ['插座', '控制器', '模块']],
      ['sensor', ['传感器']], ['presence', ['存在', '人在']], ['smoke', ['烟感', '烟雾']], ['gas', ['燃气', '天然气']],
      ['water', ['水浸', '漏水', '阀']], ['lock', ['门锁']], ['camera', ['摄像头', '摄像机', '猫眼', '对讲']],
      ['gateway', ['网关', '中枢', '中控']], ['speaker', ['喇叭', '音箱', '功放', '背景音乐']],
      ['light', ['灯', '轨道', '磁吸', '型材']], ['ap', ['AP', '路由', '交换机', 'AC']]
    ];
    for (var i = 0; i < list.length; i++)
      for (var j = 0; j < list[i][1].length; j++)
        if (t.indexOf(list[i][1][j]) >= 0) return list[i][0];
    return 'other';
  }

  function saveLib() {
    try {
      var extra = LIB.filter(function (p) { return SRC_ORDER.indexOf(p.src) < 0; });
      localStorage.setItem(EXTRA_KEY, JSON.stringify(extra));
    } catch (e) { }
  }

  /* =========================================================
     6. AI 识图识别房间
     ========================================================= */
  var AI_ROOMS = null;

  function saveVisionCfg() {
    VISION.saveCfg({
      provider: $('aiProv').value,
      key: $('aiKey').value.trim(),
      url: $('aiUrl').value.trim(),
      model: $('aiModel').value.trim()
    });
  }

  function openAiRoom() {
    var c = VISION.cfg();
    var sel = $('aiProv');
    sel.innerHTML = Object.keys(VISION.PROVIDERS).map(function (k) {
      return '<option value="' + k + '">' + VISION.PROVIDERS[k].name + '</option>';
    }).join('');
    sel.value = c.provider;
    $('aiKey').value = c.key || '';
    $('aiUrl').value = c.url || VISION.PROVIDERS[c.provider].url;
    $('aiModel').value = c.model || VISION.PROVIDERS[c.provider].model;
    $('aiProvTip').textContent = VISION.PROVIDERS[c.provider].name + '：' +
      VISION.PROVIDERS[c.provider].tip + '，单次 ' + VISION.PROVIDERS[c.provider].cost;

    if (!S.imgs.length) toast('先上传户型图或效果图');
    $('aiReplace').checked = false;
    $('aiStatus').textContent = '';
    $('aiResult').style.display = 'none';
    AI_ROOMS = null;
    $('aiMask').classList.add('show');
  }
  function closeAiRoom() { $('aiMask').classList.remove('show'); }

  function runAiRoom() {
    if (!S.imgs.length) { toast('先上传户型图或效果图'); return; }
    saveVisionCfg();
    var btn = $('aiRun');
    btn.disabled = true;
    btn.textContent = '识别中…';
    $('aiStatus').textContent = '正在压缩图片…';
    $('aiResult').style.display = 'none';

    VISION.recognize(S.imgs, {}, function (msg) { $('aiStatus').textContent = msg; })
      .then(function (rooms) {
        AI_ROOMS = rooms;
        renderAiResult();
        $('aiResult').style.display = 'block';
        $('aiStatus').textContent = '识别到 ' + rooms.length + ' 个房间，核对一下再写入';
      })
      .catch(function (err) {
        $('aiStatus').textContent = '';
        var net = /Failed to fetch|NetworkError|Load failed|CONNECTION|CORS/i.test(err.message);
        alert('识别失败：' + err.message +
          (net ? '\n\n可能是浏览器不让 file:// 页面直接调接口。' +
            '关掉本页，双击目录下的「启动本地服务.bat」，再打开 http://localhost:8000 重试。'
            : '') +
          '\n\n也可以点「✏️ 图上标房间」免费手标，效果一样。');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '开始识别';
      });
  }

  function renderAiResult() {
    var tb = $('aiTable');
    tb.innerHTML = '<thead><tr><th style="width:52px">序号</th><th style="width:130px">房间名</th>' +
      '<th style="width:150px">类型</th><th style="width:80px">面积㎡</th><th style="width:72px">窗位</th>' +
      '<th style="width:130px">备注</th></tr></thead><tbody>';
    AI_ROOMS.forEach(function (r, i) {
      tb.innerHTML += '<tr data-i="' + i + '">' +
        '<td style="color:var(--muted)">' + (i + 1) + '</td>' +
        '<td><input data-k="name" value="' + esc(r.name) + '" style="width:120px"></td>' +
        '<td><select data-k="type" style="width:142px">' +
        Object.keys(ROOM_TYPES).map(function (k) {
          return '<option value="' + k + '"' + (r.type === k ? ' selected' : '') + '>' +
            ROOM_TYPES[k].icon + ' ' + ROOM_TYPES[k].name + '</option>';
        }).join('') + '</select></td>' +
        '<td><input data-k="area" type="number" step="0.5" min="1" value="' + r.area + '" style="width:70px"></td>' +
        '<td><input data-k="windows" type="number" min="0" value="' + r.windows + '" style="width:60px"></td>' +
        '<td><input data-k="note" value="' + esc(r.note || '') + '" style="width:120px"></td></tr>';
    });
    tb.querySelectorAll('[data-k]').forEach(function (el) {
      el.onchange = function () {
        var r = AI_ROOMS[+el.closest('tr').dataset.i];
        var k = el.dataset.k;
        r[k] = (k === 'name' || k === 'note') ? el.value : parseFloat(el.value) || 0;
      };
    });
  }

  function applyAiRooms() {
    if (!AI_ROOMS || !AI_ROOMS.length) { toast('还没有识别结果'); return; }
    var replace = $('aiReplace').checked;
    var doApply = function () {
    var rooms = AI_ROOMS.map(function (r) {
      var d = defaultDev(r);
      return {
        uid: uid('r'),
        type: r.type,
        name: r.name || '房间',
        area: r.area || 10,
        windows: r.windows === undefined ? 1 : r.windows,
        note: r.note || '',
        track: r.windows > 1 ? 'dual' : 'single',   /* AI 识别到多扇窗，默认按双轨给 */
        sw: d.sw, sn: d.sn
      };
    });
    if (replace) S.rooms = rooms; else S.rooms = S.rooms.concat(rooms);

    renderRooms(); renderNeeds();
    collect(); genPoints(true);
    closeAiRoom();
    toast(replace ? '已覆盖为 ' + rooms.length + ' 个房间' : '已追加 ' + rooms.length + ' 个房间');
    };
    if (replace) {
      modalBox({
        title: '将覆盖现有 ' + S.rooms.length + ' 个房间', fields: [],
        okText: '覆盖并导入', cancelText: '取消', onOk: doApply
      });
    } else {
      doApply();
    }
  }

  /* =========================================================
     7. 点位分布图
     ========================================================= */
  var PLAN_SVG = '';
  var PANEL_SVG = '';
  function renderPlan() {
    var box = $('planBox');
    if (!S.points.length) {
      box.innerHTML = '<div class="empty">还没有点位，先生成点位清单。</div>';
      PLAN_SVG = '';
      return;
    }
    try {
      var cps = curPoints();
      PLAN_SVG = PLAN.build(S.rooms, cps, {
        title: (S.projectName || '全屋智能') + ' · 点位分布图',
        sub: '已选 ' + cps.length + ' 个点位  |  ' +
          S.rooms.reduce(function (a, r) { return a + (r.area || 0); }, 0).toFixed(0) + '㎡  |  智能方案',
        drag: S.planDrag
      });
      box.innerHTML = '<div class="plan-wrap">' + PLAN_SVG + '</div>';
      enablePlanDrag(box.querySelector('svg'));
    } catch (e) {
      box.innerHTML = '<div class="empty">示意图生成失败：' + esc(e.message) + '</div>';
      PLAN_SVG = '';
    }
  }

  /* 点位拖拽微调：按住绿点直接拖，松开后把偏移记进 S.planDrag 并随方案保存 */
  function clientToSvg(svg, x, y) {
    var pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: x, y: y };
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function parseTranslate(t) {
    var m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(t || '');
    if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    var m2 = /translate\(([-\d.]+)\)/.exec(t || '');
    if (m2) return { x: parseFloat(m2[1]), y: 0 };
    return { x: 0, y: 0 };
  }
  function enablePlanDrag(svg) {
    if (!svg) return;
    svg.querySelectorAll('.plan-pt').forEach(function (g) {
      g.addEventListener('pointerdown', onPtDown);
    });
  }
  var _drag = null;
  function onPtDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    var g = e.currentTarget;
    var svg = g.ownerSVGElement || g.closest('svg');
    var tm = parseTranslate(g.getAttribute('transform'));
    var p0 = clientToSvg(svg, e.clientX, e.clientY);
    _drag = { g: g, svg: svg, ox: tm.x - p0.x, oy: tm.y - p0.y, key: g.getAttribute('data-key') };
    g.style.cursor = 'grabbing';
    g.setAttribute('opacity', '0.85');
    window.addEventListener('pointermove', onPtMove);
    window.addEventListener('pointerup', onPtUp);
  }
  function onPtMove(e) {
    if (!_drag) return;
    var p = clientToSvg(_drag.svg, e.clientX, e.clientY);
    _drag.g.setAttribute('transform', 'translate(' + (p.x + _drag.ox) + ',' + (p.y + _drag.oy) + ')');
  }
  function onPtUp() {
    if (!_drag) return;
    var g = _drag.g;
    var ax = parseFloat(g.getAttribute('data-ax')) || 0;
    var ay = parseFloat(g.getAttribute('data-ay')) || 0;
    var tm = parseTranslate(g.getAttribute('transform'));
    var dx = tm.x - ax, dy = tm.y - ay;
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
      S.planDrag = S.planDrag || {};
      S.planDrag[_drag.key] = { dx: Math.round(dx), dy: Math.round(dy) };
      try { persistSaved(); } catch (err) { }
    }
    g.style.cursor = 'grab';
    g.setAttribute('opacity', '1');
    window.removeEventListener('pointermove', onPtMove);
    window.removeEventListener('pointerup', onPtUp);
    _drag = null;
  }

  function savePlanSvg() {
    if (!PLAN_SVG) { toast('先点「生成 / 刷新示意图」'); return; }
    var blob = new Blob([PLAN_SVG], { type: 'image/svg+xml;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.projectName || '点位分布图') + '.svg';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  }

  /* =========================================================
     7.5 智能面板 UI 草图（墙装开关面板）
     ========================================================= */
  function renderPanels() {
    var box = $('panelBox');
    if (!S.points.length) {
      box.innerHTML = '<div class="empty">还没有点位，先生成点位清单。</div>';
      PANEL_SVG = '';
      return;
    }
    try {
      PANEL_SVG = PANELS.toSvg(S.rooms, curPoints(), S.panelLabels, {
        title: (S.projectName || '全屋智能') + ' · 智能面板示意图'
      });
      box.innerHTML = PANELS.build(S.rooms, curPoints(), S.panelLabels, {
        title: (S.projectName || '全屋智能') + ' · 智能面板示意图'
      });
      box.querySelectorAll('.pk-lbl').forEach(function (inp) {
        inp.addEventListener('input', onPanelLabel);
      });
    } catch (e) {
      box.innerHTML = '<div class="empty">面板草图生成失败：' + esc(e.message) + '</div>';
      PANEL_SVG = '';
    }
  }
  /* 点按键标签实时改：写回 S.panelLabels 并随方案保存，同时同步导出 SVG */
  function onPanelLabel(e) {
    var inp = e.currentTarget;
    var lk = inp.getAttribute('data-lk');
    var v = inp.value;
    S.panelLabels = S.panelLabels || {};
    if (v && v.trim()) S.panelLabels[lk] = v.trim();
    else delete S.panelLabels[lk];
    try { persistSaved(); } catch (err) {}
    PANEL_SVG = PANELS.toSvg(S.rooms, S.points, S.panelLabels, {
      title: (S.projectName || '全屋智能') + ' · 智能面板示意图'
    });
  }
  function savePanelSvg() {
    if (!S.points.length) { toast('先生成点位清单'); return; }
    var svg = PANELS.toSvg(S.rooms, S.points, S.panelLabels, {
      title: (S.projectName || '全屋智能') + ' · 智能面板示意图'
    });
    if (!svg) { toast('点位表里还没有面板点位'); return; }
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.projectName || '智能面板示意图') + '.svg';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  }

  /* =========================================================
     8. 花钱顺序（侯哥方法论：只讲顺序，不报金额）
     ========================================================= */
  var SPEND_OPEN = {};        // step.id -> bool，记住哪些展开了

  function renderSpend() {
    var box = $('spendOrder');
    if (!box) return;
    var cps = curPoints();
    var so = buildSpendOrder(cps);

    /* 顶部导语：不给总价，只讲顺序——这是刻意设计，别改成报价 */
    var html = '<div class="spend-lead"><div class="sl-title">全屋智能的六步花钱顺序</div>' +
      '<div class="sl-sub">按「错了能不能补救」排序，不按金额排序</div></div>';

    html += '<div class="spend-list">';
    so.steps.forEach(function (b) {
      var s = b.step;
      var zero = b.items.length === 0;
      html += '<div class="spend-item' + (zero ? ' zero' : '') + (SPEND_OPEN[s.id] ? ' open' : '') +
        '" data-sp="' + s.id + '">' +
        '<div class="spend-head">' +
        '<div class="spend-idx" style="background:' + s.color + '">' + s.id + '</div>' +
        '<div class="spend-txt"><b>' + s.icon + ' ' + esc(s.name) +
        (s.core ? ' <span class="spend-core">必做</span>' : '') + '</b>' +
        '<em>' + esc(s.brief) + '</em></div>' +
        (zero
          ? '<div class="spend-money"><div class="c">本方案未纳入</div></div>'
          : '<div class="spend-money"><div class="m">¥' + fmt0(b.money) + '</div>' +
          '<div class="c">' + b.cnt + ' 件 · ' + b.items.length + ' 类</div></div>') +
        '<div class="spend-caret">' + (SPEND_OPEN[s.id] ? '▲' : '▼') + '</div>' +
        '</div>' +
        '<div class="spend-body"><div>' + esc(s.detail).replace(/\n/g, '<br>') + '</div>' +
        '<div class="why"><b>为什么排这个位置：</b>' + esc(s.why) + '</div>';

      if (b.items.length) {
        html += '<div class="spend-items">';
        b.items.forEach(function (p) {
          var pr = findProd(p.prodKey);
          html += '<div class="si"><span>' + esc(p.roomName) + ' · ' + esc(p.name) +
            (p.qty > 1 ? ' ×' + p.qty : '') + '</span>' +
            '<span>¥' + fmt0((p.price || 0) * (p.qty || 0)) + '</span></div>';
        });
        html += '</div>';
      } else {
        html += '<div class="spend-empty-tip">本方案还没纳入这一步的设备。可以先去第 3 步勾上对应需求。</div>';
      }
      html += '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;

    box.querySelectorAll('[data-sp]').forEach(function (el) {
      el.querySelector('.spend-head').onclick = function () {
        var id = +el.dataset.sp;
        SPEND_OPEN[id] = !SPEND_OPEN[id];
        el.classList.toggle('open', !!SPEND_OPEN[id]);
        el.querySelector('.spend-caret').textContent = SPEND_OPEN[id] ? '▲' : '▼';
      };
    });
  }

  /* 打印版：给客户看的「施工顺序说明」，刻意不含总价 */
  function spendPrintHtml() {
    var cps = curPoints();
    var so = buildSpendOrder(cps);
    var date = $('quoteDate').value || today();
    var html = '<div class="spend-print"><h2>全屋智能 · 花钱与施工顺序</h2>' +
      '<div class="sp-meta">' + esc(S.projectName || '全屋智能方案') + '　|　' +
      S.rooms.reduce(function (a, r) { return a + (r.area || 0); }, 0).toFixed(0) + '㎡　|　' +
      S.rooms.length + ' 个空间　|　' + esc(date) + '</div>';

    so.steps.forEach(function (b) {
      var s = b.step;
      html += '<div class="sp-row"><div class="sp-num" style="background:' + s.color + '">' + s.id + '</div>' +
        '<div class="sp-body"><b>' + s.icon + ' ' + esc(s.name) + (s.core ? '（必做）' : '') + '</b>' +
        '<p>' + esc(s.detail).replace(/\n/g, '<br>') + '</p></div></div>';
    });

    html += '<div class="sp-note"><b>说明</b><br>' +
      '· 本顺序按「做错了能不能补救」排列：前面的步骤一旦错过，后面补救成本成倍增加。' +
      '后面的步骤没做，随时可以补，不影响前面的成果。<br>' +
      '· 具体配置与费用，需结合现场户型和实际需求确认，以正式报价单为准。<br>' +
      '· 施工前请确认电路条件（有无零火线），这决定了后续所有设备的选择方案。<br>' +
      '设计：智装点位通 · ' + esc(date) + '</div></div>';
    return html;
  }

  function printSpend() {
    var old = $('spendPrint');
    if (old) old.parentNode.removeChild(old);
    var w = document.createElement('div');
    w.id = 'spendPrint';
    w.innerHTML = spendPrintHtml();
    $('p6').appendChild(w);
    /* 只打印这份清单：把交互区藏起来 */
    var hide = ['spendOrder'];
    var backup = hide.map(function (id) {
      var e = $(id); return e ? { e: e, d: e.style.display } : null;
    }).filter(Boolean);
    backup.forEach(function (b) { b.e.style.display = 'none'; });
    window.print();
    setTimeout(function () {
      backup.forEach(function (b) { b.e.style.display = b.d; });
      if (w.parentNode) w.parentNode.removeChild(w);
    }, 400);
  }

  /* 花钱顺序 → Excel：作为报价单的「施工顺序说明」附页 */
  function doSpendXlsx() {
    var so = buildSpendOrder(curPoints());
    var rows = [
      ['全屋智能 · 花钱与施工顺序'],
      ['方案', S.projectName || '未命名方案', '日期', $('quoteDate').value || today()],
      [],
      ['顺序', '步骤', '是否必做', '核心逻辑', '本方案金额', '本方案件数']
    ];
    so.steps.forEach(function (b) {
      rows.push([
        b.step.id, b.step.name, b.step.core ? '必做' : '可选',
        b.step.brief, b.money, b.cnt
      ]);
    });
    rows.push([]);
    rows.push(['步骤详解']);
    rows.push(['顺序', '步骤', '说明']);
    so.steps.forEach(function (b) {
      rows.push([b.step.id, b.step.name,
        b.step.detail + '\n为什么排这个位置：' + b.step.why]);
    });

    /* 明细页：每步下面挂了哪些设备 */
    rows.push([]);
    rows.push(['各步骤包含的设备']);
    rows.push(['顺序', '步骤', '区域', '点位', '数量', '金额']);
    so.steps.forEach(function (b) {
      b.items.forEach(function (p) {
        rows.push([b.step.id, b.step.name, p.roomName, p.name, p.qty, (p.price || 0) * (p.qty || 0)]);
      });
    });

    try {
      var parts = XLSX_UTIL.build([
        { name: '花钱顺序', rows: rows, widths: [6, 16, 10, 34, 14, 12] }
      ]);
      XLSX_UTIL.download(parts, (S.projectName || '全屋智能') + '_花钱顺序.xlsx');
      toast('花钱顺序已导出');
    } catch (e) { toast('导出失败：' + e.message); }
  }

  /* ---------- 方案文件导出 / 导入（.json） ----------
     为什么要这个：方案只存在浏览器缓存里，清缓存 / 换电脑 / 送客户就没了。
     导出一个文件，可以发微信、存网盘、换电脑一键还原。 */
  function exportFile() {
    collect();
    /* 图纸体积大，默认不打包，需要时一并带上 */
    var withImg = S.imgs && S.imgs.length;
    var pack = {
      _app: '智装点位通',
      _ver: '1.7.0',
      _time: new Date().toLocaleString('zh-CN'),
      data: JSON.parse(JSON.stringify(S)),
      imgs: withImg ? JSON.parse(JSON.stringify(S.imgs)) : []
    };
    var txt = JSON.stringify(pack, null, 2);
    var blob = new Blob([txt], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var nm = (S.projectName || '智能方案').replace(/[\\/:*?"<>|]/g, '');
    a.download = nm + '_' + today() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
    toast('方案文件已导出' + (withImg ? '（含 ' + withImg.length + ' 张图纸）' : '（不含图纸，图纸较大默认不打包）'));
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var pack;
      try { pack = JSON.parse(reader.result); }
      catch (e) { toast('这不是有效的方案文件'); return; }
      var d = pack && pack.data ? pack.data : pack;
      if (!d || !d.rooms) { toast('文件里没有找到方案数据'); return; }
      /* 老方案的房间没有 uid，补上，避免渲染对不上 */
      if (Array.isArray(d.rooms)) {
        d.rooms.forEach(function (r) { if (!r.uid) r.uid = uid('r'); });
      }
      var doApply = function () {
        apply(d);
        /* 图片单独走 IndexedDB 还原 */
        if (Array.isArray(pack.imgs) && pack.imgs.length) {
          S.imgs = [];
          var n = 0;
          pack.imgs.forEach(function (g) {
            if (!g || !g.data) return;
            var gid = g.id || uid('img');
            IMG.put(gid, g.data).then(function () {
              S.imgs.push({ id: gid, kind: g.kind, data: g.data });
              if (++n === pack.imgs.length) renderImgs();
            });
          });
        } else renderImgs();
        toast('已导入：' + (d.projectName || '未命名方案'));
      };
      if (S.rooms.length && S.points.length) {
        modalBox({
          title: '导入会覆盖当前方案', fields: [],
          okText: '覆盖导入', cancelText: '取消',
          onOk: doApply
        });
      } else doApply();
    };
    reader.readAsText(file, 'utf-8');
  }

  /* =========================================================
     11. 主销开关快速报价（绿米 Z1 / 米家 X30）
     ========================================================= */
  var SW = {
    recs: { z1: null, x30: null },
    date: '',
    extras: {
      hubM3:       { qty: 0, price: EXTRA_DEVICES.hubM3.price },
      hubMJ:       { qty: 0, price: EXTRA_DEVICES.hubMJ.price },
      hubM200:     { qty: 0, price: EXTRA_DEVICES.hubM200.price },
      motion:      { qty: 0, price: EXTRA_DEVICES.motion.price },
      door:        { qty: 0, price: EXTRA_DEVICES.door.price },
      water:       { qty: 0, price: EXTRA_DEVICES.water.price },
      siPanel:     { qty: 0, price: EXTRA_DEVICES.siPanel.price }
    },
    lights: {},          /* 照明灯具：{ fixtureId: { qty, price, beam } }，v1.15.0 新增 */
    stripLines: [],      /* 灯带空间明细：[{ id, room, modelId, meters }]，v1.22 新增 */
    curtains: {},        /* 电动窗帘：{ '系列|宽度': { series, width, qty } }，v1.18 重做 */
    includeInstall: true
  };

  function swInit() {
    if (!SW.recs.z1) SW.recs.z1 = blankSwitchRecs('z1');
    if (!SW.recs.x30) SW.recs.x30 = blankSwitchRecs('x30');
    if (!$('swDate').value) $('swDate').value = today();

    /* 兼容 v1.13 旧存档：单一 hub 拆成 M3/M200 后，把旧 hub 数量迁到 M3 */
    if (SW.extras && SW.extras.hub && !SW.extras.hubM3 && !SW.extras.hubM200) {
      SW.extras.hubM3 = { qty: SW.extras.hub.qty || 0, price: EXTRA_DEVICES.hubM3.price };
      delete SW.extras.hub;
    }
    /* 兼容 v1.14 旧存档：温湿度传感器(temp) 改成水浸传感器(water)，数量迁过去 */
    if (SW.extras && SW.extras.temp && !SW.extras.water) {
      SW.extras.water = { qty: SW.extras.temp.qty || 0, price: EXTRA_DEVICES.water.price };
      delete SW.extras.temp;
    }

    EXTRA_ORDER.forEach(function (id) {
      if (!SW.extras[id]) SW.extras[id] = { qty: 0, price: EXTRA_DEVICES[id].price };
      var cap = id[0].toUpperCase() + id.slice(1);
      var qtyInp = $('sw' + cap + 'Qty');
      var priceInp = $('sw' + cap + 'Price');
      if (qtyInp && !qtyInp.value) qtyInp.value = SW.extras[id].qty || 0;
      if (priceInp && !priceInp.value) priceInp.value = SW.extras[id].price || EXTRA_DEVICES[id].price;
    });
    var chk = $('swIncludeInstall');
    if (chk) chk.checked = SW.includeInstall !== false;

    swInitLights();
    swInitCurtains();
    swSyncStripAccessories();
    swRenderStripLines();
    swRenderCurtainTable();
  }

  /* ---------- 电动窗帘（v1.18 重做，v1.22.3 改可添加空间明细） ----------
     数据存 SW.curtainLines（数组，每行一个空间）：{ id, room, series, width, qty }。
     旧存档兼容：
       - v1.14 的 curtainC200 / curtainE1 两个固定价（¥499/¥399，报价表里没有）→ 迁成 C200/E1 + 默认 4 米
       - v1.18~v1.22.2 的 SW.curtains（键=系列|宽度）→ 展开成 curtainLines */
  function swInitCurtains() {
    if (!Array.isArray(SW.curtainLines)) SW.curtainLines = [];
    /* v1.14 旧数据：curtainC200 → C200|4，curtainE1 → E1|4 */
    [['curtainC200', 'C200'], ['curtainE1', 'E1']].forEach(function (p) {
      var old = SW.extras && SW.extras[p[0]];
      if (old && parseInt(old.qty, 10)) {
        SW.curtainLines.push({
          id: uid('curtain'), room: '', series: p[1],
          width: CURTAIN_DEFAULT_WIDTH, qty: parseInt(old.qty, 10) || 0
        });
        delete SW.extras[p[0]];
      }
    });
    /* 更早的 SW.curtains（键=系列|宽度）展开成明细行 */
    if (SW.curtains && typeof SW.curtains === 'object') {
      Object.keys(SW.curtains).forEach(function (k) {
        var e = SW.curtains[k];
        if (!e) return;
        var parts = String(k).split('|');
        SW.curtainLines.push({
          id: uid('curtain'),
          room: e.room || '',
          series: e.series || parts[0] || CURTAIN_ORDER[0],
          width: e.width != null ? parseFloat(e.width) : (parseFloat(parts[1]) || CURTAIN_DEFAULT_WIDTH),
          qty: Math.max(0, parseInt(e.qty, 10) || 0)
        });
      });
      delete SW.curtains;
    }
  }

  /* ---------- 照明灯具（v1.15.0） ----------
     数量存 SW.lights，单价默认从报价表取；用户改过单价就沿用改后的。 */
  function swInitLights() {
    if (!SW.lights) SW.lights = {};
    LIGHT_ORDER.forEach(function (id) {
      var f = LIGHT_FIXTURES[id];
      if (!SW.lights[id]) {
        SW.lights[id] = { qty: 0, price: f.price, beam: '' };
      } else {
        var e = SW.lights[id];
        if (typeof e.price !== 'number' || !isFinite(e.price)) e.price = f.price;
        if (typeof e.beam !== 'string') e.beam = '';
      }
    });
    /* v1.22：旧数据没有 stripLines，但有 stripTwo 米数时，自动生成一行明细，避免丢数据 */
    if (!Array.isArray(SW.stripLines)) SW.stripLines = [];
    if (!SW.stripLines.length && (SW.lights.stripTwo || {}).qty > 0) {
      SW.stripLines.push({
        id: uid('strip'),
        room: '灯带',
        modelId: 'stripTwo',
        meters: parseFloat(SW.lights.stripTwo.qty) || 0
      });
    }
  }

  /* ---------- 灯带配套件自动计算（v1.22） ----------
     根据 SW.stripLines 空间明细，把灯带米数汇总到 SW.lights，
     并自动计算：智能灯带驱动模块、双色温 PWM 调光模块、200W 电源。
     这些配套件在灯具表里也显示，但不允许手改数量（由明细驱动）。 */
  function swSyncStripAccessories() {
    var acc = calculateStripAccessories(SW.stripLines);
    /* 先把各型号灯带米数汇总到 SW.lights */
    LIGHT_GROUPS.forEach(function (g) {
      if (g.id !== 'strip') return;
      g.items.forEach(function (it) {
        if (!SW.lights[it.id]) SW.lights[it.id] = { qty: 0, price: it.price, beam: '' };
        SW.lights[it.id].qty = SW.stripLines
          .filter(function (x) { return x.modelId === it.id; })
          .reduce(function (s, x) { return s + (parseFloat(x.meters) || 0); }, 0);
      });
    });
    /* 再写配套件数量 */
    ['stripDriverModule', 'stripPWMTwo', 'stripPower200'].forEach(function (id) {
      var f = LIGHT_FIXTURES[id];
      if (!f) return;
      if (!SW.lights[id]) SW.lights[id] = { qty: 0, price: f.price, beam: '' };
      SW.lights[id].qty = acc[id] || 0;
    });
  }

  function swLightTotal() {
    return LIGHT_ORDER.reduce(function (sum, id) {
      var e = SW.lights[id] || { qty: 0, price: 0 };
      return sum + (Math.max(0, parseInt(e.qty, 10) || 0) * Math.max(0, parseInt(e.price, 10) || 0));
    }, 0);
  }

  /* ---------- 网关/传感器/中控屏/窗帘电机小计（v1.14.0） ---------- */
  function subOf(ids) {
    return (ids || []).reduce(function (sum, id) {
      var e = SW.extras[id] || { qty: 0, price: 0 };
      return sum + (Math.max(0, parseInt(e.qty, 10) || 0) * Math.max(0, parseInt(e.price, 10) || 0));
    }, 0);
  }

  function swExtraTotal() { return subOf(EXTRA_ORDER); }
  function swHubSensorPanelTotal() { return subOf(EXTRA_HUB_SENSOR_PANEL); }

  /* ---------- 电动窗帘（v1.18 重做） ----------
     键 = 系列 + 宽度，例如 'C200|4'（curtainKey 定义在 quote-switch.js）。
     单价不存，实时按宽度查报价表。 */

  function swCurtainRows() {
    return (SW.curtainLines || []).filter(function (l) {
      return l && Math.max(0, parseInt(l.qty, 10) || 0) > 0;
    }).map(function (l) {
      var s = CURTAIN_SERIES[l.series] || CURTAIN_SERIES[CURTAIN_ORDER[0]];
      var price = curtainPriceAt(l.series, l.width);
      var q = Math.max(0, parseInt(l.qty, 10) || 0);
      return {
        id: l.id, room: l.room || '', series: l.series, width: l.width,
        name: s.name, icon: s.icon, note: s.note, unit: '套',
        qty: q, price: price, sub: q * price
      };
    });
  }

  function swCurtainTotal() {
    return swCurtainRows().reduce(function (sum, r) { return sum + r.sub; }, 0);
  }

  /* ---------- 电动窗帘表格渲染（v1.23 可添加空间明细） ----------
     每行一个空间，可选系列/轨道宽度/数量；支持增加、删除、从房间清单带入。
     输入时只更新内存不重绘（保留焦点），离开/选择/增删时才重绘。 */
  function swRenderCurtainTable() {
    var box = $('swCurtainTable');
    if (!box) return;
    if (!Array.isArray(SW.curtainLines)) SW.curtainLines = [];
    var lines = SW.curtainLines;

    var html = '<div class="tbl-wrap"><table class="sw-tbl"><thead><tr>' +
      '<th style="width:160px">空间</th>' +
      '<th>系列</th>' +
      '<th class="ctr">轨道宽度</th>' +
      '<th class="ctr">数量</th>' +
      '<th class="right">套装单价</th>' +
      '<th class="right">小计</th>' +
      '<th style="width:50px"></th>' +
      '</tr></thead><tbody>';

    if (!lines.length) {
      html += '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:18px 8px">' +
        '还没有窗帘。点下面「＋ 增加一行」手动加，或「从房间清单带入」按空间批量生成。</td></tr>';
    }
    lines.forEach(function (l, idx) {
      var s = CURTAIN_SERIES[l.series] || CURTAIN_SERIES[CURTAIN_ORDER[0]];
      var price = curtainPriceAt(l.series, l.width);
      var q = Math.max(0, parseInt(l.qty, 10) || 0);
      var sub = q * price;
      html += '<tr data-clidx="' + idx + '">' +
        '<td><input type="text" data-cl-room="' + l.id + '" value="' + esc(l.room || '') +
        '" placeholder="如 客厅" style="width:150px"></td>' +
        '<td><select data-cl-series="' + l.id + '" style="padding:4px 6px;font-size:12.5px">' +
        CURTAIN_ORDER.map(function (sid) {
          var ss = CURTAIN_SERIES[sid];
          return '<option value="' + sid + '"' + (sid === l.series ? ' selected' : '') +
            '>' + ss.icon + ' ' + ss.name + '</option>';
        }).join('') + '</select></td>' +
        '<td class="ctr"><select data-cl-width="' + l.id + '" style="padding:4px 6px;font-size:12.5px">' +
        curtainWidths(l.series).map(function (x) {
          return '<option value="' + x.w + '"' +
            (parseFloat(x.w) === parseFloat(l.width) ? ' selected' : '') + '>' + x.w + ' 米</option>';
        }).join('') + '</select></td>' +
        '<td class="ctr"><input type="number" min="0" step="1" data-cl-qty="' + l.id + '" value="' +
        (q || '') + '" placeholder="0" style="width:70px;text-align:center"></td>' +
        '<td class="right">¥' + fmt0(price) + '</td>' +
        '<td class="right"><b style="color:var(--green)">' + (sub ? '¥' + fmt0(sub) : '—') + '</b></td>' +
        '<td class="ctr"><button class="btn sm danger" data-cl-del="' + l.id +
        '" style="padding:2px 7px">删</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="row no-print" style="margin-top:10px"><button class="btn sm" id="swCurtainAdd">＋ 增加一行</button>' +
      '<span style="font-size:12px;color:var(--muted);margin-left:8px">不同空间可分别选系列与宽度，按需增删</span></div>';
    box.innerHTML = html;
    bindCurtainInputs(box);

    var total = swCurtainTotal();
    var tEl = $('swCurtainsTotal');
    if (tEl) tEl.textContent = total ? '¥' + fmt0(total) : '—';
  }

  function bindCurtainInputs(box) {
    if (!Array.isArray(SW.curtainLines)) SW.curtainLines = [];
    function findLine(id) {
      for (var i = 0; i < SW.curtainLines.length; i++) {
        if (SW.curtainLines[i].id === id) return SW.curtainLines[i];
      }
      return null;
    }

    /* 空间名：oninput 只存内存，不重绘（保留焦点） */
    box.querySelectorAll('input[data-cl-room]').forEach(function (inp) {
      inp.oninput = function () {
        var l = findLine(inp.dataset.clRoom);
        if (l) l.room = inp.value;
      };
      inp.onblur = function () { swRenderStats(); };
    });

    /* 系列：切换后宽度选项和价格会变，重绘 */
    box.querySelectorAll('select[data-cl-series]').forEach(function (sel) {
      sel.onchange = function () {
        var l = findLine(sel.dataset.clSeries);
        if (!l) return;
        l.series = sel.value;
        var ws = curtainWidths(l.series).map(function (x) { return parseFloat(x.w); });
        if (ws.indexOf(parseFloat(l.width)) < 0) l.width = CURTAIN_DEFAULT_WIDTH;
        swRenderCurtainTable();
        swRenderStats();
      };
    });

    /* 轨道宽度：改了价格跟着报价表走 */
    box.querySelectorAll('select[data-cl-width]').forEach(function (sel) {
      sel.onchange = function () {
        var l = findLine(sel.dataset.clWidth);
        if (!l) return;
        l.width = parseFloat(sel.value);
        swRenderCurtainTable();
        swRenderStats();
      };
    });

    /* 数量：oninput 只存内存，onblur 重绘+统计 */
    box.querySelectorAll('input[data-cl-qty]').forEach(function (inp) {
      inp.oninput = function () {
        var l = findLine(inp.dataset.clQty);
        if (l) l.qty = Math.max(0, parseInt(inp.value, 10) || 0);
      };
      inp.onblur = function () {
        swRenderCurtainTable();
        swRenderStats();
      };
    });

    /* 删除一行 */
    box.querySelectorAll('[data-cl-del]').forEach(function (b) {
      b.onclick = function () {
        SW.curtainLines = SW.curtainLines.filter(function (l) { return l.id !== b.dataset.clDel; });
        swRenderCurtainTable();
        swRenderStats();
      };
    });

    /* 增加一行 */
    var addBtn = $('swCurtainAdd');
    if (addBtn) {
      addBtn.onclick = function () {
        SW.curtainLines.push({
          id: uid('curtain'), room: '', series: CURTAIN_ORDER[0],
          width: CURTAIN_DEFAULT_WIDTH, qty: 0
        });
        swRenderCurtainTable();
        swRenderStats();
      };
    }
  }

  function swCalc() {
    var z = sumSwitchQuote(SW.recs.z1 || []);
    var x = sumSwitchQuote(SW.recs.x30 || []);
    var switchTotal = z.money + x.money;
    var extrasTotal = swExtraTotal();
    var hubSensorPanelTotal = swHubSensorPanelTotal();
    var curtainTotal = swCurtainTotal();
    var lightTotal = swLightTotal();
    var deviceTotal = switchTotal + extrasTotal + curtainTotal + lightTotal;
    var installFee = Math.round(deviceTotal * EXTRA_INSTALL_RATE);
    var include = SW.includeInstall !== false;
    var grandTotal = deviceTotal + (include ? installFee : 0);
    return { z: z, x: x, switchTotal: switchTotal, extrasTotal: extrasTotal,
             hubSensorPanelTotal: hubSensorPanelTotal, curtainTotal: curtainTotal,
             lightTotal: lightTotal,
             deviceTotal: deviceTotal, installFee: installFee, grandTotal: grandTotal };
  }

  function swRenderExtras() {
    EXTRA_ORDER.forEach(function (id) {
      var e = SW.extras[id] || { qty: 0, price: 0 };
      var sub = (Math.max(0, parseInt(e.qty, 10) || 0) * Math.max(0, parseInt(e.price, 10) || 0));
      var el = $('sw' + id[0].toUpperCase() + id.slice(1) + 'Sub');
      if (el) el.textContent = sub ? '¥' + fmt0(sub) : '—';
    });
    var hsp = swHubSensorPanelTotal();
    var hspEl = $('swExtrasTotal');
    if (hspEl) hspEl.textContent = hsp ? '¥' + fmt0(hsp) : '—';
    /* 窗帘合计由 swRenderCurtainTable 自己管，这里不再写，避免两处抢同一个节点 */
  }

  /* ---------- 照明灯具表格渲染（按品类分组） ---------- */
  function swRenderLightTable() {
    var box = $('swLightTable');
    if (!box) return;
    var html = '';
    LIGHT_GROUPS.forEach(function (g) {
      var groupTotal = 0;
      var rows = '';
      g.items.forEach(function (it) {
        var f = LIGHT_FIXTURES[it.id];
        var e = SW.lights[it.id] || { qty: 0, price: f.price, beam: '' };
        var q = Math.max(0, parseInt(e.qty, 10) || 0);
        var pr = Math.max(0, parseInt(e.price, 10) || 0);
        var sub = q * pr;
        groupTotal += sub;

        /* 灯带配套件行：标注自动算的数量依据 */
        var nameCell = '<td>' + f.icon + ' ' + esc(f.name);
        if (g.id === 'accessory') {
          var hint = '';
          if (it.id === 'stripDriverModule') hint = '有双色温灯带时自动配 1 个';
          if (it.id === 'stripPWMTwo') {
            var twoM = sumTwoStripMetersIn(SW.lights);
            hint = twoM ? '双色温 ' + twoM + ' 米，每 10 米 1 个 → ' + Math.ceil(twoM / 10) + ' 个' : '无双色温灯带';
          }
          if (it.id === 'stripPower200') {
            var totalM = sumStripMetersIn(SW.lights);
            var needW = totalM ? Math.ceil(totalM / 10) * 100 : 0;
            hint = totalM ? '共 ' + totalM + ' 米，需 ' + needW + 'W → ' + Math.ceil(needW / 200) + ' 个 200W' : '无灯带';
          }
          nameCell += '<br><span style="font-size:11px;color:var(--green)">' + esc(hint) + '</span>';
        }
        nameCell += '</td>';

        /* 有多档光束角度的，给一个下拉；换档就换报价表价 */
        var beamCell = '<td class="ctr"></td>';
        if (f.beam && f.beam.length > 1) {
          var opts = f.beam.map(function (b) {
            return '<option value="' + esc(b.v) + '"' + (e.beam === b.v ? ' selected' : '') + '>' + esc(b.v) + '</option>';
          }).join('');
          beamCell = '<td class="ctr"><select data-lb="' + it.id + '" style="padding:4px 6px;font-size:12.5px">' + opts + '</select></td>';
        }

        /* 灯带米数和配套件数量由上方明细自动驱动，这里只读 */
        var qtyLocked = (g.id === 'strip' || g.id === 'accessory');
        var qtyInput = qtyLocked
          ? '<span style="display:inline-block;width:70px;text-align:center;font-weight:600">' + (q || 0) + '</span>'
          : '<input type="number" min="0" step="1" data-lq="' + it.id + '" value="' + (q || '') + '" placeholder="0" style="width:70px;text-align:center">';
        rows += '<tr class="' + (q ? 'filled' : '') + '">' +
          nameCell +
          beamCell +
          '<td class="ctr">' + qtyInput + '</td>' +
          '<td class="ctr"><input type="number" min="0" step="1" data-lp="' + it.id + '" ' +
            'value="' + pr + '" style="width:90px;text-align:right"></td>' +
          '<td class="ctr" style="color:var(--muted);font-size:12px">' + f.unit + '</td>' +
          '<td class="right" data-ls="' + it.id + '">' + (sub ? '¥' + fmt0(sub) : '—') + '</td>' +
          '</tr>';
      });
      if (!groupTotal) return;   /* 整组没填数量就不占版面 */
      html += '<div class="sw-block"><div class="sw-block-head">' +
        '<div><b>' + g.icon + ' ' + esc(g.name) + '</b>' +
        '<em>单价取自产品库报价表，可现场改</em></div>' +
        '<div class="sw-block-sum"><span class="money">¥' + fmt0(groupTotal) + '</span></div></div>' +
        '<div class="tbl-wrap"><table class="sw-tbl">' +
        '<thead><tr><th>灯具</th><th class="ctr">角度</th><th class="ctr">数量</th><th class="right">单价</th>' +
        '<th class="ctr">单位</th><th class="right">小计</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div></div>';
    });

    if (!html) {
      /* 没填也把表画出来，方便直接手填 */
      html = '<div class="tbl-wrap"><table class="sw-tbl"><thead><tr><th>灯具</th>' +
        '<th class="ctr">角度</th><th class="ctr">数量</th><th class="right">单价</th>' +
        '<th class="ctr">单位</th><th class="right">小计</th></tr></thead><tbody>' +
        LIGHT_GROUPS.map(function (g) {
          return g.items.map(function (it) {
            var f = LIGHT_FIXTURES[it.id];
            var e = SW.lights[it.id] || { qty: 0, price: f.price, beam: '' };
            var beamCell = '<td class="ctr"></td>';
            if (f.beam && f.beam.length > 1) {
              var opts = f.beam.map(function (b) {
                return '<option value="' + esc(b.v) + '"' + (e.beam === b.v ? ' selected' : '') + '>' + esc(b.v) + '</option>';
              }).join('');
              beamCell = '<td class="ctr"><select data-lb="' + it.id + '" style="padding:4px 6px;font-size:12.5px">' + opts + '</select></td>';
            }
            var qtyLocked2 = (g.id === 'strip' || g.id === 'accessory');
            var qtyInput2 = qtyLocked2
              ? '<span style="display:inline-block;width:70px;text-align:center;font-weight:600">0</span>'
              : '<input type="number" min="0" step="1" data-lq="' + it.id + '" value="" placeholder="0" style="width:70px;text-align:center">';
            return '<tr><td>' + f.icon + ' ' + esc(f.name) + '</td>' + beamCell +
              '<td class="ctr">' + qtyInput2 + '</td>' +
              '<td class="ctr"><input type="number" min="0" step="1" data-lp="' + it.id + '" value="' + (Math.max(0, parseInt(e.price, 10) || 0)) + '" style="width:90px;text-align:right"></td>' +
              '<td class="ctr" style="color:var(--muted);font-size:12px">' + f.unit + '</td>' +
              '<td class="right" data-ls="' + it.id + '">—</td></tr>';
          }).join('');
        }).join('') + '</tbody></table></div>';
    }

    box.innerHTML = html;

    box.querySelectorAll('input[data-lq], input[data-lp]').forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.dataset.lq || inp.dataset.lp;
        if (!SW.lights[id]) SW.lights[id] = { qty: 0, price: LIGHT_FIXTURES[id].price, beam: '' };
        if (inp.dataset.lq != null) {
          SW.lights[id].qty = Math.max(0, parseInt(inp.value, 10) || 0);
        } else {
          SW.lights[id].price = Math.max(0, parseInt(inp.value, 10) || 0);
        }
        swRenderLightTable();
        swRenderStats();
      };
    });

    /* 换光束角度 → 单价跟着报价表走 */
    box.querySelectorAll('select[data-lb]').forEach(function (sel) {
      sel.onchange = function () {
        var id = sel.dataset.lb;
        if (!SW.lights[id]) SW.lights[id] = { qty: 0, price: LIGHT_FIXTURES[id].price, beam: '' };
        SW.lights[id].beam = sel.value;
        SW.lights[id].price = lightPriceAt(id, sel.value);
        swRenderLightTable();
        swRenderStats();
      };
    });

    var total = swLightTotal();
    var tEl = $('swLightsTotal');
    if (tEl) tEl.textContent = total ? '¥' + fmt0(total) : '—';
  }

  /* ---------- 灯带空间明细渲染（v1.22） ---------- */
  function swRenderStripLines() {
    var box = $('swStripLines');
    if (!box) return;
    if (!Array.isArray(SW.stripLines)) SW.stripLines = [];
    var opts = (LIGHT_GROUPS.filter(function (g) { return g.id === 'strip'; })[0] || { items: [] }).items
      .map(function (it) {
        var f = LIGHT_FIXTURES[it.id];
        return '<option value="' + it.id + '">' + f.icon + ' ' + esc(f.name) + '（¥' + f.price + '/米）</option>';
      }).join('');

    var html = '<div class="tbl-wrap"><table class="sw-tbl">' +
      '<thead><tr><th>空间</th><th>灯带型号</th><th class="ctr">米数</th><th class="right">小计</th><th class="ctr no-print">操作</th></tr></thead><tbody>';
    var grand = 0;
    SW.stripLines.forEach(function (line, idx) {
      var f = LIGHT_FIXTURES[line.modelId] || LIGHT_FIXTURES.stripTwo;
      var m = Math.max(0, parseFloat(line.meters) || 0);
      var sub = Math.round(m * f.price);
      grand += sub;
      html += '<tr>' +
        '<td><input type="text" data-sl-r="' + idx + '" value="' + esc(line.room || '') + '" placeholder="如：客厅" style="width:120px"></td>' +
        '<td><select data-sl-m="' + idx + '" style="min-width:220px">' +
          opts.replace('value="' + line.modelId + '"', 'value="' + line.modelId + '" selected') + '</select></td>' +
        '<td class="ctr"><input type="number" min="0" step="0.5" data-sl-l="' + idx + '" value="' + (m || '') + '" placeholder="0" style="width:80px;text-align:center"></td>' +
        '<td class="right">' + (sub ? '¥' + fmt0(sub) : '—') + '</td>' +
        '<td class="ctr no-print"><button class="btn sm" data-sl-d="' + idx + '">删除</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    if (!SW.stripLines.length) {
      html = '<div class="notice">还没有灯带空间。点击右上角「增加一行」或「从房间清单带入」开始添加。</div>';
    }

    /* 配套件汇总提示 */
    var acc = calculateStripAccessories(SW.stripLines);
    var twoM = SW.stripLines.filter(function (x) { return x.modelId === 'stripTwo'; })
                            .reduce(function (s, x) { return s + (parseFloat(x.meters) || 0); }, 0);
    var totalM = SW.stripLines.reduce(function (s, x) { return s + (parseFloat(x.meters) || 0); }, 0);
    var powerW = totalM ? Math.ceil(totalM / 10) * 100 : 0;
    html += '<div class="notice" style="margin-top:12px">' +
      '灯带合计 <b>' + totalM + ' 米</b>' + (grand ? '，灯带小计 ¥' + fmt0(grand) : '');
    if (acc.stripDriverModule) {
      var dPrice = LIGHT_FIXTURES.stripDriverModule ? LIGHT_FIXTURES.stripDriverModule.price : 0;
      html += '　·　智能灯带驱动模块 <b>' + acc.stripDriverModule + '</b> 个 × ¥' + dPrice + ' = <b>¥' + fmt0(acc.stripDriverModule * dPrice) + '</b>';
    }
    if (acc.stripPWMTwo) {
      var pPrice = LIGHT_FIXTURES.stripPWMTwo ? LIGHT_FIXTURES.stripPWMTwo.price : 0;
      html += '　·　双色温 PWM 调光模块 <b>' + acc.stripPWMTwo + '</b> 个 × ¥' + pPrice + ' = <b>¥' + fmt0(acc.stripPWMTwo * pPrice) + '</b>（双色温 ' + twoM + ' 米，每 10 米 1 个）';
    }
    if (acc.stripPower200) {
      var wPrice = LIGHT_FIXTURES.stripPower200 ? LIGHT_FIXTURES.stripPower200.price : 0;
      html += '　·　200W 电源 <b>' + acc.stripPower200 + '</b> 个 × ¥' + wPrice + ' = <b>¥' + fmt0(acc.stripPower200 * wPrice) + '</b>（需 ' + powerW + 'W）';
    }
    html += '</div>';

    box.innerHTML = html;

    /* 绑定事件
       文本/数字输入框：输入过程中只更新内存并同步统计，失焦后再重绘表格，
       避免每输入一个字符就重新创建 input 导致焦点丢失、连续输入中断。 */
    box.querySelectorAll('input[data-sl-r], input[data-sl-l]').forEach(function (inp) {
      inp.oninput = function () {
        var idx = parseInt(this.dataset.slR != null ? this.dataset.slR : this.dataset.slL, 10);
        var line = SW.stripLines[idx];
        if (!line) return;
        if (this.dataset.slR != null) line.room = this.value;
        if (this.dataset.slL != null) line.meters = Math.max(0, parseFloat(this.value) || 0);
        swSyncStripAccessories();
        swRenderLightTable();
        swRenderStats();
      };
      inp.onblur = function () { swRenderStripLines(); };
      /* 回车也触发重绘，方便用户立即看到汇总刷新 */
      inp.onkeydown = function (e) { if (e.key === 'Enter') this.blur(); };
    });
    box.querySelectorAll('select[data-sl-m]').forEach(function (inp) {
      inp.onchange = function () {
        var idx = parseInt(this.dataset.slM, 10);
        var line = SW.stripLines[idx];
        if (!line) return;
        line.modelId = this.value;
        swSyncStripAccessories();
        swRenderStripLines();
        swRenderLightTable();
        swRenderStats();
      };
    });
    box.querySelectorAll('button[data-sl-d]').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.dataset.slD, 10);
        SW.stripLines.splice(idx, 1);
        swSyncStripAccessories();
        swRenderStripLines();
        swRenderLightTable();
        swRenderStats();
      };
    });
  }

  function swAddStripLine(room, modelId, meters) {
    if (!Array.isArray(SW.stripLines)) SW.stripLines = [];
    SW.stripLines.push({
      id: uid('strip'),
      room: room || '',
      modelId: modelId || 'stripTwo',
      meters: Math.max(0, parseFloat(meters) || 0)
    });
    swSyncStripAccessories();
    swRenderStripLines();
    swRenderLightTable();
    swRenderStats();
  }

  /* ---------- 按房间带入灯具（v1.16） ---------- */
  function swLightSrcRooms() {
    return (S && S.rooms) ? S.rooms : [];
  }

  function swRenderLightSrcInfo() {
    var el = $('swLightSrcInfo');
    if (!el) return;
    var rooms = swLightSrcRooms();
    var withArea = rooms.filter(function (r) { return (parseFloat(r.area) || 0) > 0; }).length;
    if (!rooms.length) {
      el.style.display = '';
      el.innerHTML = '还没填房间清单。去第 1 步「户型与图纸」的房间表里填面积，再回来带入。';
      return;
    }
    el.style.display = '';
    el.innerHTML = '房间清单共 <b>' + rooms.length + '</b> 个空间，其中 <b>' + withArea +
      '</b> 个填了面积。' + (withArea < rooms.length ? '没填面积的空间会按下限给最少数量。' : '') +
      ' 选好密度档和门店铺，点「带入」。';
  }

  function swLightPlanPreview() {
    var box = $('swLightPlan');
    if (!box) return;
    var rooms = swLightSrcRooms();
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }
    var plan = planLightsFromRooms(rooms, $('swLightStrategy').value);
    var sum = sumLightPlan(plan);

    var html = '<div class="tbl-wrap"><table class="sw-tbl">' +
      '<thead><tr><th style="width:150px">空间</th><th class="right">面积</th>' +
      '<th class="ctr">建议灯具</th><th class="ctr">数量</th></tr></thead><tbody>';
    plan.forEach(function (x) {
      var kindLabel = Object.keys(x.plan).map(function (k) {
        return k === 'spot' ? '🔦 射灯' : '💡 筒灯';
      }).join('+');
      var n = Object.keys(x.plan).reduce(function (a, k) { return a + x.plan[k]; }, 0);
      html += '<tr><td>' + x.icon + ' ' + esc(x.roomName) + '</td>' +
        '<td class="right">' + (x.area ? x.area + '㎡' : '—') + '</td>' +
        '<td class="ctr">' + kindLabel + '</td>' +
        '<td class="ctr"><b style="color:var(--green)">' + n + '</b></td></tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="notice" style="margin-top:10px">合计建议：' +
      (sum.spot ? '🔦 射灯 <b>' + sum.spot + '</b> 个' : '') +
      (sum.spot && sum.down ? '　' : '') +
      (sum.down ? '💡 筒灯 <b>' + sum.down + '</b> 个' : '') +
      '　<span style="color:var(--muted)">密度：' +
      esc(LIGHT_STRATEGY[$('swLightStrategy').value].name) + '</span></div>';

    box.innerHTML = html;
    box.style.display = '';
  }

  function swApplyLightPlan() {
    var rooms = swLightSrcRooms();
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }
    var modelId = $('swLightModel').value;
    var beam = $('swLightBeam').value || '';
    var plan = planLightsFromRooms(rooms, $('swLightStrategy').value);
    var sum = sumLightPlan(plan);
    /* 带入的只是一份草稿，按空间类型挑对应品类填进去 */
    var kind2model = { spot: modelId, down: modelId };
    var added = 0;
    ['spot', 'down'].forEach(function (kind) {
      var n = sum[kind] || 0;
      if (!n) return;
      var id = kind2model[kind];
      if (!id || !LIGHT_FIXTURES[id]) return;
      if (!SW.lights[id]) SW.lights[id] = { qty: 0, price: LIGHT_FIXTURES[id].price, beam: '' };
      SW.lights[id].qty = (parseInt(SW.lights[id].qty, 10) || 0) + n;
      if (beam) {
        SW.lights[id].beam = beam;
        SW.lights[id].price = lightPriceAt(id, beam);
      }
      added += n;
    });
    if (!added) { toast('没算出数量，检查一下面积'); return; }
    swRenderLightTable();
    swRenderStats();
    toast('已带入 ' + added + ' 个灯具，记得核对');
  }

  /* ---------- 灯带空间明细预览（v1.22） ---------- */
  function swStripPlanPreview() {
    var box = $('swStripPlan');
    if (!box) return;
    var rooms = swLightSrcRooms();
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }
    var plan = planStripsFromRooms(rooms, $('swStripStrategy').value);
    var total = sumStripMeters(plan);
    var stripId = $('swStripModel').value;
    var strip = LIGHT_FIXTURES[stripId];

    var html = '<div class="tbl-wrap"><table class="sw-tbl">' +
      '<thead><tr><th style="width:150px">空间</th><th class="right">面积</th>' +
      '<th class="right">周长</th><th class="right">灯带</th></tr></thead><tbody>';
    plan.forEach(function (x) {
      html += '<tr><td>' + x.icon + ' ' + esc(x.roomName) + '</td>' +
        '<td class="right">' + (x.area ? x.area + '㎡' : '—') + '</td>' +
        '<td class="right">' + x.peri.toFixed(1) + ' 米' +
          (x.periFromArea ? '<br><span style="font-size:11px;color:var(--muted)">按面积估</span>' : '') + '</td>' +
        '<td class="right"><b style="color:var(--green)">' + x.meters + ' 米</b></td></tr>';
    });
    html += '</tbody></table></div>';

    /* 试算总价与配套件 */
    var acc = calculateStripAccessories(plan.map(function (x) { return { modelId: stripId, meters: x.meters }; }));
    var stripMoney = total * (strip ? strip.price : 0);
    var pwmMoney = acc.stripPWMTwo * (LIGHT_FIXTURES.stripPWMTwo ? LIGHT_FIXTURES.stripPWMTwo.price : 0);
    var drvMoney = acc.stripDriverModule * (LIGHT_FIXTURES.stripDriverModule ? LIGHT_FIXTURES.stripDriverModule.price : 0);
    var powerMoney = acc.stripPower200 * (LIGHT_FIXTURES.stripPower200 ? LIGHT_FIXTURES.stripPower200.price : 0);
    var totalMoney = stripMoney + pwmMoney + drvMoney + powerMoney;
    html += '<div class="notice" style="margin-top:10px">' +
      '合计 <b>' + total + ' 米</b>' + (strip ? '　× ¥' + strip.price + '/米 = <b>¥' + fmt0(stripMoney) + '</b>' : '');
    if (acc.stripDriverModule) {
      html += '<br>智能灯带驱动模块 <b>' + acc.stripDriverModule + '</b> 个 × ¥' + LIGHT_FIXTURES.stripDriverModule.price + ' = <b>¥' + fmt0(drvMoney) + '</b>';
    }
    if (acc.stripPWMTwo) {
      html += '<br>双色温 PWM 调光模块 <b>' + acc.stripPWMTwo + '</b> 个 × ¥' + LIGHT_FIXTURES.stripPWMTwo.price + ' = <b>¥' + fmt0(pwmMoney) + '</b>';
    }
    if (acc.stripPower200) {
      html += '<br>200W 电源 <b>' + acc.stripPower200 + '</b> 个 × ¥' + LIGHT_FIXTURES.stripPower200.price + ' = <b>¥' + fmt0(powerMoney) + '</b>';
    }
    html += '<br><b>灯带小计 ¥' + fmt0(totalMoney) + '</b>' +
      '</div>';

    box.innerHTML = html;
    box.style.display = '';
  }

  function swApplyStripPlan() {
    var rooms = swLightSrcRooms();
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }
    var stripId = $('swStripModel').value;
    if (!LIGHT_FIXTURES[stripId]) { toast('先选灯带型号'); return; }

    var plan = planStripsFromRooms(rooms, $('swStripStrategy').value);
    var meters = sumStripMeters(plan);
    if (!meters) { toast('没算出米数，检查一下面积/周长'); return; }

    swInitLights();
    /* 每个有米数的空间生成一行明细 */
    plan.forEach(function (x) {
      if (!x.meters) return;
      SW.stripLines.push({
        id: uid('strip'),
        room: x.roomName,
        modelId: stripId,
        meters: Math.round(x.meters * 2) / 2
      });
    });
    swSyncStripAccessories();

    swRenderStripLines();
    swRenderLightTable();
    swRenderStats();
    var acc = calculateStripAccessories(SW.stripLines);
    toast('已带入 ' + SW.stripLines.length + ' 条灯带明细，配套件已自动计算');
  }

  /* 从报价表挑灯具 → 写进 SW.lights */
  function swPickLightFromQuote(prod) {
    var id = 'q_' + prodKeyLite(prod);
    if (!LIGHT_FIXTURES[id]) {
      LIGHT_FIXTURES[id] = {
        id: id, name: prod.type, unit: prod.unit || '个', icon: '💡',
        group: 'custom', groupName: '报价表自选',
        price: Math.round(prod.price || 0), match: prod.type
      };
      LIGHT_ORDER.push(id);
    }
    if (!SW.lights[id]) SW.lights[id] = { qty: 1, price: LIGHT_FIXTURES[id].price };
    else SW.lights[id].qty = Math.max(1, parseInt(SW.lights[id].qty, 10) || 1);
    swRenderLightTable();
    swRenderStats();
    toast('已加入：' + prod.type);
  }
  function prodKeyLite(p) {
    return String(p.src || '') + '|' + String(p.type || '') + '|' + String(p.name || '');
  }

  /* ---------- 从报价表选灯具弹窗（v1.15.0） ---------- */
  function swOpenLightPicker() {
    var mask = $('lightMask');
    if (!mask) return;
    mask.classList.add('show');
    $('lpSearch').value = '';
    swRenderLightPickList('');
    setTimeout(function () { $('lpSearch').focus(); }, 60);
  }
  function swRenderLightPickList(kw) {
    var box = $('lpList');
    if (!box) return;
    var list = quoteTableLights(kw);
    $('lpInfo').textContent = '共 ' + list.length + ' 款灯具（来自报价表）';
    box.innerHTML = list.map(function (p, i) {
      return '<div class="pick-item" data-lpi="' + i + '">' +
        '<div class="t">' + esc(p.type) + ' <span class="nm">' + esc(p.src || '') + '</span></div>' +
        '<div class="p">¥' + fmt0(p.price) + ' / ' + esc(p.unit || '个') + '</div>' +
        (p.spec ? '<div class="s">' + esc(p.spec) + '</div>' : '') +
        '</div>';
    }).join('') || '<div class="empty small">没找到匹配的灯具</div>';
    box.querySelectorAll('[data-lpi]').forEach(function (it) {
      it.onclick = function () {
        var p = list[+it.dataset.lpi];
        if (p) swPickLightFromQuote(p);
      };
    });
  }
  function swBindLightPicker() {
    var mask = $('lightMask');
    if (!mask) return;
    $('lpClose').onclick = function () { mask.classList.remove('show'); };
    mask.onclick = function (e) { if (e.target === mask) mask.classList.remove('show'); };
    $('lpSearch').oninput = function () { swRenderLightPickList($('lpSearch').value); };
  }

  /* ---------- 电动窗帘 · 从报价表选（v1.18） ---------- */
  /* 把报价表里一条窗帘，反查成「哪个系列 + 几米宽」 */
  function curtainMatchProd(prod) {
    var type = prod.type || '';
    for (var i = 0; i < CURTAIN_ORDER.length; i++) {
      var sid = CURTAIN_ORDER[i];
      var s = CURTAIN_SERIES[sid];
      for (var j = 0; j < s.widths.length; j++) {
        if (type === s.widths[j].match) return { series: sid, width: s.widths[j].w };
      }
    }
    return null;
  }

  function swOpenCurtainPicker() {
    var mask = $('curtainMask');
    if (!mask) return;
    mask.classList.add('show');
    $('cpSearch').value = '';
    swRenderCurtainPickList('');
    setTimeout(function () { $('cpSearch').focus(); }, 60);
  }

  function swRenderCurtainPickList(kw) {
    var box = $('cpList');
    if (!box) return;
    var list = quoteTableCurtains(kw);
    $('cpInfo').textContent = '共 ' + list.length + ' 款电动窗帘（来自报价表，含轨道）';
    if (!list.length) {
      box.innerHTML = '<div class="empty small">没找到匹配的窗帘</div>';
      return;
    }
    box.innerHTML = list.map(function (p, i) {
      var hit = curtainMatchProd(p);
      var tag = hit ? '<span class="nm"> · ' + hit.width + ' 米</span>' : '';
      return '<div class="pick-item" data-cpi="' + i + '">' +
        '<div class="t">' + esc(p.type) + tag + '</div>' +
        '<div class="p">¥' + fmt0(p.price) + ' / 套（电机+轨道）</div>' +
        (p.spec ? '<div class="s">' + esc(p.spec) + '</div>' : '') +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-cpi]').forEach(function (it) {
      it.onclick = function () {
        var p = list[+it.dataset.cpi];
        if (!p) return;
        var hit = curtainMatchProd(p);
        if (!hit) { toast('这个型号还没归到系列里，先手填数量'); return; }
        SW.curtainLines = SW.curtainLines || [];
        SW.curtainLines.push({
          id: uid('curtain'), room: '', series: hit.series, width: hit.width, qty: 1
        });
        swRenderCurtainTable();
        swRenderStats();
        toast('已加入 ' + CURTAIN_SERIES[hit.series].name + ' ' + hit.width + ' 米');
      };
    });
  }

  function swBindCurtainPicker() {
    var mask = $('curtainMask');
    if (!mask) return;
    $('cpClose').onclick = function () { mask.classList.remove('show'); };
    mask.onclick = function (e) { if (e.target === mask) mask.classList.remove('show'); };
    $('cpSearch').oninput = function () { swRenderCurtainPickList($('cpSearch').value); };
  }

  /* ---------- 电动窗帘 · 按房间清单带入（v1.20） ----------
     规则直接复用 data.js 的 curtainQty：单轨 × 窗位，双轨 × 窗位 × 2。
     双轨归「智能罗马杆」，单轨归「智能窗帘」。 */
  function swCurtainPullPlan() {
    var rooms = (S && S.rooms) ? S.rooms : [];
    var singleSel = ($('swCurtainPullSingle') || {}).value || 'E1|4';
    var dualSel = ($('swCurtainPullDual') || {}).value || 'C200|5';

    var plan = [];
    rooms.forEach(function (r) {
      var n = curtainQty(r);          /* 0 = 不做窗帘 */
      if (!n) return;
      var dual = r.track === 'dual';
      var sel = dual ? dualSel : singleSel;
      var parts = String(sel).split('|');
      plan.push({
        roomName: r.name || '空间',
        qty: n, dual: dual, trackName: (TRACKS[r.track] || {}).name || '',
        series: parts[0], width: parseFloat(parts[1]),
        price: curtainPriceAt(parts[0], parts[1])
      });
    });
    return plan;
  }

  function swRenderCurtainPullPreview() {
    var box = $('swCurtainPullPlan');
    if (!box) return;
    var rooms = (S && S.rooms) ? S.rooms : [];
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }

    var plan = swCurtainPullPlan();
    if (!plan.length) {
      box.innerHTML = '<div class="notice" style="margin:10px 0 0">' +
        '房间清单里<b>没有空间勾电动窗帘</b>。去第 1 步房间表把「窗帘」列改成「单轨」或「双轨」，这里就能算了。</div>';
      box.style.display = '';
      return;
    }

    var html = '<div class="tbl-wrap" style="margin-top:10px"><table class="sw-tbl">' +
      '<thead><tr><th>空间</th><th class="ctr">轨道</th><th class="ctr">套数</th>' +
      '<th class="ctr">型号</th><th class="right">单价</th><th class="right">小计</th></tr></thead><tbody>';
    var total = 0;
    plan.forEach(function (x) {
      var sub = x.qty * x.price;
      total += sub;
      var s = CURTAIN_SERIES[x.series];
      html += '<tr class="filled"><td>' + esc(x.roomName) + '</td>' +
        '<td class="ctr">' + (x.dual ? '双轨' : '单轨') + '</td>' +
        '<td class="ctr"><b style="color:var(--green)">' + x.qty + '</b></td>' +
        '<td class="ctr">' + esc(s ? s.name : x.series) + ' ' + x.width + '米</td>' +
        '<td class="right">¥' + fmt0(x.price) + '</td>' +
        '<td class="right">¥' + fmt0(sub) + '</td></tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="notice" style="margin-top:10px">合计 <b>' +
      plan.reduce(function (a, x) { return a + x.qty; }, 0) + ' 套</b>，小计 <b>¥' +
      fmt0(total) + '</b>。宽度按默认值算，现场按实际窗宽改。</div>';
    box.innerHTML = html;
    box.style.display = '';
  }

  function swApplyCurtainPull() {
    var rooms = (S && S.rooms) ? S.rooms : [];
    if (!rooms.length) { toast('先在第 1 步填房间清单'); return; }
    var plan = swCurtainPullPlan();
    if (!plan.length) { toast('没有空间勾电动窗帘，先去第 1 步设置'); return; }

    var n = 0;
    plan.forEach(function (x) {
      SW.curtainLines = SW.curtainLines || [];
      SW.curtainLines.push({
        id: uid('curtain'), room: x.roomName, series: x.series, width: x.width, qty: x.qty
      });
      n += x.qty;
    });
    swRenderCurtainTable();
    swRenderStats();
    toast('已带入 ' + n + ' 套窗帘（' + plan.length + ' 个空间）');
  }

  function swRec(mid, roomId, key) {
    var a = SW.recs[mid] || [];
    for (var i = 0; i < a.length; i++) {
      if (a[i].room === roomId && a[i].key === key) return a[i];
    }
    return null;
  }

  function swAllRecs() {
    return (SW.recs.z1 || []).concat(SW.recs.x30 || []);
  }

  /* ---------- 从房间清单带入开关数量 ---------- */

  /* 房间表里哪些空间填了开关数 */
  function swSourceRooms() {
    return (S.rooms || []).map(function (r) {
      return { type: r.type, name: r.name, sw: r.sw };
    });
  }

  function swRenderSrcInfo() {
    var box = $('swSrcInfo');
    if (!box) return;
    var src = swSourceRooms();
    var filled = src.filter(function (r) { return Math.max(0, parseInt(r.sw, 10) || 0) > 0; });
    if (!filled.length) {
      box.innerHTML = '还没填房间清单的开关数量。' +
        '去第 1 步「户型与图纸」的房间表里，在「开关」列填个数，再回来点带入。';
      box.classList.add('warn');
      return;
    }
    box.classList.remove('warn');
    var total = filled.reduce(function (a, r) { return a + Math.max(0, parseInt(r.sw, 10) || 0); }, 0);
    var st = $('swStrategy');
    var stName = st && st.options[st.selectedIndex] ? st.options[st.selectedIndex].text : '';
    box.innerHTML = '读到 <b>' + filled.length + '</b> 个空间的开关数量，合计 <b>' + total + '</b> 面：' +
      filled.map(function (r) { return esc(r.name) + ' ' + r.sw; }).join('、') +
      '。<br>当前策略「<b>' + esc(stName) + '</b>」，点「带入」会按这个策略摊到各按键上。';
  }

  /* 生成带入计划，不落库，用来看一眼怎么分 */
  function swPlan() {
    var st = $('swStrategy') ? $('swStrategy').value : 'smart';
    return planSwitchFromRooms(swSourceRooms(), st);
  }

  /* 预览：把分配结果画成小表 */
  function swRenderPlan() {
    var box = $('swPullPlan');
    if (!box) return;
    var plan = swPlan();
    if (!plan.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    var st = $('swStrategy').value;
    var rows = plan.map(function (p) {
      var tds = SWITCH_KEY_ORDER.map(function (k) {
        return '<td class="ctr">' + (p.alloc[k] || 0) + '</td>';
      }).join('');
      return '<tr>' +
        '<td>' + p.icon + ' ' + esc(p.roomName) + '</td>' + tds +
        '<td class="right"><b>' + p.total + '</b></td></tr>';
    }).join('');
    var sumK = {};
    SWITCH_KEY_ORDER.forEach(function (k) {
      sumK[k] = plan.reduce(function (a, p) { return a + (p.alloc[k] || 0); }, 0);
    });
    var sumCells = SWITCH_KEY_ORDER.map(function (k) {
      return '<td class="ctr"><b>' + sumK[k] + '</b></td>';
    }).join('');
    var grand = plan.reduce(function (a, p) { return a + p.total; }, 0);

    box.style.display = '';
    box.innerHTML =
      '<div class="sub" style="margin:6px 0 8px">按「' +
      esc((SWITCH_STRATEGY[st] || {}).name || st) + '」分配后：' +
      esc((SWITCH_STRATEGY[st] || {}).desc || '') + '</div>' +
      '<div class="tbl-wrap"><table class="sw-tbl"><thead><tr><th style="width:180px">空间</th>' +
      SWITCH_KEY_ORDER.map(function (k) {
        var m = switchModel('z1');
        var kd = m.keys.filter(function (x) { return x.k === k; })[0];
        return '<th class="ctr">' + kd.name + '<em>¥' + kd.price + '</em></th>';
      }).join('') +
      '<th class="right">合计</th></tr></thead><tbody>' + rows +
      '<tr class="room-sep"><td>合计</td>' + sumCells +
      '<td class="right"><b>' + grand + '</b></td></tr>' +
      '</tbody></table></div>';
  }

  /* 真落库：把 plan 写进指定型号的 recs */
  function swApplyPlan(target) {
    var plan = swPlan();
    if (!plan.length) { toast('房间清单里还没填开关数量'); return; }

    var mids = target === 'both' ? ['z1', 'x30'] : [target];
    var skipped = 0, written = 0;

    mids.forEach(function (mid) {
      if (!SW.recs[mid]) SW.recs[mid] = blankSwitchRecs(mid);
      plan.forEach(function (p) {
        if (!p.matched) { skipped++; return; }
        SWITCH_KEY_ORDER.forEach(function (k) {
          var r = swRec(mid, p.roomId, k);
          if (r) r.qty = p.alloc[k] || 0;
        });
        written++;
      });
    });

    swRenderTables();
    swRenderStats();

    var nm = mids.length > 1 ? '两个型号' : switchModel(mids[0]).name;
    toast('已带入 ' + written + ' 个空间 → ' + nm);
    if (skipped) {
      /* 自定义空间（如「影音室」认不出来）没有对应的报价行，单独提示 */
      var odd = plan.filter(function (p) { return !p.matched; });
      setTimeout(function () {
        modalBox({
          title: '有 ' + odd.length + ' 个空间没能带入',
          fields: [],
          okText: '知道了', cancelText: '关闭',
          onOk: function () {}
        });
        var b = document.querySelector('.modal-body');
        if (b) {
          b.innerHTML = '下面这些空间在报价表里没有对应的行，需要手动填：<br>' +
            odd.map(function (p) {
              return '<b>' + esc(p.roomName) + '</b>（' + p.total + ' 面）';
            }).join('、') +
            '<br><br>原因：报价表用的是固定空间名（客厅/主卧/…），这些空间名识别不出来。' +
            '可以在报价表「其他」行里手动填，或回第 1 步点空间名右边的 ▾ 指定类型。';
        }
      }, 700);
    }
  }

  function swRenderTables() {
    var box = $('swTables');
    if (!box) return;
    var models = ['z1', 'x30'];
    var html = '';

    models.forEach(function (mid) {
      var m = switchModel(mid);
      var s = sumSwitchQuote(SW.recs[mid] || []);
      html += '<div class="sw-block">' +
        '<div class="sw-block-head">' +
        '<div><b>' + esc(m.name) + '</b>' +
        '<em>' + esc(m.pitch) + '</em></div>' +
        '<div class="sw-block-sum">' +
        (s.qty ? ('<span class="cnt">' + s.qty + ' 面</span><span class="money">¥' + fmt0(s.money) + '</span>')
               : '<span class="cnt">未填数量</span>') +
        '</div></div>';

      var hasCustom = allSwitchRooms().some(function (r) { return r.custom; });
      html += '<div class="tbl-wrap"><table class="sw-tbl">' +
        '<thead><tr><th style="width:130px">空间</th>';
      m.keys.forEach(function (kd) {
        html += '<th class="ctr">' + kd.name + '<em>¥' + kd.price + '</em></th>';
      });
      html += '<th class="right">小计</th>' +
        (hasCustom ? '<th class="ctr" style="width:52px">删</th>' : '') + '</tr></thead><tbody>';

      allSwitchRooms().forEach(function (rm) {
        var rowTotal = 0;
        var qtyHtml = '';
        m.keys.forEach(function (kd) {
          var r = swRec(mid, rm.id, kd.k);
          var q = r ? r.qty : 0;
          rowTotal += q * kd.price;
          qtyHtml += '<td class="ctr"><input type="number" min="0" step="1" ' +
            'data-sw="' + mid + '" data-room="' + rm.id + '" data-key="' + kd.k + '" ' +
            'value="' + (q || '') + '" placeholder="0"></td>';
        });
        /* 整行都是 0 就不高亮，填了的面淡绿底，一眼看出装了哪些 */
        /* 自定义空间在最后一行带删除按钮 */
        var delBtn = rm.custom
          ? '<td class="ctr"><button class="btn sm danger" data-delroom="' + esc(rm.id) + '" ' +
            'title="删除这个空间" style="padding:2px 8px;line-height:1.4">×</button></td>'
          : '';
        html += '<tr class="' + (rowTotal ? 'filled' : '') + '">' +
          '<td>' + rm.icon + ' ' + esc(rm.name) + (rm.custom ? ' <span class="cusTag">自加</span>' : '') + '</td>' + qtyHtml +
          '<td class="right sub-cell" data-swsub="' + mid + '-' + rm.id + '">' +
          (rowTotal ? '¥' + fmt0(rowTotal) : '—') + '</td>' + delBtn + '</tr>';
      });

      /* 合计行 */
      html += '<tr class="room-sep"><td>合计</td>';
      m.keys.forEach(function (kd) {
        var bk = s.byKey[mid] && s.byKey[mid][kd.k];
        html += '<td class="ctr">' + (bk ? bk.qty + ' 面' : '—') + '</td>';
      });
      html += '<td class="right" style="color:#C2410C;font-weight:700">¥' + fmt0(s.money) + '</td>' +
        (hasCustom ? '<td></td>' : '') + '</tr>';

      html += '</tbody></table></div></div>';
    });

    box.innerHTML = html;

    box.querySelectorAll('input[data-sw]').forEach(function (inp) {
      inp.oninput = function () {
        var r = swRec(inp.dataset.sw, inp.dataset.room, +inp.dataset.key);
        if (r) r.qty = Math.max(0, parseInt(inp.value, 10) || 0);
        swRefreshRow(inp);
      };
    });

    /* 删除自定义空间（v1.21）：两个型号的记录一起清掉，再重画 */
    box.querySelectorAll('button[data-delroom]').forEach(function (b) {
      b.onclick = function () {
        var rid = b.dataset.delroom;
        var room = null;
        for (var i = 0; i < SWITCH_CUSTOM_ROOMS.length; i++) {
          if (SWITCH_CUSTOM_ROOMS[i].id === rid) room = SWITCH_CUSTOM_ROOMS[i];
        }
        if (!room) return;
        ['z1', 'x30'].forEach(function (mid) {
          SW.recs[mid] = (SW.recs[mid] || []).filter(function (r) { return r.room !== rid; });
        });
        removeCustomRoom(rid);
        swRenderTables();
        swRenderStats();
        toast('已删除空间：' + room.name);
      };
    });
  }

  /* 改一个格子，只刷新受影响的那一行和汇总，不重渲染整表（否则会丢焦点） */
  function swRefreshRow(inp) {
    var mid = inp.dataset.sw, roomId = inp.dataset.room;
    var m = switchModel(mid);
    var tr = inp.closest('tr');
    var rowTotal = 0;
    tr.querySelectorAll('input[data-sw]').forEach(function (x) {
      var r = swRec(x.dataset.sw, x.dataset.room, +x.dataset.key);
      rowTotal += (r ? r.qty : 0) * switchPrice(mid, +x.dataset.key);
    });
    var sub = tr.querySelector('[data-swsub]');
    if (sub) sub.textContent = rowTotal ? '¥' + fmt0(rowTotal) : '—';
    tr.classList.toggle('filled', rowTotal > 0);
    swRenderStats();
  }

  function swRenderStats() {
    var box = $('swStats');
    if (!box) return;
    swRenderExtras();
    var c = swCalc();
    var html = '';

    html += '<div class="sum-box"><div class="k">绿米 Z1</div>' +
      '<div class="v">' + (c.z.qty ? c.z.qty + ' 面' : '—') + '</div>' +
      '<div class="n">合计 ¥' + fmt0(c.z.money) + '</div></div>';

    html += '<div class="sum-box"><div class="k">米家 X30</div>' +
      '<div class="v">' + (c.x.qty ? c.x.qty + ' 面' : '—') + '</div>' +
      '<div class="n">合计 ¥' + fmt0(c.x.money) + '</div></div>';

    /* 两个都填了 → 给差价，帮客户做决定 */
    if (c.z.qty && c.x.qty) {
      var diff = c.z.money - c.x.money;
      html += '<div class="sum-box"><div class="k">Z1 比 X30</div>' +
        '<div class="v ' + (diff > 0 ? 'orange' : '') + '">' +
        (diff > 0 ? '+¥' + fmt0(diff) : diff < 0 ? '¥' + fmt0(diff) : '相同') + '</div>' +
        '<div class="n">' + (diff > 0 ? 'Z1 贵，建议主用 X30 + 客厅用 Z1'
             : diff < 0 ? 'X30 更便宜，适合整屋批量' : '两型号同价') + '</div></div>';
    }

    if (c.switchTotal) {
      html += '<div class="sum-box"><div class="k">开关设备合计</div>' +
        '<div class="v">¥' + fmt0(c.switchTotal) + '</div>' +
        '<div class="n">开关面板设备费</div></div>';
    }

    if (c.hubSensorPanelTotal) {
      html += '<div class="sum-box"><div class="k">网关/传感器/中控屏</div>' +
        '<div class="v">¥' + fmt0(c.hubSensorPanelTotal) + '</div>' +
        '<div class="n">网关、传感器、中控屏合计</div></div>';
    }

    if (c.curtainTotal) {
      html += '<div class="sum-box"><div class="k">电动窗帘</div>' +
        '<div class="v">¥' + fmt0(c.curtainTotal) + '</div>' +
        '<div class="n">' + swCurtainRows().reduce(function (a, r) { return a + r.qty; }, 0) +
        ' 套（电机+轨道）</div></div>';
    }

    if (c.lightTotal) {
      html += '<div class="sum-box"><div class="k">照明灯具</div>' +
        '<div class="v">¥' + fmt0(c.lightTotal) + '</div>' +
        '<div class="n">单价取自报价表</div></div>';
    }

    if (c.deviceTotal) {
      html += '<div class="sum-box"><div class="k">设备费合计</div>' +
        '<div class="v">¥' + fmt0(c.deviceTotal) + '</div>' +
        '<div class="n">开关 + 网关/传感器/中控屏 + 窗帘电机 + 照明灯具</div></div>';

      if (SW.includeInstall !== false) {
        html += '<div class="sum-box"><div class="k">安装调试服务费</div>' +
          '<div class="v">¥' + fmt0(c.installFee) + '</div>' +
          '<div class="n">设备费 × 30%</div></div>';
      }

      html += '<div class="sum-box" style="border-color:var(--orange);background:var(--orange-soft)">' +
        '<div class="k">本页合计</div>' +
        '<div class="v" style="color:#C2410C">¥' + fmt0(c.grandTotal) + '</div>' +
        '<div class="n">共 ' + (c.z.qty + c.x.qty) + ' 面开关' +
        (SW.includeInstall !== false ? '，含安装调试费' : '，不含安装调试费') + '</div></div>';
    }
    box.innerHTML = html;
  }

  /* ---------- 打印版报价单 ---------- */
  function swPrintHtml() {
    var pn = $('swProjName').value || '全屋开关报价';
    var dt = $('swDate').value || today();
    var z = sumSwitchQuote(SW.recs.z1 || []);
    var x = sumSwitchQuote(SW.recs.x30 || []);

    var html = '<div class="sw-print"><h2>智装开关报价单</h2>' +
      '<div class="sp-meta">' + esc(pn) + '　|　' + esc(dt) + '</div>';

    ['z1', 'x30'].forEach(function (mid) {
      var m = switchModel(mid);
      var s = sumSwitchQuote(SW.recs[mid] || []);
      if (!s.qty) return;                 /* 没填就不占版面 */
      html += '<div class="sw-print-sec">' +
        '<div class="sps-head"><b>' + esc(m.name) + '</b>' +
        '<span>' + esc(m.pitch) + '</span>' +
        '<span class="sps-total">' + s.qty + ' 面　¥' + fmt0(s.money) + '</span></div>' +
        '<table><thead><tr><th>按键</th><th class="right">单价</th>' +
        '<th class="right">数量</th><th class="right">小计</th></tr></thead><tbody>';
      s.rows.forEach(function (r) {
        html += '<tr><td>' + r.k + ' 键</td><td class="right">¥' + fmt(r.price) + '</td>' +
          '<td class="right">' + r.qty + ' 面</td><td class="right">¥' + fmt(r.sub) + '</td></tr>';
      });
      html += '<tr class="tot"><td>小计</td><td class="right"></td>' +
        '<td class="right">' + s.qty + ' 面</td><td class="right">¥' + fmt(s.money) + '</td></tr>';
      html += '</tbody></table></div>';
    });

    /* 分空间明细：让客户知道每间装了什么 */
    html += '<div class="sw-print-sec"><div class="sps-head"><b>分空间明细</b></div>' +
      '<table><thead><tr><th>空间</th>';
    ['z1', 'x30'].forEach(function (mid) {
      switchModel(mid).keys.forEach(function (kd) { html += '<th class="right">' + switchModel(mid).short + ' ' + kd.name + '</th>'; });
    });
    html += '</tr></thead><tbody>';
    allSwitchRooms().forEach(function (rm) {
      var cells = '', has = false;
      ['z1', 'x30'].forEach(function (mid) {
        switchModel(mid).keys.forEach(function (kd) {
          var r = swRec(mid, rm.id, kd.k);
          var q = r ? r.qty : 0;
          if (q) has = true;
          cells += '<td class="right">' + (q || '') + '</td>';
        });
      });
      if (!has) return;                     /* 没填的空间不打印，省地方 */
      html += '<tr><td>' + rm.icon + ' ' + esc(rm.name) + '</td>' + cells + '</tr>';
    });
    html += '</tbody></table></div>';

    var c = swCalc();
    if (c.switchTotal) {
      html += '<div class="sw-print-total"><span>开关设备合计</span><span>¥' + fmt(c.switchTotal) + '</span></div>';
    }

    function printExtrasGroup(title, ids, total) {
      if (!total) return '';
      var rows = '';
      ids.forEach(function (id) {
        var e = SW.extras[id];
        if (!e || !e.qty) return;
        var d = EXTRA_DEVICES[id];
        rows += '<tr><td>' + d.icon + ' ' + d.name + '</td>' +
          '<td class="right">¥' + fmt(e.price) + '</td>' +
          '<td class="right">' + e.qty + ' ' + d.unit + '</td>' +
          '<td class="right">¥' + fmt(e.qty * e.price) + '</td></tr>';
      });
      if (!rows) return '';
      return '<div class="sw-print-sec"><div class="sps-head"><b>' + title + '</b></div>' +
        '<table><thead><tr><th>设备</th><th class="right">单价</th>' +
        '<th class="right">数量</th><th class="right">小计</th></tr></thead><tbody>' + rows +
        '</tbody></table></div>' +
        '<div class="sw-print-total"><span>' + title + '合计</span><span>¥' + fmt(total) + '</span></div>';
    }

    html += printExtrasGroup('网关 / 传感器 / 中控屏', EXTRA_HUB_SENSOR_PANEL, c.hubSensorPanelTotal);

    /* 电动窗帘：电机+轨道一体套装，标明轨道宽度 */
    if (c.curtainTotal) {
      var cRows = swCurtainRows().map(function (r) {
        return '<tr><td>' + r.icon + ' ' + esc(r.name) + '</td>' +
          '<td class="right">' + r.width + ' 米</td>' +
          '<td class="right">¥' + fmt(r.price) + '</td>' +
          '<td class="right">' + r.qty + ' ' + r.unit + '</td>' +
          '<td class="right">¥' + fmt(r.sub) + '</td></tr>';
      }).join('');
      if (cRows) {
        html += '<div class="sw-print-sec"><div class="sps-head"><b>电动窗帘（电机+轨道）</b>' +
          '<span>单价取自产品库报价表，按轨道宽度分档</span></div>' +
          '<table><thead><tr><th>系列</th><th class="right">轨道宽度</th>' +
          '<th class="right">套装单价</th><th class="right">数量</th>' +
          '<th class="right">小计</th></tr></thead><tbody>' + cRows + '</tbody></table></div>' +
          '<div class="sw-print-total"><span>电动窗帘合计</span><span>¥' + fmt(c.curtainTotal) + '</span></div>';
      }
    }

    /* 照明灯具：只打印填了数量的行，按品类分组 */
    if (c.lightTotal) {
      var lightRows = '';
      LIGHT_ORDER.forEach(function (id) {
        var e = SW.lights[id];
        if (!e || !parseInt(e.qty, 10)) return;
        var f = LIGHT_FIXTURES[id];
        if (!f) return;
        lightRows += '<tr><td>' + f.icon + ' ' + esc(f.name) + '</td>' +
          '<td class="right">¥' + fmt(e.price) + '</td>' +
          '<td class="right">' + e.qty + ' ' + f.unit + '</td>' +
          '<td class="right">¥' + fmt(parseInt(e.qty, 10) * parseInt(e.price, 10)) + '</td></tr>';
      });
      if (lightRows) {
        html += '<div class="sw-print-sec"><div class="sps-head"><b>照明灯具</b>' +
          '<span>单价取自产品库报价表</span></div>' +
          '<table><thead><tr><th>灯具</th><th class="right">单价</th>' +
          '<th class="right">数量</th><th class="right">小计</th></tr></thead>' +
          '<tbody>' + lightRows + '</tbody></table></div>' +
          '<div class="sw-print-total"><span>照明灯具合计</span><span>¥' + fmt(c.lightTotal) + '</span></div>';
      }
    }

    if (c.deviceTotal) {
      html += '<div class="sw-print-total"><span>设备费合计</span><span>¥' + fmt(c.deviceTotal) + '</span></div>';
      if (SW.includeInstall !== false) {
        html += '<div class="sw-print-total"><span>安装调试服务费（设备费×30%）</span><span>¥' + fmt(c.installFee) + '</span></div>';
      }
      html += '<div class="sw-print-total" style="border-color:var(--orange);background:var(--orange-soft)">' +
        '<span><b>本页合计</b></span><span><b>¥' + fmt(c.grandTotal) + '</b></span></div>';
    }

    html += '<div class="notes"><b>说明</b><ul>' +
      '<li>本报价单含开关、网关、传感器、中控屏、电动窗帘（电机+轨道）、照明灯具设备价；安装调试服务费按设备费 30% 自动计取。</li>' +
      '<li>电动窗帘按轨道宽度分档报价，已含轨道；实际以现场复尺宽度为准。</li>' +
      '<li>具体点位以现场复尺为准，如与现场不符，免费出增补方案。</li>' +
      '<li>以上为设备单价参考，实际按下单当日品牌活动价结算。</li>' +
      '<li>装好即可用，单控无需额外网关；双控、多键场景、中控屏联动请在备注中说明。</li>' +
      '</ul><div style="text-align:right;margin-top:8px">智装点位通 · ' + esc(dt) + '</div></div></div>';
    return html;
  }

  function swPrint() {
    swInit();
    var old = $('swPrintBox');
    if (old) old.parentNode.removeChild(old);
    var w = document.createElement('div');
    w.id = 'swPrintBox';
    w.innerHTML = swPrintHtml();
    $('p7').appendChild(w);
    var box = $('swTables');
    var backup = { d: box.style.display };
    box.style.display = 'none';
    window.print();
    setTimeout(function () {
      box.style.display = backup.d;
      if (w.parentNode) w.parentNode.removeChild(w);
    }, 400);
  }

  function swXlsx() {
    swInit();
    var pn = $('swProjName').value || '全屋开关报价';
    var dt = $('swDate').value || today();
    var z = sumSwitchQuote(SW.recs.z1 || []);
    var x = sumSwitchQuote(SW.recs.x30 || []);

    var rows = [
      ['智装开关报价单'],
      ['方案', pn, '日期', dt],
      []
    ];

    ['z1', 'x30'].forEach(function (mid) {
      var m = switchModel(mid);
      var s = sumSwitchQuote(SW.recs[mid] || []);
      if (!s.qty) return;
      rows.push([m.name + '（' + m.pitch + '）']);
      rows.push(['按键', '单价', '数量', '小计']);
      s.rows.forEach(function (r) {
        rows.push([r.k + ' 键', r.price, r.qty, r.sub]);
      });
      rows.push(['小计', '', s.qty + ' 面', s.money]);
      rows.push([]);
    });

    var c = swCalc();
    if (c.switchTotal) {
      rows.push(['开关设备合计', '', z.qty + x.qty + ' 面', c.switchTotal]);
    }

    if (c.hubSensorPanelTotal) {
      rows.push(['网关/传感器/中控屏合计', '', '', c.hubSensorPanelTotal]);
      EXTRA_HUB_SENSOR_PANEL.forEach(function (id) {
        var e = SW.extras[id];
        if (!e || !e.qty) return;
        var d = EXTRA_DEVICES[id];
        rows.push([d.icon + ' ' + d.name, e.price, e.qty + ' ' + d.unit, e.qty * e.price]);
      });
      rows.push([]);
    }

    if (c.curtainTotal) {
      rows.push(['电动窗帘合计（电机+轨道）', '', '', c.curtainTotal]);
      swCurtainRows().forEach(function (r) {
        rows.push([r.icon + ' ' + r.name, r.width + ' 米 / ¥' + r.price,
          r.qty + ' ' + r.unit, r.sub]);
      });
      rows.push([]);
    }

    if (c.lightTotal) {
      rows.push(['照明灯具合计（单价取自报价表）', '', '', c.lightTotal]);
      LIGHT_ORDER.forEach(function (id) {
        var e = SW.lights[id];
        if (!e || !parseInt(e.qty, 10)) return;
        var f = LIGHT_FIXTURES[id];
        if (!f) return;
        rows.push([f.icon + ' ' + f.name, e.price, e.qty + ' ' + f.unit,
          parseInt(e.qty, 10) * parseInt(e.price, 10)]);
      });
      rows.push([]);
    }

    if (c.deviceTotal) {
      rows.push(['设备费合计（开关+网关/传感器/中控屏+窗帘电机+照明灯具）', '', '', c.deviceTotal]);
      if (SW.includeInstall !== false) {
        rows.push(['安装调试服务费（设备费×30%）', '', '', c.installFee]);
      }
      rows.push(['本页合计', '', '', c.grandTotal]);
      rows.push([]);
    }

    /* 分空间明细 */
    rows.push(['分空间明细']);
    var head = ['空间'];
    ['z1', 'x30'].forEach(function (mid) {
      switchModel(mid).keys.forEach(function (kd) { head.push(switchModel(mid).short + ' ' + kd.name); });
    });
    rows.push(head);
    allSwitchRooms().forEach(function (rm) {
      var line = [rm.icon + ' ' + rm.name], has = false;
      ['z1', 'x30'].forEach(function (mid) {
        switchModel(mid).keys.forEach(function (kd) {
          var r = swRec(mid, rm.id, kd.k);
          var q = r ? r.qty : 0;
          if (q) has = true;
          line.push(q || '');
        });
      });
      if (has) rows.push(line);
    });

    try {
      var parts = XLSX_UTIL.build([
        { name: '开关报价', rows: rows, widths: [16, 12, 10, 14, 10, 10, 10, 10] }
      ]);
      XLSX_UTIL.download(parts, pn.replace(/[\\/:*?"<>|]/g, '') + '_开关报价.xlsx');
      toast('开关报价已导出');
    } catch (e) { toast('导出失败：' + e.message); }
  }

  /* =========================================================
     12. 图纸框选标注
     ========================================================= */
  function enableDrawing() {
    var host = $('drawHost');
    if (!host) { toast('先上传一张户型图'); return; }
    var img = host.querySelector('img');
    var cv = host.querySelector('canvas');
    if (!img || !cv) return;
    cv.width = img.clientWidth; cv.height = img.clientHeight;
    cv.style.width = img.clientWidth + 'px'; cv.style.height = img.clientHeight + 'px';
    var ctx = cv.getContext('2d');
    function clear() { ctx.clearRect(0, 0, cv.width, cv.height); }
    ctx.lineWidth = 2; ctx.strokeStyle = '#FF7A1A'; ctx.fillStyle = 'rgba(255,122,26,.12)';
    clear();

    var drawing = false, sx = 0, sy = 0;
    function getXY(e) {
      var r = cv.getBoundingClientRect();
      var p = (e.touches && e.touches[0]) ? e.touches[0]
            : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function down(e) {
      e.preventDefault();
      var p = getXY(e); sx = p.x; sy = p.y; drawing = true;
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = getXY(e);
      clear();
      ctx.fillRect(sx, sy, p.x - sx, p.y - sy);
      ctx.strokeRect(sx, sy, p.x - sx, p.y - sy);
    }
    function up(e) {
      if (!drawing) return;
      drawing = false;
      var p = getXY(e);
      var x = Math.round(sx), y = Math.round(sy), w = Math.round(p.x - sx), h = Math.round(p.y - sy);
      if (w < 20 || h < 20) { clear(); return; }
      clear();
      modalBox({
        title: '标注这个房间',
        fields: [
          { key: 'name', label: '房间名', placeholder: '如 主卧 / 客厅' },
          { key: 'area', label: '面积（㎡）', placeholder: '估算即可，后面能改', value: '15' }
        ],
        okText: '加入房间',
        onOk: function (v) {
          var name = (v.name || '').trim();
          if (!name) { toast('房间名不能为空'); return; }
          var area = parseFloat(v.area) || 10;
          S.rooms.push({ uid: uid('r'), type: guessRoomType(name), name: name, area: area, windows: 1, note: '', track: 'none', sw: 1, sn: 0, peri: 0 });
          renderRooms(); renderNeeds();
          /* 在图上留一个标记 */
          var tag = document.createElement('div');
          tag.className = 'drawn-box';
          tag.style.left = x + 'px'; tag.style.top = (y - 18) + 'px';
          tag.textContent = name + ' ' + area + '㎡';
          host.appendChild(tag);
          toast('已加入房间：' + name);
        }
      });
    }
    cv.onmousedown = down; cv.ontouchstart = down;
    cv.onmousemove = move; cv.ontouchmove = move;
    cv.onmouseup = up; cv.ontouchend = up;
    host.classList.add('drawing');
  }
  function guessRoomType(name) {
    var m = [['living', ['客厅', '起居', '沙发']], ['dining', ['餐厅', '饭厅']], ['kitchen', ['厨房']],
    ['bath', ['卫生间', '浴室', '主卫', '公卫', '厕所']], ['master', ['主卧', '大卧', '卧室']],
    ['second', ['次卧', '客卧', '客房']], ['kids', ['儿童房', ' kids', '小孩房', '婴儿房']],
    ['study', ['书房', '工作室', '书房']], ['balcony', ['阳台', '露台', '花园']],
    ['entry', ['玄关', '入门', '门厅', '走廊', '过道', '门廊']], ['hall', ['走廊', '过道', '楼梯']]];
    for (var i = 0; i < m.length; i++)
      for (var j = 0; j < m[i][1].length; j++)
        if (name.indexOf(m[i][1][j]) >= 0) return m[i][0];
    return 'other';
  }

  /* ---------- 启动 ---------- */
  function pickPlan(id) {
    var p = FLOOR_PLANS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    S.planId = p.id;
    S.rooms = p.rooms.map(function (r) {
      var d = defaultDev(r);
      return {
        uid: uid('r'), type: r.type, name: r.name, area: r.area, windows: r.windows || 1,
        note: '', track: 'none', sw: d.sw, sn: d.sn, peri: d.peri || 0
      };
    });
    S.rNeeds = {};
    S.points = [];
    S.wire = p.id === 'old_house' ? 'single' : 'unknown';
    renderPlans(); renderRooms();
    /* 默认勾一批常见需求，打开就能看到成品 */
    S.gNeeds = ['g_hub', 'g_network'];
    S.rooms.forEach(function (r) {
      var m = {
        living: ['l_base', 'l_curtain', 'l_env'],
        master: ['m_base', 'm_night', 'm_curtain'],
        bath: ['b_base', 'b_night'],
        kitchen: ['k_base', 'k_smoke'],
        entry: ['e_lock', 'e_home'],
        second: ['s_base'],
        kids: ['kd_base'],
        dining: ['d_base'],
        balcony: ['ba_light', 'ba_dry']
      }[r.type] || [];
      if (m.length) S.rNeeds[r.uid] = m.slice();
    });
    renderNeeds(); genPoints(true);
  }

  bind();
  renderPlans();
  renderDevChips();
  renderMarkerList();
  pickPlan('apartment_3_2');
  renderLibStat();
  renderLibTable('');

  /* 顶栏吸顶：Tab 条要贴在顶栏正下方（顶栏高度随窗口宽度变化，动态同步，避免滚动时 Tab 被顶栏盖住） */
  function syncTabsOffset() {
    var tb = document.querySelector('.topbar');
    var tabs = document.querySelector('.tabs');
    if (tb && tabs) tabs.style.top = tb.offsetHeight + 'px';
  }
  syncTabsOffset();
  if (typeof window !== 'undefined') window.addEventListener('resize', syncTabsOffset);

  /* 支持 PWA 快捷方式：manifest shortcuts 带 ?tab=p7，打开时自动切到对应 Tab */
  function switchFromUrl() {
    var m = location.search.match(/[?&]tab=([^&]+)/);
    if (m && m[1]) switchTab(m[1]);
  }
  switchFromUrl();

  /* 调试句柄：方便在控制台查看/操作标注，不影响正常使用 */
  if (typeof window !== 'undefined') {
    window.__ZD = {
      S: S, addMarker: addMarker, renderMarkers: renderMarkers, renderMarkerList: renderMarkerList,
      markerNos: markerNos, exportAnnoCsv: exportAnnoList, toggleDevMode: toggleDevMode,
      renderDevChips: renderDevChips, renderImgs: renderImgs,
      renderRooms: renderRooms, genPoints: genPoints, renderNeeds: renderNeeds,
      SW: SW, swRec: swRec, swPlan: swPlan, swApplyPlan: swApplyPlan,
      swRenderTables: swRenderTables, swRenderStats: swRenderStats, swInit: swInit,
      swRenderLightTable: swRenderLightTable, swLightTotal: swLightTotal, swInitLights: swInitLights,
      swApplyLightPlan: swApplyLightPlan, swLightPlanPreview: swLightPlanPreview,
      swApplyStripPlan: swApplyStripPlan, swStripPlanPreview: swStripPlanPreview,
      swRenderCurtainTable: swRenderCurtainTable, swCurtainRows: swCurtainRows,
      swInitCurtains: swInitCurtains
    };
  }
})();
