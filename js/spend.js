/* ===========================================================
   花钱顺序 · 规则库
   -----------------------------------------------------------
   侯哥的内容方法论：口播和公域不报具体金额，只讲「花钱顺序」。
   顺序对了，预算多少都能做对；顺序错了，给再多钱都白花。
   本文件 = 这套顺序的规则，改这里就能改整个工具的价值观。

   六步顺序（按「错了就无法补救」程度排）：
     ① 线路条件  → 决定了后面所有设备能不能落地，装修期唯一一次机会
     ② 开关灯控  → 每天用得最多，最影响体验，也是最容易补的
     ③ 门锁安防  → 决定出入安全与隐私，不可后补
     ④ 电动窗帘  → 体验提升最明显，但可后装
     ⑤ 传感器    → 让前面所有设备「会判断」，锦上添花
     ⑥ 影音氛围  → 最贵、最不着急、最后再补
   =========================================================== */

/* 步骤定义：id 固定，别改（改了存档对不上） */
var SPEND_STEPS = [
  {
    id: 1,
    key: 'wire',
    name: '确认线路条件',
    icon: '🔌',
    color: '#c2410c',
    core: true,
    brief: '装修期唯一一次能改电的机会，错过就得砸墙',
    detail:
      '进现场第一件事不是量房，是开电箱看有没有零线。\n' +
      '· 有零火线：面板、空调、热水器都能接，后续选择多\n' +
      '· 单火线老房：全部走「凌动 + 智能灯内电池」的免改线路子，不砸墙不动线\n' +
      '· 这步花的钱不多，但决定了②到⑥步能不能做。线路没定，后面全是白想。',
    why: '四五线城市的房子大多是单火线老房，这一步没做，后面所有方案都要打折。',
    must: ['g_hub', 'g_network'],
    cats: ['ap', 'gateway']
  },
  {
    id: 2,
    key: 'switch',
    name: '开关与灯光',
    icon: '💡',
    color: '#1a56db',
    core: true,
    brief: '每天用几百次，智能化的地基',
    detail:
      '这是整套方案里使用频率最高的部分，也是回报最直接的部分。\n' +
      '· 优先换墙上的开关面板，不是先买灯泡\n' +
      '· 单火线选凌动类开关 + 智能灯，灯内电池不用改线\n' +
      '· 客厅、主卧先做，卫生间和阳台可以往后放\n' +
      '· 这步没做，后面装再多传感器也等于零。',
    why: '客人一进门就能感知差别：手一碰灯就亮、不用找开关。',
    must: [],
    cats: ['panel', 'light', 'bulb', 'led']
  },
  {
    id: 3,
    key: 'lock',
    name: '门锁与安防',
    icon: '🔒',
    color: '#b91c1c',
    core: true,
    brief: '安全隐私的事，装修完再补要把门拆了',
    detail:
      '智能门锁要装在门上，如果等装修全弄完才想起来，门的尺寸和开向都定了，很容易装不上。\n' +
      '· 进场量房时就要量门厚、确认门是内开还是外开、铰链在哪侧\n' +
      '· 门锁建议和开关面板同期下单，同一批水电师傅顺手装完\n' +
      '· 厨房烟感、燃气报警同属安全类，一次装到位\n' +
      '· 摄像头可以后装，但摄像头位和网线要提前留。',
    why: '装修完成后再改门锁要么拆门，要么换锁，成本翻倍。',
    must: [],
    cats: ['lock', 'camera', 'smoke', 'gas']
  },
  {
    id: 4,
    key: 'curtain',
    name: '电动窗帘',
    icon: '🪟',
    color: '#0891b2',
    core: false,
    brief: '体验提升最明显，但可以后装',
    detail:
      '电动窗帘是「花小钱、体验翻倍」的代表。\n' +
      '· 布和轨道先装，电机后加，这是它能后装的原因\n' +
      '· 提前跟窗帘商家说好留电机位，比事后加省一半钱\n' +
      '· 客厅和主卧优先，孩子房建议做遮光的\n' +
      '· 卫生间卫生间用百叶或浴帘，不占电机位。',
    why: '早晚各一次，谁用谁知道。这是「省心」类需求里最容易感知的。',
    must: [],
    cats: ['curtain']
  },
  {
    id: 5,
    key: 'sensor',
    name: '传感器与联动',
    icon: '📡',
    color: '#7c3aed',
    core: false,
    brief: '让前面的设备从「听话」变成「会判断」',
    detail:
      '传感器本身不解决体验，它让已经装好的设备变聪明。\n' +
      '· 毫米波装在客厅和主卧，人在就开灯、人走就关空调\n' +
      '· 温湿度让空调自己判断，老人房和儿童房必备\n' +
      '· 起夜灯、卫生间感应灯是成本最低的适老化改动\n' +
      '· 长治冬天干、水质硬，温湿度和湿度传感器建议别省。',
    why: '把「手动开」变成「自动判断」，是智能和普通开关的分水岭。',
    must: [],
    cats: ['sensor', 'presence', 'water', 'humid']
  },
  {
    id: 6,
    key: 'scene',
    name: '影音与氛围',
    icon: '🎬',
    color: '#db2777',
    core: false,
    brief: '最贵、最不着急、最后再补',
    detail:
      '这部分最容易超预算，也最难说不清「到底值不值」。\n' +
      '· 背景音乐、投影、氛围灯带都是锦上添花\n' +
      '· 前面五步做扎实了，再来加这些，效果是叠加的\n' +
      '· 如果预算紧张，这一步整体往后挪，不会翻车\n' +
      '· 建议先做一两个场景跑通，别一次上全屋。',
    why: '前面没做好，堆再多场景也只是「多个开关」。',
    must: [],
    cats: ['speaker', 'led']
  }
];

/* 品类 → 步骤 映射（用于把实际点位归到花钱顺序里） */
var CAT2STEP = {};
(function () {
  var MAP = {
    ap: 'wire', gateway: 'wire',
    panel: 'switch', light: 'switch', bulb: 'switch', led: 'switch',
    panel_zero: 'switch', panel_live: 'switch', dimmer: 'switch', relay: 'switch',
    lock: 'lock', camera: 'lock', camera_pt: 'lock', doorbell: 'lock', smoke: 'lock', gas: 'lock',
    curtain: 'curtain', curtain_motor: 'curtain', curtain_track: 'curtain', curtain_panel: 'curtain',
    sensor: 'sensor', presence: 'sensor', water: 'sensor', humid: 'sensor', th: 'sensor', valve: 'sensor',
    plug: 'sensor',
    speaker: 'scene'
  };
  for (var k in MAP) CAT2STEP[k] = MAP[k];
})();

/* 取点位所属步骤：优先按产品品类，其次按点位 devCat */
function stepOfPoint(p) {
  if (!p) return SPEND_STEPS[5];
  var pr = (typeof findProd === 'function') ? findProd(p.prodKey) : null;
  var cats = [];
  if (pr && pr.cat) cats.push(pr.cat);
  if (p.devCat) cats.push(p.devCat);
  /* TPL_CAT 映射后的品类也看一眼 */
  if (p.devCat && typeof tplCat === 'function') cats.push(tplCat(p.devCat));
  for (var i = 0; i < cats.length; i++) {
    var s = CAT2STEP[cats[i]];
    if (s) return SPEND_STEPS.filter(function (x) { return x.key === s; })[0] || SPEND_STEPS[5];
  }
  return SPEND_STEPS[5];
}

/* 生成花钱顺序：把已勾选点位按 6 步归类，返回带金额和设备明细的结构 */
function buildSpendOrder(points, devCatList) {
  var buckets = {};
  SPEND_STEPS.forEach(function (s) { buckets[s.id] = { step: s, money: 0, cnt: 0, items: [] }; });

  (points || []).forEach(function (p) {
    var s = stepOfPoint(p);
    var b = buckets[s.id];
    b.money += (p.price || 0) * (p.qty || 0);
    b.cnt += p.qty || 0;
    b.items.push(p);
  });

  var total = 0;
  SPEND_STEPS.forEach(function (s) { total += buckets[s.id].money; });

  return {
    steps: SPEND_STEPS.map(function (s) { return buckets[s.id]; }),
    total: total,
    devCats: devCatList || []
  };
}