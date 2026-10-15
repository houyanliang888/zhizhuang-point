/* =========================================================
   AI 识图：户型图 / 效果图  →  房间列表
   纯前端 fetch，零依赖，无需本地服务。

   关于成本（重要）：
     这里调用的是「你自己的」第三方视觉模型 API（DeepSeek / 智谱 / 通义…），
     费用走你自己的账户余额，每次约 ¥0.01–0.05。
     不占用、不消耗本平台任何积分，也不上传数据到第三方以外的地方。
     API Key 只存在你自己电脑的浏览器里，不会发往任何别处。
   ========================================================= */
var VISION = (function () {
  'use strict';

  var CFG_KEY = 'zd_vision_cfg';

  /* ---------- 服务商（统一 OpenAI 兼容格式）---------- */
  var PROVIDERS = {
    deepseek: {
      name: 'DeepSeek（最便宜，推荐）',
      url: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      cost: '约 ¥0.01–0.03 / 次',
      tip: 'deepseek-chat 支持看图，性价比最高'
    },
    zhipu: {
      name: '智谱 GLM-4V',
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4v-flash',
      cost: '约 ¥0.01–0.05 / 次',
      tip: 'glm-4v-flash 免费额度较多'
    },
    qwen: {
      name: '通义千问 VL',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen-vl-max-latest',
      cost: '约 ¥0.03–0.08 / 次',
      tip: '阿里系，国内直连稳'
    },
    custom: {
      name: '自定义（OpenAI 兼容）',
      url: '',
      model: 'gpt-4o-mini',
      cost: '视供应商而定',
      tip: '填你自己的 endpoint + 模型名'
    }
  };

  /* ---------- Prompt：要求严格输出 JSON ---------- */
  var PROMPT = [
    '你是全屋智能方案设计助手。下面是一张房屋户型图' +
    '（可能同时配了装修效果图，可结合参考）。请识别图中所有独立房间。',
    '',
    '识别规则：',
    '1. 按图上的文字标注为准；没有标注就按空间形状判断。',
    '2. type 只能从这 12 个里选：',
    '   living=客厅, dining=餐厅, kitchen=厨房, bath=卫生间, master=主卧,',
    '   second=次卧, kids=儿童房, study=书房, balcony=阳台, entry=玄关,',
    '   hall=过道/走廊, other=其他',
    '3. 面积：优先读图上的尺寸标注推算；无标注则按形状估算，保留 1 位小数。',
    '4. windows：该房间有几个对外窗（含落地窗、平开窗），没有就写 0。',
    '5. 连通的客厅餐厅要合并算作一个 living/dining，不要拆碎。',
    '6. 厨卫、阳台这类小空间也要列出来，不要省略。',
    '7. 室内过道算 hall；入户那一小块算 entry。',
    '',
    '严格只输出 JSON，禁止输出任何解释文字、不要用 markdown 代码块包裹：',
    '{"rooms":[{"name":"客厅","type":"living","area":32.5,"windows":2}]}'
  ].join('\n');

  /* allowed types，用于校验模型是否乱造 */
  var TYPES = ['living', 'dining', 'kitchen', 'bath', 'master', 'second',
    'kids', 'study', 'balcony', 'entry', 'hall', 'other'];

  /* ---------- 配置存取 ---------- */
  function cfg() {
    try {
      var s = localStorage.getItem(CFG_KEY);
      var c = s ? JSON.parse(s) : {};
    } catch (e) { c = {}; }
    if (!c.provider) c.provider = 'deepseek';
    if (!PROVIDERS[c.provider]) c.provider = 'deepseek';
    if (!c.url) c.url = PROVIDERS[c.provider].url;
    if (!c.model) c.model = PROVIDERS[c.provider].model;
    return c;
  }
  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { }
  }

  /* ---------- 图片压缩：手机原图好几 MB，不压会超 token ---------- */
  function compress(dataUrl, maxW, q) {
    maxW = maxW || 1400; q = q || 0.85;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', q));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* ---------- 从模型回复里抠 JSON（有些模型爱加 ```json）---------- */
  function parseRooms(txt) {
    txt = String(txt || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    var s = txt.indexOf('{'), e = txt.lastIndexOf('}');
    if (s < 0 || e <= s) throw new Error('模型没有返回 JSON，输出：' + txt.slice(0, 200));
    var obj = JSON.parse(txt.slice(s, e + 1));
    var raw = obj.rooms || obj.data || [];
    if (!raw.length) throw new Error('模型返回了空房间列表');
    return raw.map(function (r, i) {
      var t = TYPES.indexOf(r.type) >= 0 ? r.type : guessType(r.name);
      var a = parseFloat(r.area);
      var w = parseInt(r.windows, 10);
      return {
        name: String(r.name || ('房间' + (i + 1))).slice(0, 12),
        type: t,
        area: isNaN(a) ? 10 : Math.max(1, Math.round(a * 10) / 10),
        windows: isNaN(w) ? 1 : Math.max(0, w),
        note: ''
      };
    });
  }

  /* 模型乱造 type 时的兜底：按房间名猜 */
  function guessType(name) {
    var n = String(name || '');
    var map = [
      [/客厅|起居室|大厅|living|sitting|lounge/i, 'living'],
      [/餐厅|饭厅|dining/i, 'dining'],
      [/厨房|kitchen/i, 'kitchen'],
      [/卫生间|洗手间|浴室|主卫|公卫|bath|toilet|wash|wc\b/i, 'bath'],
      [/主卧|卧室|大卧|master|bedroom/i, 'master'],
      [/次卧|客房|bedroom/i, 'second'],
      [/儿童|小孩|宝宝|kids|children/i, 'kids'],
      [/书房|工作室|书屋|study/i, 'study'],
      [/阳台|露台|飘窗|外拓|balcon/i, 'balcony'],
      [/玄关|门厅|入户|entry/i, 'entry'],
      [/过道|走廊|通道|corridor|hall/i, 'hall']
    ];
    var n2 = n.toLowerCase();
    for (var i = 0; i < map.length; i++) {
      if (map[i][0].test(n2)) return map[i][1];
    }
    return 'other';
  }

  /* ---------- 主入口：imgs=[{data,kind}]，返回 Promise<rooms[]> ---------- */
  function recognize(imgs, opt, onProgress) {
    opt = opt || {};
    var c = cfg();
    if (!c.key) return Promise.reject(new Error('还没填 API Key'));
    if (!c.url) return Promise.reject(new Error('还没填接口地址'));
    if (!imgs || !imgs.length) return Promise.reject(new Error('先上传一张图纸'));

    onProgress && onProgress('正在压缩图片…');
    /* 只取前 3 张，够用了；单张压到 1400px */
    var tasks = imgs.slice(0, 3).map(function (g) { return compress(g.data, 1400, 0.85); });

    return Promise.all(tasks).then(function (urls) {
      onProgress && onProgress('正在识别房间…（约 10–30 秒）');
      var content = [{ type: 'text', text: PROMPT }];
      urls.forEach(function (u) {
        content.push({ type: 'image_url', image_url: { url: u } });
      });

      return fetch(c.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + c.key
        },
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: 'user', content: content }],
          temperature: 0.1
        })
      }).then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) {
            var m = txt.slice(0, 300);
            if (res.status === 401 || res.status === 403) throw new Error('API Key 不对或没权限（' + res.status + '）：' + m);
            if (res.status === 429) throw new Error('账户余额不够或点得太快（429）：' + m);
            throw new Error('接口报错 ' + res.status + '：' + m);
          }
          var j = JSON.parse(txt);
          var body = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (!body) throw new Error('接口没返回内容：' + txt.slice(0, 200));
          return parseRooms(body);
        });
      });
    });
  }

  return {
    PROVIDERS: PROVIDERS,
    PROMPT: PROMPT,
    cfg: cfg, saveCfg: saveCfg,
    recognize: recognize,
    compress: compress,
    parseRooms: parseRooms,
    guessType: guessType
  };
})();
