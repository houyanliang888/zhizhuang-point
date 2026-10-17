/* ===========================================================
   智装点位通 · Service Worker
   -----------------------------------------------------------
   为什么做离线优先：跑现场量房，客户家/小区地下室基本没信号，
   报价单是拿来看的，不是拿来看网线的。所以静态资源一律「缓存优先」。

   版本号改了会自动清掉旧缓存，不会出现「改了代码页面还是旧的」。
   =========================================================== */

var CACHE = 'zzdt-v1.28.0';

/* 要预缓存的静态资源。products.js 有 160KB，产品库必须离线能用。 */
var ASSETS = [
  './',
  './index.html',
  './mobile.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/products.js',
  './js/app.js',
  './js/mobile.js',
  './js/plan.js',
  './js/panels.js',
  './js/quote-switch.js',
  './js/spend.js',
  './js/vision.js',
  './js/xlsx.js',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-maskable-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* 安装：把上面这些全抓下来。抓不到的不阻断安装，避免整个 SW 装不上。 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () { /* 单个失败不阻塞整体 */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* 激活：清掉所有旧版本缓存 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 取数策略：
   - 静态资源（js/css/icon）→ 缓存优先，命中直接返回，同时后台更新
   - 页面导航（index.html）→ 缓存优先，保证离线能开；联网时后台更新
   - 其它（AI 接口请求）→ 绝不拦截，走网络
   ⚠ API 请求带 Bearer，误缓存会造成串号，所以只放行 /api. 和三个大模型域名以外的网络请求。 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* 跨域请求（AI 识图调大模型）一律不碰，让它正常走网络 */
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        /* 拿到新版本就顺手更新缓存，下次打开就是新的 */
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        /* 断网时回退到缓存；按入口回退对应页面（手机版断网不会掉进完整版） */
        var fallback = (req.url.indexOf('mobile') > -1) ? './mobile.html' : './index.html';
        return hit || caches.match(fallback) || caches.match('./index.html');
      });
      /* 有缓存先给缓存，保证秒开；没缓存等网络 */
      return hit || net;
    })
  );
});

/* 让页面能主动要求立即启用新版本 */
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});