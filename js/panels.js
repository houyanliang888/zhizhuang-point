/* ===========================================================
   智装点位通 · 智能面板 UI 草图生成器（墙装开关面板）
   -----------------------------------------------------------
   根据点位表里的 panel 类点位，画出 86 型多键面板草图。
   · 按键数来自产品名（单/双/三/四键），兜底双键
   · 按键功能标签自动从「同房间内」的灯光/场景点位推断
   · 标签可手动编辑，存进 S.panelLabels，跟随方案保存
   =========================================================== */
var PANELS = (function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 按键图标：按标签里的关键词选一个单字，画在键里 */
  function iconOf(label) {
    var s = label || '';
    if (s.indexOf('窗帘') >= 0) return '帘';
    if (s.indexOf('灯') >= 0 || s.indexOf('筒灯') >= 0 || s.indexOf('主灯') >= 0 || s.indexOf('氛围') >= 0) return '灯';
    if (s.indexOf('场景') >= 0 || s.indexOf('模式') >= 0) return '景';
    if (s.indexOf('空调') >= 0) return '调';
    if (s.indexOf('新风') >= 0) return '风';
    if (s.indexOf('地暖') >= 0 || s.indexOf('暖') >= 0) return '暖';
    if (s.indexOf('音乐') >= 0 || s.indexOf('音箱') >= 0) return '音';
    if (s.indexOf('锁') >= 0) return '锁';
    if (s.indexOf('帘') >= 0) return '帘';
    return '灯';
  }

  /* 从产品名推断按键数 */
  function keysOf(name) {
    if (/四键/.test(name || '')) return 4;
    if (/三键/.test(name || '')) return 3;
    if (/双键/.test(name || '')) return 2;
    if (/单键/.test(name || '')) return 1;
    var m = /([1-4])\s*键/.exec(name || '');
    if (m) return +m[1];
    return 2; /* 兜底双键场景开关 */
  }

  /* 清洗设备名成短标签（去掉房间前缀、冗余词，截断6字） */
  function cleanLabel(n, roomName) {
    var s = String(n || '').replace(/点位$/, '').trim();
    if (roomName) {
      try { s = s.replace(new RegExp('^' + roomName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), ''); } catch (e) {}
    }
    s = s.replace(/^(智能|电动|远程|无线|自动)/, '').trim();
    if (!s) s = '灯光';
    if (s.length > 6) s = s.slice(0, 6);
    return s;
  }

  /* 设备类型展示优先级：灯 > 窗帘 > 温控 > 传感器 > 其他 */
  var DEV_ORDER = {
    light: 0, bulb: 1, led: 2, curtain: 3, th: 4, ms_th: 4,
    presence: 5, sensor: 6, lock: 7, camera: 8, speaker: 9,
    plug: 10, humid: 11, valve: 12, smoke: 13, gas: 14, water: 15,
    relay: 16, other: 99
  };

  /* 收集某房间的灯光/场景类标签（去重、保序） */
  function roomLabels(roomName, points) {
    var items = points.filter(function (p) {
      return p.roomName === roomName && p.devCat !== 'panel';
    });
    items.sort(function (a, b) {
      var x = DEV_ORDER[a.devCat] != null ? DEV_ORDER[a.devCat] : 50;
      var y = DEV_ORDER[b.devCat] != null ? DEV_ORDER[b.devCat] : 50;
      return x - y;
    });
    var seen = {}, uniq = [];
    items.forEach(function (p) {
      var l = cleanLabel(p.name, roomName);
      if (!seen[l]) { seen[l] = 1; uniq.push(l); }
    });
    return uniq;
  }

  /* 取面板点位的按键标签数组：手动改过的优先，否则自动推断 */
  function keyLabels(p, points, labels) {
    var n = keysOf(p.name);
    var base = roomLabels(p.roomName, points);
    var out = [];
    for (var i = 0; i < n; i++) {
      var lk = p.key + ':' + i;
      var auto = base[i] || ('按键' + (i + 1));
      out.push(labels && labels[lk] != null ? labels[lk] : auto);
    }
    return out;
  }

  /* ============ HTML 编辑视图 ============ */
  function build(rooms, points, labels, opt) {
    opt = opt || {}; labels = labels || {};
    var panels = points.filter(function (p) { return p.devCat === 'panel'; });
    if (!panels.length) {
      return '<div class="empty">点位表里还没有「智能开关(面板)」类点位。先在前面生成点位清单，' +
        '或在第 2 步「手动加点位」里加一个面板点位，这里就会自动出草图。</div>';
    }
    var html = '<div class="panel-grid">';
    var lastRoom = null;
    panels.forEach(function (p) {
      var n = keysOf(p.name);
      var keys = keyLabels(p, points, labels);
      if (p.roomName !== lastRoom) {
        html += '<div class="panel-room"><span class="pr-name">' + esc(p.roomName || '房间') + '</span>' +
          '<span class="pr-sub">墙装智能开关面板</span></div>';
        lastRoom = p.roomName;
      }
      html += card(p, n, keys);
    });
    html += '</div>';
    return html;
  }

  function card(p, n, keys) {
    var brand = p.src || '智能面板';
    var keysHtml = '';
    keys.forEach(function (k, i) {
      var lk = p.key + ':' + i;
      keysHtml += '<div class="pkey">' +
        '<div class="pk-ico">' + iconOf(k) + '</div>' +
        '<input class="pk-lbl" data-lk="' + esc(lk) + '" value="' + esc(k) + '" maxlength="6" spellcheck="false">' +
        '</div>';
    });
    return '<div class="panel-card">' +
      '<div class="panel-face n' + n + '">' +
        '<div class="pf-brand">' + esc(brand) + '</div>' +
        '<div class="pf-keys">' + keysHtml + '</div>' +
      '</div>' +
      '<div class="panel-meta">' + esc(p.roomName || '') + ' · ' + esc((p.name || '智能开关').slice(0, 12)) + '</div>' +
    '</div>';
  }

  /* ============ 纯矢量 SVG 导出（给客户看 / 打印另存） ============ */
  function toSvg(rooms, points, labels, opt) {
    opt = opt || {}; labels = labels || {};
    var panels = points.filter(function (p) { return p.devCat === 'panel'; });
    if (!panels.length) return '';
    var PW = 200, PH = 268, GAP = 16, M = 22, COLS = 3, ROW_H = PH + 44;
    var title = opt.title || '智能面板示意图';

    /* 按房间分组，房间标题单独占一行 */
    var groups = [], map = {};
    panels.forEach(function (p) {
      var r = p.roomName || '房间';
      if (!map[r]) { map[r] = []; groups.push(r); }
      map[r].push(p);
    });

    var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="10" ' +
      'font-family="Microsoft YaHei, PingFang SC, sans-serif" viewBox="0 0 900 10" ' +
      'style="background:#fff;max-width:900px;width:100%">'];
    svg.push('<text x="' + M + '" y="30" font-size="17" font-weight="700" fill="#1f2d3d">' + esc(title) + '</text>');
    var y = 52;
    groups.forEach(function (r) {
      svg.push('<text x="' + M + '" y="' + (y + 18) + '" font-size="13" font-weight="700" fill="#33465e">' +
        esc(r) + ' · 墙装智能开关面板</text>');
      y += 34;
      map[r].forEach(function (p, idx) {
        var col = idx % COLS;
        var x = M + col * (PW + GAP);
        if (col === 0 && idx > 0) y += ROW_H;
        svg.push(panelSvg(p, x, y, points, labels));
      });
      y += ROW_H;
    });
    var H = y + 20;
    svg[0] = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="' + H + '" ' +
      'font-family="Microsoft YaHei, PingFang SC, sans-serif" viewBox="0 0 900 ' + H + '" ' +
      'style="background:#fff;max-width:900px;width:100%">';
    svg.push('</svg>');
    return svg.join('');
  }

  function panelSvg(p, x, y, points, labels) {
    var n = keysOf(p.name);
    var keys = keyLabels(p, points, labels);
    var brand = p.src || '智能面板';
    var W = 200, H = 268;
    var out = [];
    out.push('<g>');
    /* 面板外框 */
    out.push('<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" rx="12" fill="#f7f9fc" stroke="#c3ccd9" stroke-width="1.5"/>');
    out.push('<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="' + (W - 16) + '" height="' + (H - 16) + '" rx="8" fill="#fff" stroke="#dde3ec" stroke-width="1"/>');
    /* 品牌条 */
    out.push('<text x="' + (x + 16) + '" y="' + (y + 28) + '" font-size="11" fill="#8a96a8">' + esc(brand) + '</text>');
    /* 按键区 */
    var kx = x + 18, kw = W - 36, ky0 = y + 42, kh = 40, vgap = 10;
    keys.forEach(function (k, i) {
      var ky = ky0 + i * (kh + vgap);
      out.push('<rect x="' + kx + '" y="' + ky + '" width="' + kw + '" height="' + kh + '" rx="7" fill="#eef2f7" stroke="#cfd8e3" stroke-width="1"/>');
      out.push('<circle cx="' + (kx + 18) + '" cy="' + (ky + kh / 2) + '" r="11" fill="#fff" stroke="#0f9d58" stroke-width="1.6"/>');
      out.push('<text x="' + (kx + 18) + '" y="' + (ky + kh / 2 + 4) + '" font-size="11" font-weight="700" fill="#0f9d58" text-anchor="middle">' + esc(iconOf(k)) + '</text>');
      out.push('<text x="' + (kx + 36) + '" y="' + (ky + kh / 2 + 4) + '" font-size="12" fill="#2b3a4b">' + esc(k) + '</text>');
    });
    /* 底部产品名 */
    out.push('<text x="' + (x + 16) + '" y="' + (y + H - 14) + '" font-size="10.5" fill="#9aa6b5">' +
      esc((p.roomName || '') + ' · ' + (p.name || '智能开关').slice(0, 14)) + '</text>');
    out.push('</g>');
    return out.join('');
  }

  return {
    build: build,
    toSvg: toSvg,
    keysOf: keysOf,
    iconOf: iconOf,
    /* 把「自动推断标签」补全进 labels，保证导出 SVG 也能拿到自动值 */
    fillLabels: function (points, labels) {
      labels = labels || {};
      points.filter(function (p) { return p.devCat === 'panel'; }).forEach(function (p) {
        var n = keysOf(p.name);
        var base = roomLabels(p.roomName, points);
        for (var i = 0; i < n; i++) {
          var lk = p.key + ':' + i;
          if (labels[lk] == null) labels[lk] = base[i] || ('按键' + (i + 1));
        }
      });
      return labels;
    }
  };
})();
