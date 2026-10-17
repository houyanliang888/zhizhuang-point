/* ===========================================================
   主销开关报价模板 · 数据层
   -----------------------------------------------------------
   侯哥两款主销开关：绿米卡农 Z1 标准版、米家 X30。
   这是走量最勤的两个型号，单独做报价模板，比走通用点位清单快。

   价格取自产品库（js/products.js，源自方案模板2026.9.19.xlsx），
   改价只改这里，不要去动 products.js —— 那边是全量库，这里是模板。
   =========================================================== */

/* ---------- 1. 两款开关的规格与价格 ---------- */
var SWITCH_MODELS = {
  z1: {
    id: 'z1',
    name: '绿米卡农 Z1 智能墙壁开关',
    short: 'Z1',
    brand: 'Aqara 绿米',
    /* 一句话说清卖点，报价单上给客户看 */
    pitch: '兼容米家 / Apple HomeKit，火星技术，支持双控与继电器锁定',
    note: '标准版。装好即用，客人最容易接受的价格档。',
    /* keys 按键 → 单价 */
    keys: [
      { k: 1, name: '单键', price: 189 },
      { k: 2, name: '双键', price: 209 },
      { k: 3, name: '三键', price: 229 },
      { k: 4, name: '四键', price: 249 }
    ]
  },
  x30: {
    id: 'x30',
    name: '米家 X30 智能墙壁开关',
    short: 'X30',
    brand: '米家',
    pitch: 'Mesh 2.0 接入，支持开关控制与场景联动自由切换',
    note: '走量款，价格门槛低，适合整屋批量装。',
    keys: [
      { k: 1, name: '单键', price: 175 },
      { k: 2, name: '双键', price: 185 },
      { k: 3, name: '三键', price: 195 },
      { k: 4, name: '四键', price: 205 }
    ]
  }
};

/* 常用规格（表头顺序固定，改了存档会对不上） */
var SWITCH_KEY_ORDER = [1, 2, 3, 4];

/* ---------- 1.5 网关 / 传感器 / 中控屏 / 窗帘电机（v1.14.0 新增） ----------
   这里只放主销/高频款，作为第 7 页快速报价的默认参考价。
   现场改价直接在前台输入框里改，不改这里。

   v1.24.2（按侯哥 2026.10.16 报价表截图对齐）：
   - 传感器价格一律 quoteTablePrice(match, def) 从报价表实时取，报价表改价自动跟
   - 人体 98 / 门窗 76 / 水浸 109（基础款），新增 T1 系列与 FP1E：
     人体T1 199 / 门窗T1 129 / 水浸T1 159 / AI智能存在传感器 FP1E 349 */
var EXTRA_DEVICES = {
  hubM3:      { id: 'hubM3',      name: '智能网关 M3',    unit: '个', price: quoteTablePrice('方舟智慧中枢M3', 1099), match: '方舟智慧中枢M3', icon: '🌐', desc: 'Aqara 方舟智慧中枢 M3' },
  hubMJ:      { id: 'hubMJ',      name: '米家中枢网关',   unit: '个', price: quoteTablePrice('中枢网关', 399), match: '中枢网关', icon: '🔶', desc: '米家/小米中枢网关，米家生态首选' },
  hubM200:    { id: 'hubM200',    name: '智能网关 M200',  unit: '个', price: quoteTablePrice('M200网关', 499), match: 'M200网关', icon: '🌐', desc: '小米中枢网关 M200' },
  motion:     { id: 'motion',     name: '人体传感器',     unit: '个', price: quoteTablePrice('人体传感器', 98),  match: '人体传感器',  icon: '🚶', desc: '光照度检测 + 人/动物移动检测，联动执行场景' },
  motionT1:   { id: 'motionT1',   name: '人体传感器 T1',  unit: '个', price: quoteTablePrice('人体传感器T1', 199), match: '人体传感器T1', icon: '🚶', desc: 'Zigbee3.0，光照度 + 移动检测，T1 升级款' },
  fp1e:       { id: 'fp1e',       name: 'AI智能存在传感器 FP1E', unit: '个', price: quoteTablePrice('AI智能存在传感器 FP1E', 349), match: 'AI智能存在传感器 FP1E', icon: '📡', desc: '毫米波雷达，精准检测人在状态' },
  door:       { id: 'door',       name: '门窗传感器',     unit: '个', price: quoteTablePrice('门窗传感器', 76),  match: '门窗传感器',  icon: '🚪', desc: '检测门窗开关状态，联动执行场景' },
  doorT1:     { id: 'doorT1',     name: '门窗传感器 T1',  unit: '个', price: quoteTablePrice('门窗传感器T1', 129), match: '门窗传感器T1', icon: '🚪', desc: 'Zigbee3.0，检测门窗开关状态，T1 升级款' },
  water:      { id: 'water',      name: '水浸传感器',     unit: '个', price: quoteTablePrice('水浸传感器', 109), match: '水浸传感器',  icon: '💧', desc: '智能检测物体表面漏水状态，可联动报警' },
  waterT1:    { id: 'waterT1',    name: '水浸传感器 T1',  unit: '个', price: quoteTablePrice('水浸传感器T1', 159), match: '水浸传感器T1', icon: '💧', desc: 'Zigbee3.0，检测漏水并联动报警，T1 升级款' },
  siPanel:    { id: 'siPanel',    name: 'SI 集悦中控屏',  unit: '个', price: 1299, icon: '📱', desc: 'SI 集悦智慧中控屏（旧款，报价表已无对应，保留参考价）' },
  mipanel4:   { id: 'mipanel4',   name: '小米4寸中控屏',  unit: '个', price: quoteTablePrice('米家4吋中控屏', 899), match: '米家4吋中控屏', icon: '📺', desc: '小米智能家庭屏 4 英寸，米家生态触控入口' },
  sceneS1:    { id: 'sceneS1',    name: '智能场景面板S1', unit: '个', price: quoteTablePrice('智能场景面板开关S1', 699), match: '智能场景面板开关S1', icon: '🎛️', desc: '兼容 Aqara Home / HomeKit，3.95 英寸全面屏' },
  jiYue:      { id: 'jiYue',      name: '集悦智慧面板',   unit: '个', price: quoteTablePrice('Aqra集悦智慧面板', 1099), match: 'Aqra集悦智慧面板', icon: '🖥️', desc: '支持有线和无线，Aqara 语音管家/手势/触屏' },
  play:       { id: 'play',       name: '小爱音箱 Play',  unit: '个', price: quoteTablePrice('小爱智能音箱Play', 149), match: '小爱智能音箱Play', icon: '🔊', desc: '小爱智能音箱 Play，语音控制入门款' },
  speaker:    { id: 'speaker',    name: '小爱音箱 Pro',   unit: '个', price: quoteTablePrice('小爱智能音箱Pro', 369), match: '小爱智能音箱Pro', icon: '🔊', desc: '小爱智能音箱 Pro，语音控制入口' }
};
var EXTRA_ORDER = ['hubM3', 'hubMJ', 'hubM200', 'motion', 'motionT1', 'fp1e', 'door', 'doorT1', 'water', 'waterT1', 'siPanel', 'mipanel4', 'sceneS1', 'jiYue', 'play', 'speaker'];
var EXTRA_HUB_SENSOR_PANEL = ['hubM3', 'hubMJ', 'hubM200', 'motion', 'motionT1', 'fp1e', 'door', 'doorT1', 'water', 'waterT1', 'siPanel', 'mipanel4', 'sceneS1', 'jiYue', 'play', 'speaker'];
var EXTRA_INSTALL_RATE = 0.30;   /* 安装调试服务费 = 设备费 × 30% */

/* ---------- 1.7 电动窗帘（v1.18 重做） ----------
   ⚠ v1.14 时这里写的是「C200 ¥499 / E1 ¥399」，**这两个数是我拍脑袋编的，报价表里根本没有**。
      报价表实际口径是：**电机 + 轨道一体套装，按轨道宽度分档报价**，不带轨道没法装。

   报价表（cat=curtain）原文形如「5m智能窗帘（C200）」，规律 = 宽度 + 系列。
   所以这里按宽度分档列出，宽度直接决定价格，选宽了轨道就跟着对上。

   width 单位 = 米（轨道长度），一个窗位 = 一套（电机+轨道+帘布安装件）。 */
var CURTAIN_SERIES = {
  C200: {
    id: 'C200', name: 'C200 智能窗帘（电机+轨道）', icon: '🪟',
    widths: [
      { w: 3.5, match: '3.5m智能窗帘（C200）' },
      { w: 4,   match: '4m智能窗帘（C200）' },
      { w: 5,   match: '5m智能窗帘（C200）' },
      { w: 6,   match: '6m智能窗帘（C200）' },
      { w: 7,   match: '7m智能窗帘（C200）' }
    ],
    def: 1099, note: '中高端，客厅/主卧常用'
  },
  E1: {
    id: 'E1', name: 'E1 智能窗帘（电机+轨道）', icon: '🪟',
    widths: [
      { w: 3.5, match: '3.5m智能窗帘（E1）' },
      { w: 4,   match: '4m智能窗帘（E1）' },
      { w: 5,   match: '5m智能窗帘（E1）' },
      { w: 6,   match: '6m智能窗帘（E1）' },
      { w: 7,   match: '7m智能窗帘（E1）' },
      { w: 8,   match: '8m智能窗帘（E1）' }
    ],
    def: 799, note: '走量款，价格门槛低'
  }
};
/* v1.21：按侯哥要求精简为两个主销系列（C200 中高端 / E1 走量）。
   T2 和智能罗马杆已从快捷列表移除 —— 报价表里仍有，需要时用「从报价表选窗帘」找。 */
var CURTAIN_ORDER = ['C200', 'E1'];
var CURTAIN_DEFAULT_WIDTH = 4;   /* 默认按 4 米档报价，最常见 */

/* 取某系列某宽度的套装价（查不到用该系列 def 兜底） */
function curtainPriceAt(seriesId, width) {
  var s = CURTAIN_SERIES[seriesId];
  if (!s) return 0;
  var w = parseFloat(width) || CURTAIN_DEFAULT_WIDTH;
  var hit = null, near = null;
  for (var i = 0; i < s.widths.length; i++) {
    var x = s.widths[i];
    if (x.w === w) { hit = x; break; }
    if (!near || Math.abs(x.w - w) < Math.abs(near.w - w)) near = x;
  }
  if (!hit) hit = near || s.widths[0];
  return quoteTablePrice(hit.match, s.def);
}

/* 某系列可用的宽度列表（报价表里有的档位） */
function curtainWidths(seriesId) {
  var s = CURTAIN_SERIES[seriesId];
  return s ? s.widths.slice() : [];
}

/* 清单条目键：系列|宽度，例如 'C200|4' */
function curtainKey(seriesId, width) {
  return seriesId + '|' + width;
}

/* ---------- 1.6 照明灯具（v1.15.0 新增） ----------
   ⚠ 单价**不写死**，全部从产品库报价表（js/products.js，源自方案模板 2026.9.19.xlsx）
   实时提取：match = 报价表里 products.js 的 type 字段原文。
   以后在「产品库」改了灯具报价，这里自动跟着变，不用再动代码。
   def 只是报价表万一缺货时的兜底价，正常一定走报价表。

   beam：光束角度。射灯/筒灯同一个灯体换个角度就是另一个价，所以做成下拉可选项。
   格式 [{ v: 角度标签, match: 报价表type原文, def: 兜底价 }]，只有一条就是固定角度。 */
var LIGHT_GROUPS = [
  { id: 'spot',   name: '射灯',   icon: '🔦', items: [
    { id: 'spotT3',    name: 'Aqara 射灯 T3',       match: 'Aqara射灯T3-24°',        unit: '个', def: 169,
      beam: [ { v: '15°', match: 'Aqara射灯T3-15°', def: 169 },
              { v: '24°', match: 'Aqara射灯T3-24°', def: 169 },
              { v: '36°', match: 'Aqara射灯T3-36°', def: 169 } ] },
    { id: 'spotYH4',   name: '雅惠四代射灯 DSX055C', match: '雅惠四代射灯DSX055C',    unit: '个', def: 99 },
    { id: 'spotYS',    name: '雅思射灯 DSC055X',     match: '雅思射灯DSC055X',        unit: '个', def: 119 },
    { id: 'spotT2Pro', name: 'Aqara 射灯 T2Pro',    match: 'Aqara射灯T2Pro-24°（75mm）',     unit: '个', def: 309,
      beam: [ { v: '15°', match: 'Aqara射灯T2Pro-15°（75mm）', def: 309 },
              { v: '24°', match: 'Aqara射灯T2Pro-24°（75mm）', def: 309 },
              { v: '36°', match: 'Aqara射灯T2Pro-36°（75mm）', def: 309 } ] },
    { id: 'spotH1',    name: '臻彩光筒射灯 H1',     match: '臻彩光筒射灯H1-36°',     unit: '个', def: 359,
      beam: [ { v: '24°', match: '臻彩光筒射灯H1-24°', def: 359 },
              { v: '36°', match: '臻彩光筒射灯H1-36°', def: 359 },
              { v: '60°', match: '臻彩光筒射灯H1-60°', def: 359 } ] },
    { id: 'spotV1',    name: 'Aqara 射灯 V1（Φ75）', match: 'Aqara射灯V1-24°（Φ75-12W）', unit: '个', def: 539,
      beam: [ { v: '15°', match: 'Aqara射灯V1-15°（Φ75-12W）', def: 539 },
              { v: '24°', match: 'Aqara射灯V1-24°（Φ75-12W）', def: 539 },
              { v: '36°', match: 'Aqara射灯V1-36°（Φ75-12W）', def: 539 } ] }
  ]},
  { id: 'down',   name: '筒灯',   icon: '💡', items: [
    { id: 'downT2Pro', name: 'Aqara 筒灯 T2Pro',    match: 'Aqara筒灯T2Pro',        unit: '个', def: 309 },
    { id: 'downXBN',   name: '肖邦太阳神筒灯',       match: '肖邦太阳神筒灯DDF075F',  unit: '个', def: 193 },
    { id: 'downM20',   name: 'M20 明装筒灯',         match: 'M20明装筒灯',            unit: '个', def: 199 },
    { id: 'downE20',   name: 'E20 嵌入式筒灯 3 寸',  match: 'E20嵌入式筒灯-3寸',      unit: '个', def: 299 },
    { id: 'downT2',    name: 'Aqara 筒灯 T2',       match: 'Aqara筒灯T2-60° AQARAT2', unit: '个', def: 249 }
  ]},
  { id: 'strip',  name: '灯带',   icon: '🌈', items: [
    { id: 'stripOne', name: 'Aqara 单色温灯带',     match: 'Aqara单色温灯带',        unit: '米', def: 60 },
    { id: 'stripTwo', name: 'Aqara 双色温灯带 T2',  match: 'Aqara双色温灯带T2',      unit: '米', def: 65 },
    { id: 'stripRGB', name: 'RGBW 灯带',            match: 'RGBW灯带',              unit: '米', def: 95 },
    { id: 'stripH1',  name: '臻彩光四色裸板灯带 H1', match: '臻彩光四色裸板灯带 H1', unit: '米', def: 80 }
  ]},
  /* 灯带配套件（v1.22：按侯哥报价单逻辑自动配）
     双色温灯带配 1 个智能灯带驱动模块；
     每 10 米配 1 个双色温灯带调光模块（PWM），不足 10 米按 10 米算；
     电源每满 10 米加 100W，用 200W 规格向上取整。 */
  { id: 'accessory', name: '灯带配套件', icon: '🔌', items: [
    { id: 'stripDriverModule', name: '智能灯带驱动模块', match: '智能灯带驱动模块', unit: '个', def: 299 },
    { id: 'stripPWMTwo',       name: '双色温灯带调光模块（PWM）', match: '双色温灯带调光模块（PWM）', unit: '个', def: 116 },
    { id: 'stripPower200',     name: '200W 电源',        match: '200W电源',        unit: '个', def: 156 }
  ]},
  { id: 'ceiling',name: '吸顶灯', icon: '🛋️', items: [
    { id: 'ceilL1',   name: '吸顶灯 L1-350',        match: '吸顶灯L1-350',           unit: '个', def: 249 },
    { id: 'ceilHC32', name: 'Aqara 幻彩吸顶灯 32W', match: 'Aqara 幻彩吸顶灯T1-32W',  unit: '个', def: 499 },
    { id: 'ceilHC40', name: 'Aqara 幻彩吸顶灯 40W', match: 'Aqara 幻彩吸顶灯T1-40W',  unit: '个', def: 599 },
    { id: 'ceilXY55', name: '星云吸顶灯 H1 55W',    match: '星云吸顶灯 H1（55W）',   unit: '个', def: 999 },
    { id: 'ceilWX60', name: '万象天镜吸顶灯 60W',   match: '万象天镜吸顶灯V1-60W',   unit: '个', def: 1899 }
  ]},
  { id: 'grid',   name: '格栅灯', icon: '🔲', items: [
    { id: 'gridM6',   name: '米家智能格栅灯 6 头',  match: '米家智能格栅灯（6头）',  unit: '个', def: 246 },
    { id: 'gridM12',  name: '米家智能格栅灯 12 头', match: '米家智能格栅灯（12头）', unit: '个', def: 276 },
    { id: 'gridH6',   name: 'H1 智能格栅灯 pro 6 头',  match: 'H1智能格栅灯pro（6头）',  unit: '个', def: 419 },
    { id: 'gridH12',  name: 'H1 智能格栅灯 pro 12 头', match: 'H1智能格栅灯pro（12头）', unit: '个', def: 519 }
  ]},
  { id: 'track',  name: '磁吸轨道', icon: '🧲', items: [
    { id: 'trackM',   name: '米家智能磁吸轨道',     match: '米家智能磁吸轨道',       unit: '米', def: 139 },
    { id: 'trackV1',  name: 'V1 调光磁吸轨道 1m',  match: 'V1调光磁吸轨道-1m',      unit: '米', def: 159 },
    { id: 'trackV1T', name: 'V1 超薄调光磁吸轨道 1m', match: 'V1超薄调光磁吸轨道-1m', unit: '米', def: 199 },
    { id: 'trackZC',  name: 'ZC 暗装磁吸轨道',      match: 'ZC暗装磁吸轨道',         unit: '米', def: 78  },
    { id: 'trackDS',  name: 'DS 暗装磁吸轨道',      match: 'DS暗装磁吸轨道',         unit: '米', def: 145 }
  ]}
];

/* 按 type 原文到报价表里取单价。取不到就用 def 兜底。 */
function quoteTablePrice(match, def) {
  var list = (typeof PRODUCTS !== 'undefined' && PRODUCTS) ? PRODUCTS : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].type === match && list[i].price != null) {
      return Math.round(list[i].price);
    }
  }
  return def;
}

/* 某个灯具在指定角度下的价格（angle 为空就用默认） */
function lightPriceAt(id, angle) {
  var f = LIGHT_FIXTURES[id];
  if (!f) return 0;
  if (!f.beam || !f.beam.length) return f.price;
  var hit = null;
  for (var i = 0; i < f.beam.length; i++) {
    if (angle && f.beam[i].v === angle) { hit = f.beam[i]; break; }
  }
  if (!hit) hit = f.beam[0];
  return quoteTablePrice(hit.match, hit.def);
}

/* 摊平成 { id: {id,name,unit,icon,group,groupName,price,beam} } */
var LIGHT_FIXTURES = {};
var LIGHT_ORDER = [];
var LIGHT_GROUP_ORDER = [];
(function buildLightFixtures() {
  LIGHT_GROUPS.forEach(function (g) {
    LIGHT_GROUP_ORDER.push(g.id);
    g.items.forEach(function (it) {
      /* beam 里每档角度都提前把报价表价查好，页面上下拉换角度时不用再查 */
      var beam = null;
      if (it.beam && it.beam.length) {
        beam = it.beam.map(function (b) {
          return { v: b.v, match: b.match, price: quoteTablePrice(b.match, b.def) };
        });
      }
      LIGHT_FIXTURES[it.id] = {
        id: it.id, name: it.name, unit: it.unit, icon: g.icon,
        group: g.id, groupName: g.name,
        price: beam ? beam[0].price : quoteTablePrice(it.match, it.def),
        match: it.match,
        beam: beam
      };
      LIGHT_ORDER.push(it.id);
    });
  });
})();

/* 辅料黑名单：型材/套管是铝型材和硅胶管，不是灯本身；
   电源和导电模块保留（配磁吸轨道本来就要单独买电源）。 */
var LIGHT_PICK_EXCLUDE = ['型材', '套管'];

/* 取报价表里全部灯具（cat=light），供「从报价表选灯具」用
   排除辅料，免得选择器底部混进「线性灯型材」这种跟灯不搭的东西 */
function quoteTableLights(kw) {
  var list = (typeof PRODUCTS !== 'undefined' && PRODUCTS) ? PRODUCTS : [];
  kw = (kw || '').trim().toLowerCase();
  return list.filter(function (p) {
    if (!p || p.cat !== 'light') return false;
    var t = p.type || '';
    for (var i = 0; i < LIGHT_PICK_EXCLUDE.length; i++) {
      if (t.indexOf(LIGHT_PICK_EXCLUDE[i]) >= 0) return false;
    }
    if (!kw) return true;
    return (t + ' ' + (p.name || '') + ' ' + (p.spec || '') + ' ' + (p.src || ''))
      .toLowerCase().indexOf(kw) >= 0;
  }).slice(0, 300);
}

/* 辅料黑名单：帘布/帘头轨/升降配件是配套辅料，不是窗帘电机套装 */
var CURTAIN_PICK_EXCLUDE = ['帘布', '帘头轨', '升降配件'];

/* 取报价表里全部电动窗帘（cat=curtain），供「从报价表选窗帘」用
   排除辅料，免得选择器底部混进「帘头轨」这种跟电机不搭的东西 */
function quoteTableCurtains(kw) {
  var list = (typeof PRODUCTS !== 'undefined' && PRODUCTS) ? PRODUCTS : [];
  kw = (kw || '').trim().toLowerCase();
  return list.filter(function (p) {
    if (!p || p.cat !== 'curtain') return false;
    var t = p.type || '';
    for (var i = 0; i < CURTAIN_PICK_EXCLUDE.length; i++) {
      if (t.indexOf(CURTAIN_PICK_EXCLUDE[i]) >= 0) return false;
    }
    if (!kw) return true;
    return (t + ' ' + (p.name || '') + ' ' + (p.spec || '') + ' ' + (p.src || ''))
      .toLowerCase().indexOf(kw) >= 0;
  }).slice(0, 300);
}

/* ---------- 1.6.5 图纸标记 ↔ 房间清单数字 同步（v1.28，侯哥 2026.10.17 要求） ----------
   图纸上标设备并指定房间 → 该房间对应列 +1 → 第 3 页点位跟着变（genPoints 以清单数为准）；
   房间清单改数字 → 图纸上该房间该类型标记自动补齐/裁剪。
   先打通两类主销：switch→sw（开关）、sensor→sn（传感器），其余类型仅视觉标注。 */
var MARKER_ROOM_FIELD = { switch: 'sw', sensor: 'sn' };

function markerRoomField(type) { return MARKER_ROOM_FIELD[type] || null; }

/* 给定房间与全局标记数组，返回补齐/裁剪后的新数组（纯函数，不改入参） */
function syncRoomMarkers(room, markers, mkId) {
  var out = (markers || []).slice();
  Object.keys(MARKER_ROOM_FIELD).forEach(function (type) {
    var field = MARKER_ROOM_FIELD[type];
    var want = Math.max(0, parseInt(room[field], 10) || 0);
    var idxs = [];
    out.forEach(function (m, i) { if (m.type === type && m.room === room.name) idxs.push(i); });
    /* 多了：从后往前删 */
    while (idxs.length > want) { out.splice(idxs.pop(), 1); }
    /* 少了：补在该房间已有标记旁（小偏移防叠死）；没有旧标记就放图中心区散布 */
    for (var k = idxs.length; k < want; k++) {
      var base = null;
      for (var j = 0; j < out.length; j++) {
        if (out[j].type === type && out[j].room === room.name) { base = out[j]; break; }
      }
      var x = base ? Math.min(0.96, base.x + 0.045) : 0.46 + 0.05 * (k % 5);
      var y = base ? Math.min(0.94, base.y + 0.045) : 0.42 + 0.05 * Math.floor(k / 5);
      out.push({ id: mkId ? mkId() : 'mk_' + Date.now() + '_' + k, type: type, x: x, y: y, label: '', room: room.name });
    }
  });
  return out;
}

/* ---------- 2. 空间清单 ---------- */
/* 用系统通用的空间名，跟报价单、点位清单口径一致 */
var SWITCH_ROOMS = [
  { id: 'living', name: '客厅', icon: '🛋️' },
  { id: 'dining', name: '餐厅', icon: '🍽️' },
  { id: 'kitchen', name: '厨房', icon: '🍳' },
  { id: 'master', name: '主卧', icon: '🛏️' },
  { id: 'second', name: '次卧', icon: '🛌' },
  { id: 'kids', name: '儿童房', icon: '🧸' },
  { id: 'study', name: '书房', icon: '📚' },
  { id: 'bath', name: '卫生间', icon: '🛁' },
  { id: 'balcony', name: '阳台', icon: '🌤️' },
  { id: 'entry', name: '玄关', icon: '🚪' },
  { id: 'hall', name: '过道', icon: '🚶' },
  { id: 'other', name: '其他', icon: '📦' }
];

/* ---------- 自定义空间（v1.21 新增） ----------
   原来只有上面 12 个固定空间，遇到「影音室」「下沉式庭院」这种就得挤进「其他」。
   现在可以在页面上自己加空间，加进来的排在固定空间后面，各型号表格同步出现。

   custom=true 表示这是用户加的；id 用 cu_时间戳 避免和固定空间撞。
   常驻在 quote-switch.js 的模块级变量里，不随方案存档（SW 本身就是内存态）。 */
var SWITCH_CUSTOM_ROOMS = [];
var ROOM_ICONS = ['📦','🎬','🏋️','🧖','🍶','🛋️','🧘','🚿','🪴','🐱','👶','🧴','🏠','🚗','🅿️','🌿'];

function addCustomRoom(name) {
  name = String(name || '').trim();
  if (!name) return null;
  /* 重名不重复加 */
  for (var i = 0; i < SWITCH_CUSTOM_ROOMS.length; i++) {
    if (SWITCH_CUSTOM_ROOMS[i].name === name) return SWITCH_CUSTOM_ROOMS[i];
  }
  var room = {
    id: 'cu_' + Date.now() + '_' + SWITCH_CUSTOM_ROOMS.length,
    name: name,
    icon: ROOM_ICONS[SWITCH_CUSTOM_ROOMS.length % ROOM_ICONS.length],
    custom: true
  };
  SWITCH_CUSTOM_ROOMS.push(room);
  return room;
}

function removeCustomRoom(id) {
  for (var i = 0; i < SWITCH_CUSTOM_ROOMS.length; i++) {
    if (SWITCH_CUSTOM_ROOMS[i].id === id) { SWITCH_CUSTOM_ROOMS.splice(i, 1); return true; }
  }
  return false;
}

/* 固定 + 自定义，自定义排在后面 */
function allSwitchRooms() {
  return SWITCH_ROOMS.concat(SWITCH_CUSTOM_ROOMS);
}

/* ---------- 3. 工具函数 ---------- */
function switchModel(id) { return SWITCH_MODELS[id] || SWITCH_MODELS.z1; }
function switchKeys(id) { return switchModel(id).keys; }

/* 取某个型号某个按键的价格。
   keyCount 可能从 JSON 读成字符串，所以用 == 做兼容匹配。 */
function switchPrice(modelId, keyCount) {
  var m = switchModel(modelId);
  for (var i = 0; i < m.keys.length; i++) {
    if (m.keys[i].k == keyCount) return m.keys[i].price;
  }
  return 0;
}

/* 汇总一批记录：recs = [{ model, room, key, qty }]
   返回按型号 + 按按键 双维度统计，加总合计 */
function sumSwitchQuote(recs) {
  var out = {
    byModel: {},   /* modelId -> { model, qty, money, rows:[{k,name,price,qty,sub}] } */
    byKey: {},     /* modelId -> { 1:{name,price,qty,sub}, 2:... } */
    total: 0,
    totalQty: 0
  };

  (recs || []).forEach(function (r) {
    var qty = Math.max(0, parseInt(r.qty, 10) || 0);
    if (!qty) return;
    var mid = r.model, kc = (+r.key) || 0, price = switchPrice(mid, kc);

    if (!out.byModel[mid]) {
      out.byModel[mid] = {
        model: switchModel(mid), qty: 0, money: 0, rows: [],
        _seen: {}
      };
    }
    var bm = out.byModel[mid];

    if (!out.byKey[mid]) out.byKey[mid] = {};
    if (!out.byKey[mid][kc]) {
      out.byKey[mid][kc] = { key: kc, qty: 0, money: 0 };
    }
    out.byKey[mid][kc].qty += qty;
    out.byKey[mid][kc].money += price * qty;

    if (!bm._seen[kc]) {
      bm._seen[kc] = true;
      bm.rows.push({ k: kc, qty: qty, price: price, sub: price * qty });
    } else {
      for (var i = 0; i < bm.rows.length; i++) {
        if (bm.rows[i].k === kc) {
          bm.rows[i].qty += qty;
          bm.rows[i].sub = bm.rows[i].price * bm.rows[i].qty;
        }
      }
    }
    bm.qty += qty;
    bm.money += price * qty;
    out.total += price * qty;
    out.totalQty += qty;
  });

  /* rows 按按键数排序，好看 */
  Object.keys(out.byModel).forEach(function (mid) {
    out.byModel[mid].rows.sort(function (a, b) { return a.k - b.k; });
  });

  /* 别名：调用方习惯写 s.qty / s.money，这两个是同一份数据的短名。
     v1.8.0 时只给了 total/totalQty，汇总框读 s.qty 一直是 undefined，
     导致「绿米 Z1 合计 ¥0」这个显示问题。这里补上，两种写法都能用。 */
  out.qty = out.totalQty;
  out.money = out.total;
  return out;
}

/* 生成一张空白录入表：每个空间 × 每种按键一行 */
function blankSwitchRecs(modelId) {
  var recs = [];
  allSwitchRooms().forEach(function (rm) {
    SWITCH_KEY_ORDER.forEach(function (k) {
      recs.push({ model: modelId, room: rm.id, roomName: rm.name, key: k, qty: 0 });
    });
  });
  return recs;
}

/* ===========================================================
   4. 从房间清单带入
   -----------------------------------------------------------
   第 1 步的房间表里每个空间填了「开关 = N」，但报价表要的是
   「单键几面 / 双键几面…」。中间差一个分配策略，这儿提供 5 种。

   每种策略返回 { 1:面数, 2:面数, 3:面数, 4:面数 }。
   =========================================================== */

/* 各空间类型的推荐按键数策略（默认策略用）
   一个开关面板控一路灯，多出来的一两路才会做成多键。 */
var SWITCH_STRATEGY = {
  smart: {
    id: 'smart',
    name: '按经验分（推荐）',
    desc: '少量开关按单键，多了自动升到双键/三键，最贴近实际装法'
  },
  /* 这三个是「比例分配」：按不同占比摊，不是全压一种键。
     v1.14 的 all1/all2/all4 是「全按某一种键」，会把另外三档报成 0 面，
     报价单看着很怪（客户一看全是单键，会怀疑是不是漏报了）。v1.20 改成比例。 */
  mix1: {
    id: 'mix1',
    name: '均衡型（推荐给简装）',
    desc: '单键 60% / 双键 30% / 三键 10%，几乎不用四键，预算实在',
    ratio: { 1: 0.60, 2: 0.30, 3: 0.10, 4: 0 }
  },
  mix2: {
    id: 'mix2',
    name: '标准型（最常见）',
    desc: '单键 40% / 双键 35% / 三键 20% / 四键 5%，常规住宅',
    ratio: { 1: 0.40, 2: 0.35, 3: 0.20, 4: 0.05 }
  },
  mix3: {
    id: 'mix3',
    name: '豪华型（大平层/挑高）',
    desc: '单键 25% / 双键 35% / 三键 25% / 四键 15%，灯路多',
    ratio: { 1: 0.25, 2: 0.35, 3: 0.25, 4: 0.15 }
  }
};

/* 经验分配：N 面开关 → 怎么摊到各按键规格上
   硬约束①：各按键面数之和必须恒等于 N（不能凭空多出或少掉面板，少算就是漏报）
   硬约束②：四档规格都用上，别整屋全是单键，报价单难看、客户也信不过

   做法：按「单 单 双 双 双 三 四」这个循环铺，铺满 N 面就停。
   N=1 → 单1     N=2 → 单1 双1   N=3 → 单1 双1 双1
   N=7 → 四档各1N=8 → 循环第二轮

   这个顺序不是随排的：现场最常见是「一路单控」，其次是「双控」，
   所以单键排头、双键占大头，三键/四键留给灯多的大空间。 */
var ALLOC_PATTERN = [1, 1, 2, 2, 2, 3, 4];

function allocSmart(n) {
  n = Math.max(0, parseInt(n, 10) || 0);
  var out = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (var i = 0; i < n; i++) out[ALLOC_PATTERN[i % ALLOC_PATTERN.length]]++;
  return out;
}

/* 比例分配：按 strategy 的 ratio 摊，同时保证
   ① 各键面数之和 == N（一条都不能少，少了就是漏报）
   ② 有余数时优先补双键（现场最常用），不会出现「填了 17 面，单键 10 双键 6 三键 1」的零碎数字
   ③ N 很小时（1~3 面）保证至少有双键出现，不然又变成"全是单键"
   N=17 → mix2(单40/双35/三20/四5)：7/6/3/1，和正好 17 */
function allocByRatio(n, ratio) {
  n = Math.max(0, parseInt(n, 10) || 0);
  var out = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!n) return out;

  /* 1~3 面的小空间直接走经验分配。原因：比例算出来
     1 面可能是「双键」、2 面可能是「单1双1」—— 现场一个面板就是一路灯，
     硬套比例反而不像真实施法。小空间交给 ALLOC_PATTERN 更准。 */
  if (n <= 3) return allocSmart(n);

  var keys = [1, 2, 3, 4];
  var sum = 0;
  keys.forEach(function (k) { sum += Math.max(0, ratio[k] || 0); });
  if (!sum) return allocSmart(n);          /* ratio 全 0 退回经验分配 */

  var assigned = 0;
  keys.forEach(function (k) {
    var v = Math.floor(n * (ratio[k] || 0) / sum);
    out[k] = v;
    assigned += v;
  });

  /* 余数优先补双键 → 单键 → 三键 → 四键 */
  var rest = n - assigned;
  var order = [2, 1, 3, 4];
  var idx = 0;
  while (rest > 0 && idx < order.length * 3) {
    out[order[idx % order.length]]++;
    rest--;
    idx++;
  }
  /* 极端兜底：万一 order 循环补完还没补够（不会发生，但别留隐患） */
  while (rest > 0) { out[1]++; rest--; }

  /* 小空间保障：N>=2 且只有单键时，借一个单键给双键，
     避免"2 面开关全是单键"这种客户会起疑的报价 */
  if (n >= 2 && out[2] === 0 && out[1] >= 2) {
    out[1]--; out[2] = 1;
  }
  return out;
}

/* 按策略把一个空间的开关总数摊成按键分布
   v1.20：mix1/mix2/mix3 走比例分配，smart 走经验循环 */
function allocSwitchKeys(n, strategyId) {
  n = Math.max(0, parseInt(n, 10) || 0);
  var out = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!n) return out;
  var st = SWITCH_STRATEGY[strategyId];
  if (st && st.ratio) return allocByRatio(n, st.ratio);
  /* 兼容旧存档里存的 all1/all2/all4 —— 已废弃，但老方案打开不该报错。
     现在按最接近的 mix 档处理，不再报成"全是单键"。 */
  if (strategyId === 'all1') return allocByRatio(n, SWITCH_STRATEGY.mix1.ratio);
  if (strategyId === 'all2') return allocByRatio(n, SWITCH_STRATEGY.mix2.ratio);
  if (strategyId === 'all4') return allocByRatio(n, SWITCH_STRATEGY.mix3.ratio);
  return allocSmart(n);
}

/* 从房间清单生成带入方案
   rooms = [{ type, name, sw }]（来自 S.rooms）
   返回 [{ roomId, roomName, icon, total, alloc:{1:..,2:..,3:..,4:..}, matched }]
   matched=false 表示该空间在报价表里没有对应行（自定义空间名） */
function planSwitchFromRooms(rooms, strategyId) {
  var byId = {};
  allSwitchRooms().forEach(function (rm) { byId[rm.id] = rm; });

  return (rooms || []).map(function (r) {
    var rm = byId[r.type] || null;
    var total = Math.max(0, parseInt(r.sw, 10) || 0);
    return {
      roomId: r.type,
      roomName: r.name || (rm ? rm.name : '空间'),
      icon: rm ? rm.icon : '📦',
      total: total,
      alloc: allocSwitchKeys(total, strategyId),
      matched: !!rm
    };
  }).filter(function (x) { return x.total > 0; });
}

/* ===========================================================
   5. 照明灯具 · 按房间带入（v1.16 新增）
   -----------------------------------------------------------
   开关那边是「按按键数摊」，灯具这边按面积摊更贴近实际装法：
   一个 20㎡ 客厅要 6~8 个射灯，10㎡ 卫生间 2~3 个筒灯就够。

   规则来源：行业常规「每 N ㎡ 一个」的布灯密度，按空间类型分档，
   再设上下限兜底（小空间不至于装 0 个，大空间不至于爆量）。
   =========================================================== */

/* 各空间类型的布灯密度：每平米几个 + 上下限 */
var LIGHT_DENSITY = {
  living: { spot: 0.32, min: 4, max: 12 },   /* 客厅：射灯打墙打柜 */
  dining: { spot: 0.25, min: 3, max: 10 },   /* 餐厅：重点照餐边/吊灯下 */
  kitchen: { down: 0.35, min: 2, max: 8 },   /* 厨房：操作台筒灯 */
  master: { spot: 0.22, min: 3, max: 8 },    /* 主卧：柔和不刺眼 */
  second: { spot: 0.20, min: 2, max: 6 },
  kids:   { spot: 0.20, min: 2, max: 6 },
  study:  { spot: 0.25, min: 3, max: 8 },    /* 书房：桌面照明要够 */
  bath:   { down: 0.25, min: 2, max: 6 },    /* 卫生间：防潮筒灯 */
  balcony:{ down: 0.18, min: 1, max: 4 },
  entry:  { down: 0.20, min: 1, max: 4 },    /* 玄关：感应灯常驻 */
  hall:   { down: 0.15, min: 1, max: 5 },    /* 过道：筒灯连排 */
  other:  { down: 0.20, min: 1, max: 6 }
};

/* 布灯密度档位：倍数越大灯越多，方便现场按预算调 */
var LIGHT_STRATEGY = {
  basic: { id: 'basic', name: '基础够亮', k: 0.75, desc: '灯少一点，预算最低，适合出租房/简装' },
  smart: { id: 'smart', name: '按经验分（推荐）', k: 1, desc: '按面积常规布灯，最贴近实际装法' },
  rich:  { id: 'rich', name: '重点照明', k: 1.4, desc: '灯多一倍，重点空间照得更足' }
};

/* 某个空间该装几个灯：面积 × 密度 × 档位倍数，再夹在上下限里
   注意 LIGHT_DENSITY 里密度值统一用 spot / down 作键（表示这空间配哪类灯），
   所以这里取哪个键都行，只要存在即可。 */
function lightQtyForRoom(room, strategyId) {
  var d = LIGHT_DENSITY[room.type] || LIGHT_DENSITY.other;
  var st = LIGHT_STRATEGY[strategyId] || LIGHT_STRATEGY.smart;
  var density = (d.spot != null) ? d.spot : (d.down != null ? d.down : 0.2);
  var area = Math.max(0, parseFloat(room.area) || 0);
  var n = Math.round(area * density * st.k);
  /* 面积没填就退回下限，别算成 0 */
  if (area <= 0) n = d.min;
  return Math.min(d.max, Math.max(d.min, n));
}

/* 一个空间的灯具体建议：{ spot:n } 或 { down:n }（只给该空间推荐的那一类） */
function lightPlanForRoom(room, strategyId) {
  var d = LIGHT_DENSITY[room.type] || LIGHT_DENSITY.other;
  var kind = (d.spot != null) ? 'spot' : 'down';
  var out = {};
  out[kind] = lightQtyForRoom(room, strategyId);
  return out;
}

/* 整份房间清单 → 灯具带入方案
   返回 [{ roomId, roomName, icon, area, plan:{spot:n,down:n}, matched }] */
function planLightsFromRooms(rooms, strategyId) {
  var byId = {};
  allSwitchRooms().forEach(function (rm) { byId[rm.id] = rm; });

  return (rooms || []).map(function (r) {
    var rm = byId[r.type] || null;
    return {
      roomId: r.type,
      roomName: r.name || (rm ? rm.name : '空间'),
      icon: rm ? rm.icon : '📦',
      area: Math.max(0, parseFloat(r.area) || 0),
      plan: lightPlanForRoom(r, strategyId),
      matched: !!rm
    };
  });
}

/* 按品类把带入方案汇总成「每个品类装几个」 */
function sumLightPlan(plan) {
  var out = {};
  (plan || []).forEach(function (x) {
    Object.keys(x.plan || {}).forEach(function (k) {
      out[k] = (out[k] || 0) + x.plan[k];
    });
  });
  return out;
}


/* ===========================================================
   6. 灯带米数自动估算（v1.17 新增）
   -----------------------------------------------------------
   灯带按「米」报价，最容易漏报也最容易报虚。两种算法：

   ① 周长优先：房间清单填了「周长」就按周长算。
      客厅/餐厅走一圈回字形 → 周长 × 1.0
      卧室/书房走床头+衣柜 → 周长 × 0.5
      厨卫走台面/镜前       → 周长 × 0.35

   ② 没填周长就退回按面积估：房间按长方形算，周长 ≈ 4√面积。
      这样就算没量尺寸也能出个大概数，不至于算成 0。

   再套一层上下限，避免小房间算出一堆米、大房间报出离谱的数。
   =========================================================== */

/* 各空间类型的灯带用量：相对周长的倍数 + 上下限 + 面积兜底密度 */
var STRIP_RULE = {
  living:  { k: 1.00, min: 6,  max: 40, areaK: 0.55 },  /* 客厅：回字形走一圈 */
  dining:  { k: 0.85, min: 4,  max: 30, areaK: 0.45 },  /* 餐厅：餐边一圈 */
  kitchen: { k: 0.35, min: 2,  max: 12, areaK: 0.25 },  /* 厨房：台面下柜 */
  master:  { k: 0.50, min: 4,  max: 24, areaK: 0.32 },  /* 主卧：床头+衣柜 */
  second:  { k: 0.45, min: 3,  max: 20, areaK: 0.28 },
  kids:    { k: 0.45, min: 3,  max: 20, areaK: 0.28 },
  study:   { k: 0.50, min: 4,  max: 24, areaK: 0.30 },  /* 书房：书桌+柜顶 */
  bath:    { k: 0.35, min: 2,  max: 12, areaK: 0.22 },  /* 卫生间：镜前 */
  balcony: { k: 0.40, min: 2,  max: 15, areaK: 0.25 },
  entry:   { k: 0.40, min: 2,  max: 12, areaK: 0.22 },  /* 玄关：柜底感应 */
  hall:    { k: 0.70, min: 3,  max: 25, areaK: 0.40 },  /* 过道：一条长灯带 */
  other:   { k: 0.40, min: 2,  max: 15, areaK: 0.25 }
};

/* 长方形房间：周长 ≈ 4√面积（10㎡ → 12.6m，符合实际） */
function estimatedPerimeter(area) {
  area = Math.max(0, parseFloat(area) || 0);
  if (area <= 0) return 0;
  return 4 * Math.sqrt(area);
}

/* 取房间周长：填了用填的，没填按面积估 */
function roomPerimeter(room) {
  var p = parseFloat(room.peri) || 0;
  if (p > 0) return p;
  return estimatedPerimeter(room.area);
}

/* 某个空间的灯带米数。strategyId 复用密度档（basic/smart/rich） */
function stripMetersForRoom(room, strategyId) {
  var r = STRIP_RULE[room.type] || STRIP_RULE.other;
  var st = LIGHT_STRATEGY[strategyId] || LIGHT_STRATEGY.smart;
  var peri = roomPerimeter(room);
  var area = Math.max(0, parseFloat(room.area) || 0);

  var n;
  if (parseFloat(room.peri) > 0) {
    /* 填了周长 → 按周长倍数算 */
    n = Math.round(peri * r.k * st.k);
  } else if (area > 0) {
    /* 没填周长 → 按面积密度估 */
    n = Math.round(area * r.areaK * st.k);
  } else {
    n = r.min;   /* 两个都没填，给下限 */
  }
  return Math.min(r.max, Math.max(r.min, n));
}

/* 整份房间清单 → 灯带米数带入方案 */
function planStripsFromRooms(rooms, strategyId) {
  var byId = {};
  allSwitchRooms().forEach(function (rm) { byId[rm.id] = rm; });

  return (rooms || []).map(function (r) {
    var rm = byId[r.type] || null;
    var hasPeri = (parseFloat(r.peri) || 0) > 0;
    return {
      roomId: r.type,
      roomName: r.name || (rm ? rm.name : '空间'),
      icon: rm ? rm.icon : '📦',
      area: Math.max(0, parseFloat(r.area) || 0),
      peri: roomPerimeter(r),
      periFromArea: !hasPeri,
      meters: stripMetersForRoom(r, strategyId)
    };
  });
}

/* 灯带总米数 */
function sumStripMeters(plan) {
  return (plan || []).reduce(function (s, x) { return s + (x.meters || 0); }, 0);
}

/* 灯具表里所有灯带（米）的数量合计 */
function sumStripMetersIn(lights) {
  var sum = 0;
  LIGHT_GROUPS.forEach(function (g) {
    if (g.id !== 'strip') return;
    g.items.forEach(function (it) {
      var e = (lights || {})[it.id];
      if (e) sum += Math.max(0, parseFloat(e.qty) || 0);
    });
  });
  return sum;
}

/* 双色温灯带总米数（用于算 PWM 模块和驱动模块） */
function sumTwoStripMetersIn(lights) {
  var e = (lights || {}).stripTwo;
  return Math.max(0, parseFloat(e && e.qty) || 0);
}

/* 根据灯带空间明细，自动计算配套件数量
   lines: [{ modelId, meters }, ...]
   返回 { stripDriverModule, stripPWMTwo, stripPower200 } */
function calculateStripAccessories(lines) {
  lines = (lines || []).filter(function (x) { return x && x.meters > 0; });
  var totalMeters = lines.reduce(function (s, x) { return s + (parseFloat(x.meters) || 0); }, 0);
  var twoMeters = lines.filter(function (x) { return x.modelId === 'stripTwo'; })
                       .reduce(function (s, x) { return s + (parseFloat(x.meters) || 0); }, 0);
  var hasTwo = twoMeters > 0;
  /* PWM：每 10 米 1 个，不足 10 米按 10 米算 */
  var pwm = hasTwo ? Math.ceil(twoMeters / 10) : 0;
  /* 电源：每满 10 米加 100W，用 200W 规格向上取整 */
  var powerNeedW = totalMeters > 0 ? Math.ceil(totalMeters / 10) * 100 : 0;
  var power200 = powerNeedW > 0 ? Math.ceil(powerNeedW / 200) : 0;
  return {
    stripDriverModule: hasTwo ? 1 : 0,
    stripPWMTwo: pwm,
    stripPower200: power200
  };
}
