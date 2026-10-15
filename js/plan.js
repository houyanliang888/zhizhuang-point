/* =========================================================
   点位分布图：房间按功能区分区排布，点位按安装习惯落位
   - 开关靠门口 / 插座沿墙 / 灯具居中 / 窗帘贴窗 / 摄像头角落
   - 输出 SVG 字符串，可打印、可另存、矢量不糊
   ========================================================= */
var PLAN = (function () {
  'use strict';

  /* ---------- 房间分区（按家装习惯上中下排）---------- */
  var ZONES = [
    { name: '休息区', types: ['master', 'second', 'kids', 'study'] },
    { name: '活动区', types: ['living', 'dining', 'hall'] },
    { name: '后勤区', types: ['kitchen', 'bath', 'entry', 'balcony'] }
  ];

  /* ---------- 点位落位规则：按设备品类定锚点 ---------- */
  /* door=靠门  window=贴窗  center=居中  wall=沿墙  corner=角落 */
  var POS_RULE = {
    panel: 'door', plug: 'wall', light: 'center', bulb: 'center',
    led: 'wall', curtain: 'window', sensor: 'center', presence: 'center',
    lock: 'door', camera: 'corner', speaker: 'wall', gateway: 'center',
    ap: 'center', valve: 'wall', smoke: 'center', gas: 'center',
    water: 'wall', relay: 'center', humid: 'center', th: 'center',
    presence_light: 'center', other: 'center'
  };

  /* ---------- 图标：圆内单字 + 图例 ---------- */
  var ICON = {
    panel: '开', plug: '插', light: '灯', bulb: '灯', led: '灯',
    curtain: '帘', sensor: '感', presence: '体', lock: '锁',
    camera: '摄', speaker: '音', gateway: '网', ap: '网',
    valve: '阀', smoke: '烟', gas: '气', water: '水',
    relay: '控', humid: '湿', th: '温', other: '·'
  };

  /* devCat 兜底：从点位名猜 */
  function guessCat(p) {
    if (p.devCat && Object.prototype.hasOwnProperty.call(POS_RULE, p.devCat)) return p.devCat;
    var n = p.name || '';
    if (/开关|面板/.test(n)) return 'panel';
    if (/插座/.test(n)) return 'plug';
    if (/窗帘|帘|幕/.test(n)) return 'curtain';
    if (/灯带|灯|照明|夜灯|灯位/.test(n)) return 'light';
    if (/门锁/.test(n)) return 'lock';
    if (/摄像头|摄像机|监控/.test(n)) return 'camera';
    if (/人体|存在|人体存在/.test(n)) return 'presence';
    if (/烟感|烟雾/.test(n)) return 'smoke';
    if (/燃气|天然气/.test(n)) return 'gas';
    if (/水浸|水阀/.test(n)) return 'water';
    if (/阀门/.test(n)) return 'valve';
    if (/音箱|背景音乐|吸顶/.test(n)) return 'speaker';
    if (/网关|中枢/.test(n)) return 'gateway';
    if (/路由|AP|网络/.test(n)) return 'ap';
    if (/传感器/.test(n)) return 'sensor';
    return 'other';
  }

  /* ---------- 画布参数 ---------- */
  var W = 1040, PAD = 26, ZGAP = 30, RH = 152, MINW = 120;
  var WHOLE_H = 66;   /* 顶部「全屋级」横条占的高度 */
  var TITLE_H = 34;   /* 房间顶部标题栏高度 */
  var LEG_H = 52;     /* 底部图例区高度（必须预留，不然图例会压在房间上） */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* =======================================================
     布局：房间按分区排成三行，行内按面积比例分配宽度
     ======================================================= */
  function layout(rooms, hasWhole) {
    var rows = [];

    function put(type, r) {
      for (var i = 0; i < ZONES.length; i++) {
        if (ZONES[i].types.indexOf(type) >= 0) {
          if (!rows[i]) rows[i] = { name: ZONES[i].name, rooms: [] };
          rows[i].rooms.push(r);
          return;
        }
      }
      /* 没归类的：按名字硬塞进最近的区，实在不行放活动区 */
      var idx = /厨房|卫|阳台|玄关|洗衣|储物/.test(r.name || '') ? 2 : 1;
      if (!rows[idx]) rows[idx] = { name: ZONES[idx].name, rooms: [] };
      rows[idx].rooms.push(r);
    }
    rooms.forEach(function (r) { put(r.type, r); });

    /* 顶部有「全屋级」横条时，整体往下让开，别和房间压在一起 */
    var y = PAD + (hasWhole ? WHOLE_H + ZGAP : 0), out = [];
    rows.forEach(function (row, ri) {
      if (!row || !row.rooms.length) return;
      var list = row.rooms;
      var totalArea = list.reduce(function (a, r) { return a + (r.area || 10); }, 0) || 1;
      var avail = W - PAD * 2;
      var x = PAD;
      list.forEach(function (r) {
        var w = Math.max(MINW, Math.round(avail * (r.area || 10) / totalArea));
        if (x + w > W - PAD) w = W - PAD - x;
        r._x = x; r._y = y; r._w = w; r._h = RH;
        out.push(r);
        x += w;
      });
      y += RH + (ri < rows.length - 1 ? ZGAP : 0);
    });

    return { rooms: out, height: y + PAD - ZGAP };
  }

  /* =======================================================
     房间内的点位落位
     ======================================================= */
  function placeInRoom(list, rect) {
    var x0 = rect._x, y0 = rect._y, w = rect._w, h = rect._h;
    /* 房间内可用区（顶部让出标题栏） */
    var ay = y0 + TITLE_H, ah = h - TITLE_H - 12;

    /* 按锚点分组 */
    var groups = {};
    list.forEach(function (p) {
      var cat = guessCat(p);
      var anchor = POS_RULE[cat] || 'center';
      (groups[anchor] = groups[anchor] || []).push({ p: p, cat: cat });
    });

    var out = [];
    Object.keys(groups).forEach(function (a) {
      var arr = groups[a];
      arr.forEach(function (it, i) {
        var fx, fy, jx = 0, jy = 0;
        if (a === 'center')    { fx = 0.5;  fy = 0.5; }
        else if (a === 'door') { fx = 0.84; fy = 0.86; }
        else if (a === 'window'){ fx = 0.5; fy = 0.14; }
        else if (a === 'corner'){ fx = 0.16; fy = 0.2; }
        else                   { fx = 0.5;  fy = 0.62; } /* wall */

        /* 同锚点多个时散开 */
        var n = arr.length;
        if (n > 1) {
          if (a === 'wall' || a === 'corner') {
            /* 沿房间外侧均匀铺开 */
            var seg = (w - 60) / (n - 1 || 1);
            jx = -((w - 60) / 2) + seg * i;
            jy = i % 2 ? 14 : -14;
          } else if (a === 'window') {
            var segw = (w - 60) / (n - 1 || 1);
            jx = -((w - 60) / 2) + segw * i;
          } else if (a === 'door') {
            jy = Math.min(22, n * 4) * (i % 2 ? 1 : -1);
            jx = (i % 2 ? 1 : -1) * i * 16;
          } else {
            /* center：网格均匀铺开（不会跑出房间，也不至于叠在一起） */
            var cols = Math.max(2, Math.ceil(Math.sqrt(n)));
            var rws = Math.ceil(n / cols);
            var col = i % cols, rwi = Math.floor(i / cols);
            var stepX = n > 1 ? (w - 76) / (cols - 1) : 0;
            jx = (col - (cols - 1) / 2) * stepX;
            jy = (rwi - (rws - 1) / 2) * 42;
            if (rws === 1) jy = 0;
          }
        }

        var px = x0 + 30 + (w - 60) * fx + jx;
        var py = ay + ah * fy + jy;
        px = Math.max(x0 + 14, Math.min(x0 + w - 14, px));
        py = Math.max(ay + 10, Math.min(ay + ah - 6, py));
        out.push({ p: it.p, cat: it.cat, x: px, y: py });
      });
    });

    /* 兜底：兜住所有重叠，小房间塞很多点位也不会叠成一坨 */
    relax(out, { _x: x0, _y: y0, _w: w, _h: h });
    return out;
  }

  /* 简单松弛：两点靠太近就沿连线互推，多轮后收敛，最后夹回房间内 */
  function relax(list, rect) {
    var MIN = 27;
    var x0 = rect._x, y0 = rect._y, w = rect._w, h = rect._h;
    var ly = y0 + TITLE_H, lh = h - TITLE_H - 12;
    function clamp(p) {
      p.x = Math.max(x0 + 13, Math.min(x0 + w - 13, p.x));
      p.y = Math.max(ly - 2, Math.min(ly + lh - 4, p.y));
    }
    for (var pass = 0; pass < 14; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d >= MIN) continue;
          if (d < 0.01) { dx = 1; dy = 0; d = 1; }   /* 完全重合时给个默认方向 */
          var push = (MIN - d) / 2 + 0.5;
          var ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
          moved = true;
        }
      }
      list.forEach(clamp);
      if (!moved) break;
    }
  }

  /* =======================================================
     主入口：生成 SVG
     ======================================================= */
  function build(rooms, points, opt) {
    opt = opt || {};
    var title = opt.title || '点位分布图';
    var hasWhole = points.some(function (p) {
      return p.roomKey === 'G' || p.roomName === '全屋';
    });
    var lay = layout(rooms, hasWhole);
    var svg = [];

    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + lay.height +
      '" viewBox="0 0 ' + W + ' ' + lay.height + '" font-family="Microsoft YaHei, PingFang SC, sans-serif">');
    svg.push('<rect width="100%" height="100%" fill="#ffffff"/>');

    /* 标题 */
    svg.push('<text x="' + PAD + '" y="20" font-size="15" font-weight="700" fill="#0f2740">' +
      esc(title) + '</text>');
    if (opt.sub) {
      svg.push('<text x="' + PAD + '" y="' + (20 + 15) + '" font-size="11" fill="#6b7280">' +
        esc(opt.sub) + '</text>');
    }

    /* 分区标题 + 房间 */
    var yCur = PAD;
    lay.rooms.forEach(function (r) {
      /* 分区分隔行：靠该房间顶部的细线 + 文字 */
      var isFirstInZone = (r._y - yCur > 1);
      if (isFirstInZone) {
        svg.push('<line x1="' + PAD + '" y1="' + (r._y - 14) + '" x2="' + (W - PAD) +
          '" y2="' + (r._y - 14) + '" stroke="#e5e9f0" stroke-width="1"/>');
        yCur = r._y;
      }

      var x = r._x, y = r._y, w = r._w, h = r._h;
      /* 房间墙 */
      svg.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" fill="#fbfcfe" stroke="#33465e" stroke-width="2.4" rx="2"/>');

      /* 窗位：房顶画双线缺口 */
      for (var wi = 0; wi < (r.windows || 0); wi++) {
        var cw = Math.min(46, w / 3);
        var cxp = x + 34 + wi * (cw + 10);
        if (cxp + cw > x + w - 10) cxp = x + w - 10 - cw;
        svg.push('<line x1="' + cxp + '" y1="' + (y + 3) + '" x2="' + (cxp + cw) +
          '" y2="' + (y + 3) + '" stroke="#2f7fd1" stroke-width="3.4"/>');
      }

      /* 房名 + 面积 */
      var nm = r.name || '房间';
      svg.push('<text x="' + (x + 8) + '" y="' + (y + 17) + '" font-size="12.5" font-weight="700" fill="#0f2740">' +
        esc(nm) + '</text>');
      svg.push('<text x="' + (x + 8) + '" y="' + (y + 31) + '" font-size="10.5" fill="#8794a6">' +
        (r.area || 0) + '㎡ · ' + (r.windows || 0) + '窗</text>');

      /* 门：右下角一段开口 */
      var dw = Math.min(40, w / 4);
      svg.push('<path d="M' + (x + w - 8 - dw) + ' ' + (y + h) + ' h' + dw +
        '" stroke="#33465e" stroke-width="2.4" fill="none"/>');
    });

    /* 全屋级点位：单独画在图顶的横条 */
    var whole = [];
    points.forEach(function (p) {
      if (p.roomKey === 'G' || p.roomName === '全屋') whole.push(p);
    });

    /* 点位 Marker：用 <g> 包裹，data-key 关联点位
       data-ax/ay 记「纯自动位置」（不受偏移影响，便于累计偏移）
       transform 用「自动位置 + 偏移」，拖动时只改 transform */
    function marker(pt, cx, cy, label, key, ax, ay) {
      var c = ICON[pt.cat] || '·';
      svg.push('<g class="plan-pt" data-key="' + esc(key) + '" data-ax="' + (ax == null ? cx : ax) +
        '" data-ay="' + (ay == null ? cy : ay) +
        '" transform="translate(' + cx + ',' + cy + ')">' +
        '<circle cx="0" cy="0" r="11.5" fill="#fff" stroke="#0f9d58" stroke-width="1.8"/>' +
        '<text x="0" y="4" font-size="11" font-weight="700" fill="#0f9d58" text-anchor="middle">' +
        esc(c) + '</text>' +
        (label ? '<text x="0" y="25" font-size="9.5" fill="#4b5563" text-anchor="middle">' + esc(label) + '</text>' : '') +
        '</g>');
    }

    /* 每个房间里的点位 */
    lay.rooms.forEach(function (r) {
      var list = points.filter(function (p) {
        return (p.roomKey !== 'G') && (p.roomName === r.name || p.roomKey === r.uid || p.roomKey === r.type);
      });
      if (!list.length) return;
      placeInRoom(list, r).forEach(function (m) {
        var nm = (m.p.name || '').replace(/点位$/, '').slice(0, 6);
        var off = opt.drag && opt.drag[m.p.key];
        var cx = m.x + (off ? off.dx : 0);
        var cy = m.y + (off ? off.dy : 0);
        marker(m, cx, cy, nm, m.p.key, m.x, m.y);
      });
    });

    /* 全屋级点位画在顶部横条 */
    if (whole.length) {
      var bx = PAD, by = PAD;
      svg.push('<rect x="' + bx + '" y="' + by + '" width="' + (W - PAD * 2) + '" height="46" ' +
        'fill="#f5f7fb" stroke="#33465e" stroke-width="1.6" rx="3"/>');
      svg.push('<text x="' + (bx + 8) + '" y="' + (by + 17) + '" font-size="11" fill="#6b7280">全屋级</text>');
      var step = Math.max(96, Math.floor((W - PAD * 2 - 90) / Math.max(1, whole.length)));
      var startX = bx + 78;
      whole.forEach(function (p, i) {
        var cx = startX + step * i + step / 2;
        if (cx > W - PAD - 20) return;
        var cat = guessCat(p);
        var off = opt.drag && opt.drag[p.key];
        var px = cx + (off ? off.dx : 0);
        var py = by + 23 + (off ? off.dy : 0);
        marker({ cat: cat, p: p }, px, py, '', p.key, cx, by + 23);
      });
    }

    /* 图例（要单独占一块，不能压在房间上） */
    var used = {};
    points.forEach(function (p) { used[guessCat(p)] = 1; });
    var keys = Object.keys(ICON).filter(function (k) { return used[k]; });
    if (keys.length) {
      lay.height += LEG_H;
      var ly = lay.height - LEG_H / 2;
      var lx = PAD;
      svg.push('<line x1="' + PAD + '" y1="' + (ly - 16) + '" x2="' + (W - PAD) +
        '" y2="' + (ly - 16) + '" stroke="#e5e9f0" stroke-width="1"/>');
      keys.forEach(function (k) {
        var cx = lx + 11, cy = ly;
        svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="#fff" stroke="#0f9d58" stroke-width="1.6"/>');
        svg.push('<text x="' + cx + '" y="' + (cy + 4) + '" font-size="10" font-weight="700" ' +
          'fill="#0f9d58" text-anchor="middle">' + esc(ICON[k]) + '</text>');
        svg.push('<text x="' + (cx + 16) + '" y="' + (cy + 4) + '" font-size="10.5" fill="#4b5563">' +
          esc(CAT_CN_ALIAS[k] || k) + '</text>');
        lx += 100;
      });
    }
    /* 高度改了要同步给 svg 节点，否则图例会被裁掉 */
    svg[0] = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + lay.height +
      '" viewBox="0 0 ' + W + ' ' + lay.height + '" font-family="Microsoft YaHei, PingFang SC, sans-serif">';

    svg.push('</svg>');
    return svg.join('');
  }

  /* 图例中文（尽量与 CAT_CN 对齐，这里做一层映射） */
  var CAT_CN_ALIAS = {
    panel: '开关面板', plug: '智能插座', light: '灯具', bulb: '灯具',
    led: '灯带', curtain: '电动窗帘', sensor: '传感器', presence: '人体存在',
    lock: '智能门锁', camera: '摄像头', speaker: '背景音乐', gateway: '智能中枢',
    ap: '网络设备', valve: '智能阀门', smoke: '烟感', gas: '燃气报警',
    water: '水浸', relay: '控制模块', humid: '湿度', th: '温湿度', other: '其他'
  };

  return { build: build, guessCat: guessCat, ICON: ICON };
})();
