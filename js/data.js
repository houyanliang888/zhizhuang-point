/* ===========================================================
   智能方案设计工具 · 核心规则库
   -----------------------------------------------------------
   全部为纯 JS 对象/函数，无外部依赖，可离线运行。
   改这个文件 = 改你的点位经验（规则自定，随你调）。
   =========================================================== */

/* ---------- 0. 窗帘轨道规则（房间清单里选的「单轨 / 双轨」） ----------
   侯哥按轨道选，不用手填窗位数：
   - none   不做窗帘 → 不出电机
   - single 单轨      → 1 台电机
   - dual   双轨      → 2 台电机（遮光 + 纱，两根轨道各一台）
   轨道数 × 房间窗位= 电机台数；窗位仍取户型模板的默认值。 */
var TRACK_MOTORS = { none: 0, single: 1, dual: 2 };
function curtainQty(r) {
  var perTrack = TRACK_MOTORS[r.track] != null ? TRACK_MOTORS[r.track] : 0;
  if (!perTrack) return 0;                /* 选「不做窗帘」就不出电机 */
  var win = Math.max(1, r.windows || 1); /* 窗位取模板默认，一个窗位一组 */
  return perTrack * win;
}
/* 双轨走「双轨罗马杆」型号，单轨走普通电机 */
function curtainDev(r) {
  return (r.track === 'dual') ? 'curtain_track' : 'curtain_motor';
}

/* ---------- 0.1 开关 / 传感器 默认数量（带入户型模板时用，可手改） ----------
   经验值：开关按门口+床头的常规位估，传感器只给需要联动的空间。
   想改口径就改这张表，或者在房间清单里直接改数字（以你填的为准）。 */
var DEFAULT_DEV = {
  living:  { sw: 2, sn: 1 },  // 客厅：门口+电视墙双控，1个人体
  dining:  { sw: 1, sn: 0 },
  master:  { sw: 3, sn: 1 },  // 主卧：门口+床头双控+床头双侧，1个存在
  second:  { sw: 2, sn: 0 },
  kids:    { sw: 2, sn: 0 },
  study:   { sw: 2, sn: 1 },  // 书房：久坐提醒
  kitchen: { sw: 1, sn: 0 },
  bath:    { sw: 1, sn: 0 },
  entry:   { sw: 1, sn: 0 },
  hall:    { sw: 1, sn: 1 },  // 过道：人体感应夜灯
  balcony: { sw: 1, sn: 0 },
  other:   { sw: 1, sn: 0 }
};
function defaultDev(r) {
  return DEFAULT_DEV[r.type] || DEFAULT_DEV.other;
}

/* ---------- 1. 户型模板（一键带入房间） ---------- */
/* area 为常见面积，用户可改 */
var FLOOR_PLANS = [
  {
    id: 'apartment_2_1', name: '两室一厅一卫', icon: '🏠',
    rooms: [
      { type: 'living', name: '客厅', area: 28, windows: 2 },
      { type: 'dining', name: '餐厅', area: 12, windows: 0 },
      { type: 'master', name: '主卧', area: 16, windows: 1 },
      { type: 'second', name: '次卧', area: 12, windows: 1 },
      { type: 'kitchen', name: '厨房', area: 7, windows: 1 },
      { type: 'bath', name: '卫生间', area: 5, windows: 1 },
      { type: 'entry', name: '玄关', area: 4, windows: 0 },
      { type: 'balcony', name: '阳台', area: 6, windows: 1 }
    ]
  },
  {
    id: 'apartment_3_2', name: '三室两厅两卫', icon: '🏡',
    rooms: [
      { type: 'living', name: '客厅', area: 35, windows: 2 },
      { type: 'dining', name: '餐厅', area: 15, windows: 0 },
      { type: 'master', name: '主卧', area: 18, windows: 1 },
      { type: 'second', name: '次卧', area: 13, windows: 1 },
      { type: 'kids', name: '儿童房', area: 12, windows: 1 },
      { type: 'study', name: '书房', area: 10, windows: 1 },
      { type: 'kitchen', name: '厨房', area: 8, windows: 1 },
      { type: 'bath', name: '主卫', area: 6, windows: 1 },
      { type: 'bath', name: '公卫', area: 5, windows: 1 },
      { type: 'entry', name: '玄关', area: 5, windows: 0 },
      { type: 'balcony', name: '阳台', area: 8, windows: 2 }
    ]
  },
  {
    id: 'apartment_3_2_large', name: '三室两厅两卫（大户型）', icon: '🏛️',
    rooms: [
      { type: 'living', name: '客厅', area: 45, windows: 3 },
      { type: 'dining', name: '餐厅', area: 20, windows: 0 },
      { type: 'master', name: '主卧', area: 22, windows: 2 },
      { type: 'second', name: '次卧', area: 15, windows: 1 },
      { type: 'kids', name: '儿童房', area: 14, windows: 1 },
      { type: 'study', name: '书房', area: 12, windows: 1 },
      { type: 'kitchen', name: '厨房', area: 10, windows: 1 },
      { type: 'bath', name: '主卫', area: 8, windows: 1 },
      { type: 'bath', name: '公卫', area: 6, windows: 1 },
      { type: 'entry', name: '玄关', area: 6, windows: 0 },
      { type: 'hall', name: '过道', area: 10, windows: 0 },
      { type: 'balcony', name: '阳台', area: 12, windows: 2 }
    ]
  },
  {
    id: 'old_house', name: '老房旧房（单火线/无零火）', icon: '🏚️',
    notice: '老房建议全部走「凌动 / 灯内电池 / 免改线」方案，避免砸墙改线。',
    rooms: [
      { type: 'living', name: '客厅', area: 26, windows: 2 },
      { type: 'dining', name: '餐厅', area: 12, windows: 0 },
      { type: 'master', name: '主卧', area: 15, windows: 1 },
      { type: 'second', name: '次卧', area: 11, windows: 1 },
      { type: 'kitchen', name: '厨房', area: 6, windows: 1 },
      { type: 'bath', name: '卫生间', area: 5, windows: 1 },
      { type: 'entry', name: '玄关', area: 4, windows: 0 },
      { type: 'balcony', name: '阳台', area: 5, windows: 1 }
    ]
  },
  {
    id: 'villa', name: '别墅 / 复式（大宅）', icon: '🏡',
    rooms: [
      { type: 'living', name: '客厅（挑高）', area: 60, windows: 4 },
      { type: 'dining', name: '餐厅', area: 25, windows: 1 },
      { type: 'master', name: '主卧套间', area: 28, windows: 2 },
      { type: 'second', name: '次卧', area: 16, windows: 1 },
      { type: 'kids', name: '儿童房', area: 16, windows: 1 },
      { type: 'study', name: '书房', area: 15, windows: 1 },
      { type: 'kitchen', name: '厨房', area: 14, windows: 1 },
      { type: 'bath', name: '主卫', area: 12, windows: 1 },
      { type: 'bath', name: '客卫', area: 7, windows: 1 },
      { type: 'entry', name: '玄关', area: 10, windows: 0 },
      { type: 'hall', name: '楼梯/过道', area: 20, windows: 0 },
      { type: 'balcony', name: '露台/阳台', area: 25, windows: 3 }
    ]
  }
];
FLOOR_PLANS[2].icon = '🏛️';

/* ---------- 2. 房间类型 ---------- */
var ROOM_TYPES = {
  living: { name: '客厅', icon: '🛋️' },
  dining: { name: '餐厅', icon: '🍽️' },
  kitchen: { name: '厨房', icon: '🍳' },
  bath: { name: '卫生间', icon: '🛁' },
  master: { name: '主卧', icon: '🛏️' },
  second: { name: '次卧', icon: '🛌' },
  kids: { name: '儿童房', icon: '🧸' },
  study: { name: '书房', icon: '📚' },
  balcony: { name: '阳台', icon: '🌤️' },
  entry: { name: '玄关', icon: '🚪' },
  hall: { name: '过道/走廊', icon: '🚶' },
  other: { name: '其他', icon: '📦' }
};

/* ---------- 3. 需求标签（按房间） ---------- */
var NEEDS = {
  '*': [
    { id: 'g_network', name: '全屋网络覆盖', desc: '子路由 / AP，解决死角' },
    { id: 'g_hub', name: '全屋智能中枢', desc: '网关，联动的大脑' },
    { id: 'g_voice', name: '语音控制', desc: '音箱 / 屏显' },
    { id: 'g_panel', name: '智能面板替换开关', desc: '零火/单火面板' },
    { id: 'g_elder', name: '适老化改造', desc: '紧急呼叫、大字号面板' }
  ],
  living: [
    { id: 'l_base', name: '基础照明', desc: '主灯智能化' },
    { id: 'l_movie', name: '观影模式', desc: '投影/电视 + 氛围灯' },
    { id: 'l_curtain', name: '电动窗帘', desc: '客厅窗帘' },
    { id: 'l_env', name: '环境感知', desc: '毫米波 / 温湿度' },
    { id: 'l_security', name: '安防监控', desc: '摄像头' },
    { id: 'l_air', name: '新风净化', desc: '净化器 / 新风联动' }
  ],
  dining: [
    { id: 'd_base', name: '餐吊灯联动', desc: '回家自动亮' },
    { id: 'd_mood', name: '氛围灯带', desc: '餐边柜氛围' }
  ],
  kitchen: [
    { id: 'k_base', name: '厨房照明', desc: '操作台双控' },
    { id: 'k_smoke', name: '烟雾报警', desc: '必配' },
    { id: 'k_gas', name: '燃气报警', desc: '联动切断/推送' },
    { id: 'k_exhaust', name: '排烟联动', desc: '烟感联动排风' },
    { id: 'k_plug', name: '厨电智能插座', desc: '净水器/垃圾器' }
  ],
  bath: [
    { id: 'b_base', name: '卫生间照明', desc: '镜前灯' },
    { id: 'b_night', name: '起夜感应灯', desc: '地脚/镜前感应' },
    { id: 'b_humid', name: '防潮防霉', desc: '湿度传感器' },
    { id: 'b_exhaust', name: '排风联动', desc: '有人才排风' },
    { id: 'b_valve', name: '地暖/热水阀', desc: '分区控制' }
  ],
  master: [
    { id: 'm_base', name: '主卧照明', desc: '床头双控' },
    { id: 'm_sleep', name: '睡眠模式', desc: '一键熄灯' },
    { id: 'm_night', name: '起夜灯', desc: '床底感应灯' },
    { id: 'm_curtain', name: '电动窗帘', desc: '遮光' },
    { id: 'm_presence', name: '人体存在', desc: '毫米波' },
    { id: 'm_env', name: '温湿度', desc: '空调联动' }
  ],
  second: [
    { id: 's_base', name: '照明', desc: '基础智能化' },
    { id: 's_study', name: '学习照明', desc: '护眼灯联动' },
    { id: 's_curtain', name: '电动窗帘', desc: '可选' }
  ],
  kids: [
    { id: 'kd_base', name: '照明', desc: '基础智能化' },
    { id: 'kd_eye', name: '护眼灯', desc: '学习护眼' },
    { id: 'kd_night', name: '夜灯', desc: '起夜不摸黑' },
    { id: 'kd_curtain', name: '遮光窗帘', desc: '好觉必备' }
  ],
  study: [
    { id: 'st_base', name: '书房照明', desc: '无频闪' },
    { id: 'st_remind', name: '久坐提醒', desc: '毫米波' }
  ],
  balcony: [
    { id: 'ba_light', name: '阳台照明', desc: '感应' },
    { id: 'ba_dry', name: '电动晾衣架', desc: '语音/联动' },
    { id: 'ba_water', name: '自动浇花', desc: '水箱联动' },
    { id: 'ba_wash', name: '洗衣机联动', desc: '插座联动' }
  ],
  entry: [
    { id: 'e_lock', name: '智能门锁', desc: '指纹/推离' },
    { id: 'e_home', name: '回家模式', desc: '开门即亮' },
    { id: 'e_cam', name: '门口监控', desc: '猫眼/摄像头' }
  ],
  hall: [
    { id: 'h_night', name: '感应照明', desc: '起夜不亮主灯' }
  ],
  other: [
    { id: 'o_base', name: '基础照明', desc: '智能控制' }
  ]
};

/* ---------- 4. 点位模板规则库 ---------- */
/*  tier: 1=入门刚需  2=标准舒适  3=进阶享受
    qty(room) 返回数量；dev = 默认设备品类（对应 DEVICES 的 cat）
    wire: zero=需零火线 / single=单火线可用 / battery=电池 / any
*/
var TEMPLATES = [
  /* ===== 全屋级 ===== */
  { id: 'g_ap', room: '*', need: 'g_network', tier: 1, name: '全屋子路由 / AP', qty: function (s) { var n = s.rooms.length; return Math.max(1, Math.min(4, Math.ceil(n / 3))); }, dev: 'ap', devAlt: ['ap', 'router'], note: '大户型 / 复式必配，弱电箱到位' },
  { id: 'g_hub', room: '*', need: 'g_hub', tier: 1, name: '全屋智能中枢网关', qty: function () { return 1; }, dev: 'gateway', note: '本地联动的关键，断网也能跑' },
  { id: 'g_voice', room: '*', need: 'g_voice', tier: 2, name: '智能音箱 / 中控屏', qty: function (s) { return s.rooms.length > 6 ? 2 : 1; }, dev: 'speaker', note: '放在常活动区域' },
  { id: 'g_panel', room: '*', need: 'g_panel', tier: 2, name: '智能开关面板', qty: function () { return 0; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '有 0 火线的房间才需面板，无则跳过' },

  /* ===== 客厅 ===== */
  { id: 'lv_lamp', room: 'living', need: 'l_base', tier: 1, name: '客厅主灯控制点位', qty: function (r) { return r.area > 35 ? 2 : 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live', 'dimmer'], note: '' },
  { id: 'lv_plug', room: 'living', need: 'l_base', tier: 1, name: '电视墙 / 沙发边智能插座', qty: function () { return 2; }, dev: 'plug', note: '带计数/断电提醒' },
  { id: 'lv_movie', room: 'living', need: 'l_movie', tier: 3, name: '投影 / 电视 智能插座', qty: function () { return 1; }, dev: 'plug', note: '观影一键断电' },
  { id: 'lv_strip', room: 'living', need: 'l_movie', tier: 3, name: '电视背景墙氛围灯带', qty: function () { return 1; }, dev: 'led', note: '观影模式自动调暗' },
  { id: 'lv_curtain', room: 'living', need: 'l_curtain', tier: 1, name: '客厅电动窗帘（电机）', qty: curtainQty, dev: 'curtain_motor', devFn: curtainDev, devAlt: ['curtain_motor', 'curtain_track'], note: '双轨=遮光+纱各一台' },
  { id: 'lv_curtain_ctrl', room: 'living', need: 'l_curtain', tier: 2, name: '客厅窗帘壁挂开关', qty: function () { return 1; }, dev: 'curtain_panel', note: '无需面板可删' },
  { id: 'lv_presence', room: 'living', need: 'l_env', tier: 2, name: '客厅毫米波人体存在传感器', qty: function () { return 1; }, dev: 'presence', note: '比红外准，静止也感应' },
  { id: 'lv_th', room: 'living', need: 'l_env', tier: 2, name: '温湿度传感器', qty: function () { return 1; }, dev: 'th', note: '空调自动开关依它' },
  { id: 'lv_cam', room: 'living', need: 'l_security', tier: 3, name: '客厅 / 室内摄像头', qty: function () { return 1; }, dev: 'camera', devAlt: ['camera', 'camera_pt'], note: '' },
  { id: 'lv_air', room: 'living', need: 'l_air', tier: 3, name: '空气净化器 / 新风 智能插座', qty: function () { return 1; }, dev: 'plug', note: '联动开关' },

  /* ===== 餐厅 ===== */
  { id: 'dn_lamp', room: 'dining', need: 'd_base', tier: 1, name: '餐厅吊灯点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'dn_strip', room: 'dining', need: 'd_mood', tier: 3, name: '餐边柜氛围灯带', qty: function () { return 1; }, dev: 'led', note: '' },

  /* ===== 厨房 ===== */
  { id: 'kt_lamp', room: 'kitchen', need: 'k_base', tier: 1, name: '厨房主灯点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'kt_smoke', room: 'kitchen', need: 'k_smoke', tier: 1, name: '烟雾报警器', qty: function () { return 1; }, dev: 'smoke', note: '必配，烟大自动推送+断气' },
  { id: 'kt_gas', room: 'kitchen', need: 'k_gas', tier: 2, name: '燃气泄漏报警器', qty: function () { return 1; }, dev: 'gas', note: '与烟感分开放置' },
  { id: 'kt_exhaust', room: 'kitchen', need: 'k_exhaust', tier: 2, name: '烟感联动排风', qty: function () { return 1; }, dev: 'relay', note: '需要继电器/智能开关' },
  { id: 'kt_plug', room: 'kitchen', need: 'k_plug', tier: 1, name: '厨电智能插座（净水/垃圾器）', qty: function () { return 1; }, dev: 'plug', note: '' },

  /* ===== 卫生间 ===== */
  { id: 'bt_lamp', room: 'bath', need: 'b_base', tier: 1, name: '卫生间镜前灯 / 主灯点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'bt_night', room: 'bath', need: 'b_night', tier: 1, name: '起夜感应夜灯', qty: function () { return 1; }, dev: 'nightlight', note: '人体感应，暗亮亮灭' },
  { id: 'bt_humid', room: 'bath', need: 'b_humid', tier: 2, name: '湿度 / 水浸传感器', qty: function () { return 1; }, dev: 'humid', devAlt: ['humid', 'water'], note: '防霉防潮' },
  { id: 'bt_exhaust', room: 'bath', need: 'b_exhaust', tier: 2, name: '排风 / 浴霸联动', qty: function () { return 1; }, dev: 'relay', note: '有人才排风，省电' },
  { id: 'bt_valve', room: 'bath', need: 'b_valve', tier: 3, name: '地暖 / 热水智能阀', qty: function () { return 1; }, dev: 'valve', must: '阀', note: '产品库暂无智能阀门，需手动补价' },

  /* ===== 主卧 ===== */
  { id: 'ms_lamp', room: 'master', need: 'm_base', tier: 1, name: '主卧主灯点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'ms_bed_lamp', room: 'master', need: 'm_base', tier: 1, name: '床头灯 / 阅读灯位', qty: function () { return 2; }, dev: 'bulb', note: '双侧对称' },
  { id: 'ms_night', room: 'master', need: 'm_night', tier: 1, name: '床底起夜感应灯', qty: function () { return 1; }, dev: 'nightlight', note: '' },
  { id: 'ms_sleep', room: 'master', need: 'm_sleep', tier: 2, name: '睡眠模式面板 / 一键场景', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live', 'bulletin'], note: '' },
  { id: 'ms_curtain', room: 'master', need: 'm_curtain', tier: 1, name: '主卧电动窗帘', qty: curtainQty, dev: 'curtain_motor', devFn: curtainDev, devAlt: ['curtain_motor', 'curtain_track'], note: '遮光帘建议双轨' },
  { id: 'ms_presence', room: 'master', need: 'm_presence', tier: 2, name: '主卧毫米波存在传感器', qty: function () { return 1; }, dev: 'presence', note: '人在≠醒着，自动关空调' },
  { id: 'ms_th', room: 'master', need: 'm_env', tier: 2, name: '温湿度传感器', qty: function () { return 1; }, dev: 'th', note: '' },

  /* ===== 次卧 ===== */
  { id: 'se_lamp', room: 'second', need: 's_base', tier: 1, name: '次卧照明点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'se_study', room: 'second', need: 's_study', tier: 2, name: '学习护眼灯 / 书桌位', qty: function () { return 1; }, dev: 'bulb', note: '' },
  { id: 'se_curtain', room: 'second', need: 's_curtain', tier: 2, name: '次卧电动窗帘', qty: curtainQty, dev: 'curtain_motor', devFn: curtainDev, devAlt: ['curtain_motor', 'curtain_track'], note: '' },

  /* ===== 儿童房 ===== */
  { id: 'kd_lamp', room: 'kids', need: 'kd_base', tier: 1, name: '儿童房照明点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'kd_eye', room: 'kids', need: 'kd_eye', tier: 2, name: '护眼台灯 / 学习灯位', qty: function () { return 1; }, dev: 'bulb', note: '' },
  { id: 'kd_night', room: 'kids', need: 'kd_night', tier: 1, name: '儿童房夜灯', qty: function () { return 1; }, dev: 'nightlight', note: '' },
  { id: 'kd_curtain', room: 'kids', need: 'kd_curtain', tier: 2, name: '儿童房遮光窗帘', qty: curtainQty, dev: 'curtain_motor', devFn: curtainDev, devAlt: ['curtain_motor', 'curtain_track'], note: '' },

  /* ===== 书房 ===== */
  { id: 'st_lamp', room: 'study', need: 'st_base', tier: 1, name: '书房照明点位', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live'], note: '' },
  { id: 'st_remind', room: 'study', need: 'st_remind', tier: 2, name: '久坐提醒毫米波', qty: function () { return 1; }, dev: 'presence', note: '坐下不动就提醒' },

  /* ===== 阳台 ===== */
  { id: 'bl_light', room: 'balcony', need: 'ba_light', tier: 2, name: '阳台照明 / 感应', qty: function () { return 1; }, dev: 'panel', devAlt: ['panel', 'panel_zero', 'panel_live', 'plug'], note: '' },
  { id: 'bl_dry', room: 'balcony', need: 'ba_dry', tier: 2, name: '电动晾衣架智能位', qty: function () { return 1; }, dev: 'plug', note: '' },
  { id: 'bl_water', room: 'balcony', need: 'ba_water', tier: 3, name: '自动浇花水泵', qty: function () { return 1; }, dev: 'plug', note: '' },
  { id: 'bl_wash', room: 'balcony', need: 'ba_wash', tier: 2, name: '洗衣机联动插座', qty: function () { return 1; }, dev: 'plug', note: '' },

  /* ===== 玄关 ===== */
  { id: 'en_lock', room: 'entry', need: 'e_lock', tier: 1, name: '智能门锁（指纹/推离）', qty: function () { return 1; }, dev: 'lock', note: '含安装，注意门厚/门开向' },
  { id: 'en_home', room: 'entry', need: 'e_home', tier: 1, name: '玄关感应夜灯 / 灯带', qty: function () { return 1; }, dev: 'nightlight', note: '回家模式起点' },
  { id: 'en_cam', room: 'entry', need: 'e_cam', tier: 3, name: '门口摄像头 / 智能猫眼', qty: function () { return 1; }, dev: 'camera', devAlt: ['camera', 'camera_pt', 'doorbell'], note: '' },

  /* ===== 过道 ===== */
  { id: 'hl_night', room: 'hall', need: 'h_night', tier: 2, name: '过道人体感应照明', qty: function (r) { return Math.max(1, Math.ceil(r.area / 12)); }, dev: 'nightlight', note: '' }
];

/* ---------- 5. 设备库（价格仅供参考，可改） ---------- */
var DEVICES = [
  // 网关 / 网络
  { cat: 'gateway', brand: 'Aqara 绿米', model: 'M3 中枢网关', spec: '本地自动化·断网可用', price: 699 },
  { cat: 'gateway', brand: '小米', model: '小米中枢网关', spec: '米家生态主体', price: 249 },
  { cat: 'gateway', brand: 'Aqara 绿米', model: 'M2 网关', spec: '入门中枢', price: 399 },
  { cat: 'ap', brand: '小米', model: 'AX3000 路由器', spec: '千兆双频', price: 299 },
  { cat: 'ap', brand: 'TP-LINK', model: '吸顶 AP', spec: 'POE 供电', price: 129 },
  { cat: 'router', brand: '华硕', model: '灵跃 X3', spec: 'Mesh 主路由', price: 499 },
  // 面板
  { cat: 'panel', brand: 'Aqara 绿米', model: '智能开关 D1 单火版', spec: '单火线·老房首选', price: 159 },
  { cat: 'panel', brand: 'Aqara 绿米', model: '智能开关 D1 零火版', spec: '需零火线', price: 199 },
  { cat: 'panel_zero', brand: '小米', model: '智能开关板零火版', spec: '需零火线', price: 139 },
  { cat: 'panel_live', brand: '公牛', model: '智能开关 单火版', spec: '零火可选', price: 99 },
  { cat: 'dimmer', brand: 'Aqara 绿米', model: '智能调光开关', spec: '渐变调光', price: 249 },
  { cat: 'bulletin', brand: 'Aqara 绿米', model: '智能面板（带屏）', spec: '可视化中控', price: 899 },
  // 窗帘
  { cat: 'curtain_motor', brand: 'Aqara 绿米', model: '智能窗帘 B1', spec: '单轨·含安装', price: 599 },
  { cat: 'curtain_motor', brand: '小米', model: '智能窗帘电机', spec: '单轨', price: 399 },
  { cat: 'curtain_track', brand: '杜亚', model: '双轨罗马杆', spec: '遮光帘+纱帘', price: 899 },
  { cat: 'curtain_panel', brand: 'Aqara 绿米', model: '窗帘控制面板', spec: '免布线贴装', price: 199 },
  // 灯具
  { cat: 'bulb', brand: '小米', model: '智能灯泡 / 台灯', spec: '2700K 暖光', price: 129 },
  { cat: 'led', brand: '米家', model: '智能灯带 5m', spec: '含控光盒', price: 89 },
  { cat: 'nightlight', brand: '米家', model: '感应夜灯', spec: '电池·人体+照度双感应', price: 49 },
  // 传感
  { cat: 'presence', brand: 'Aqara 绿米', model: 'FP2 毫米波人体存在', spec: '静止也可感应', price: 399 },
  { cat: 'presence', brand: '小米', model: '毫米波传感器', spec: '入门款', price: 199 },
  { cat: 'th', brand: 'Aqara 绿米', model: 'W100 温湿度', spec: 'LCD 显示', price: 129 },
  { cat: 'th', brand: '小米', model: '温湿度传感器', spec: '基础款', price: 59 },
  { cat: 'humid', brand: 'Aqara 绿米', model: '湿度传感器', spec: '防霉联动', price: 119 },
  { cat: 'water', brand: '小米', model: '水浸传感器', spec: '防漏水', price: 59 },
  { cat: 'smoke', brand: '小米', model: '烟雾报警器', spec: '含联动', price: 119 },
  { cat: 'gas', brand: '米家', model: '燃气泄漏报警器', spec: '联动断气', price: 159 },
  { cat: 'relay', brand: 'Aqara 绿米', model: '智能继电器 / 单火版', spec: '控制风机/排风', price: 229 },
  { cat: 'door', brand: 'Aqara 绿米', model: '门窗传感器', spec: '开窗关空调', price: 99 },
  // 安防
  { cat: 'lock', brand: '小米', model: '门锁 E20', spec: '3D人脸·推离把手', price: 1299 },
  { cat: 'lock', brand: '凯迪仕', model: 'K20 Pro Max', spec: '自动锁体·大握把', price: 1899 },
  { cat: 'lock', brand: '德施曼', model: 'R7 Pro', spec: '3D 人脸', price: 2199 },
  { cat: 'camera', brand: '小米', model: '摄像机 C300', spec: '400万固定枪机', price: 169 },
  { cat: 'camera', brand: '小米', model: '云台机 E350', spec: '360°巡摄', price: 249 },
  { cat: 'camera_pt', brand: 'Aqara', model: '网关摄像机 G4', spec: '带本地存储', price: 599 },
  { cat: 'doorbell', brand: 'Aqara', model: '智能猫眼', spec: '门口可视对讲', price: 899 },
  // 音 / 电
  { cat: 'speaker', brand: '小米', model: '智能音箱Play', spec: '语音控制', price: 99 },
  { cat: 'speaker', brand: '小米', model: '小爱触屏 8', spec: '带屏中控', price: 349 },
  { cat: 'plug', brand: '小米', model: '智能插座 10A', spec: '带计量', price: 39 },
  { cat: 'valve', brand: 'Aqara 绿米', model: '智能墙壁阀门', spec: '地暖分区', price: 399 },
  { cat: 'valve', brand: '小米', model: '智能水阀', spec: '漏水自动关', price: 299 }
];
DEVICES[22].spec = '渐变调光';

/* 全屋级需求可能被多个房间同时勾选，用 room 名实例化 */
var GLOBAL_ROOM_NAME = '全屋';

/* ---------- 6. 品类 → 首选产品来源 ----------
   点位生成时，优先从这个来源挑产品（你的真实供货渠道） */
var PREF_SRC = {
  panel: 'Aqara绿米', plug: 'Aqara绿米', curtain: 'Aqara绿米',
  sensor: 'Aqara绿米', presence: 'Aqara绿米', smoke: 'Aqara绿米',
  gas: 'Aqara绿米', water: 'Aqara绿米', lock: 'Aqara绿米',
  camera: 'Aqara绿米', gateway: 'Aqara绿米', valve: 'Aqara绿米',
  light: 'Yeelight驭光', bulb: 'Yeelight', led: 'Yeelight',
  ap: '网络覆盖', speaker: '背景音乐'
};
/* 点位模板的设备键 → 产品库品类的映射 */
var TPL_CAT = {
  curtain_motor: 'curtain', curtain_track: 'curtain',
  panel_zero: 'panel', panel_live: 'panel', dimmer: 'panel', panel: 'panel',
  curtain_panel: 'panel', curtain_ctrl: 'panel',
  bulb: 'light', led: 'light', nightlight: 'light',
  camera_pt: 'camera', doorbell: 'camera', humid: 'sensor', th: 'sensor',
  valve: 'water', relay: 'panel'
};
function tplCat(dev) { return TPL_CAT[dev] || dev; }

/* 排除词：这些是非智能基础件 / 配件，绝不能出现在智能点位报价里 */
var EXCL_WORD = {
  panel: ['普通', '配件', '底盒', '中框', '按键'],
  plug: ['普通', '16A'],
  sensor: ['配件', '适配器'],
  curtain: ['配件', '帘头轨', '升降', '帘布'],
  speaker: ['线'],
  gateway: ['适配器'],
  camera: ['支架', '底座']
};
function isExcluded(p) {
  var bad = EXCL_WORD[p.cat];
  if (!bad) return false;
  var s = p.type + ' ' + p.name;
  for (var i = 0; i < bad.length; i++) {
    if (s.indexOf(bad[i]) >= 0) return true;
  }
  return false;
}

/* 首选关键词：在候选产品里优先挑名字命中的那款（避免选成便宜的配件）*/
var PREF_WORD = {
  g_ap: '路由', g_hub: '中枢', gateway: '中枢',
  g_panel: '智能开关', panel: '开关',
  lv_curtain: '智能窗帘', ms_curtain: '智能窗帘', se_curtain: '智能窗帘', kd_curtain: '智能窗帘',
  lv_presence: '存在', ms_presence: '存在', st_remind: '存在',
  lv_cam: '摄像机', en_cam: '摄像机',
  en_lock: '门锁', lv_strip: '灯带', dn_strip: '灯带',
  th: '温湿度', ms_th: '温湿度', bt_humid: '水浸'
};
TEMPLATES.forEach(function (t) {
  if (!t.src) t.src = PREF_SRC[tplCat(t.dev)] || '';
  if (!t.w) t.w = PREF_WORD[t.id] || PREF_WORD[t.dev] || '';
});

/* 品类中文名（报价单用）*/
var CAT_CN = {
  panel: '开关面板', plug: '智能插座', curtain: '电动窗帘', sensor: '传感器',
  presence: '人体存在', smoke: '烟感报警', gas: '燃气报警', water: '水阀',
  lock: '智能门锁', camera: '摄像头', gateway: '智能中枢', ap: '网络设备',
  speaker: '背景音乐', light: '灯具照明', bulb: '灯具', led: '灯带',
  valve: '阀门', relay: '控制模块', humid: '湿度传感', th: '温湿度',
  other: '其他', accessory: '辅材'
};
