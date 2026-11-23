/* マイ天気: 公開URLのライブテスト
   https://norichan117.github.io/my-weather/ を 390x844 で開き、
   実APIのデータ取得・タブ切替・詳細シート・地点追加・横スクロールなし・コンソールエラー0 を確認する。
   実行: node test-live.js [URL]
*/
const { chromium } = require('/workspace/tool-results/_build/node_modules/playwright');

const EXE = '/workspace/tool-results/_build/chromium/chrome-linux/chrome';
const URL = process.argv[2] || 'https://norichan117.github.io/my-weather/';
const SHOT = '/workspace/weather-app/screenshots/';
const TAG = process.env.TAG || 'live.';

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    env: Object.assign({}, process.env, {
      LD_LIBRARY_PATH: '/workspace/tool-results/_build/libroot/usr/lib/x86_64-linux-gnu:/workspace/tool-results/_build/libs/root/usr/lib/x86_64-linux-gnu'
    })
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());

  const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const cards = async () => page.$$eval('.list .card', els => els.length);
  const waitTiles = async (fn, ms) => {
    const t0 = Date.now();
    let t = null;
    while (Date.now() - t0 < (ms || 8000)) {
      t = await page.evaluate(fn);
      if (t.total > 0 && t.loaded === t.total) return t;
      await page.waitForTimeout(400);
    }
    return t;
  };

  console.log('1. 公開URL');
  const res = await page.goto(URL + (URL.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now(), { waitUntil: 'load' });
  ok(res && res.status() === 200, 'HTTP 200 で開ける', res && res.status());
  await page.waitForTimeout(4500);

  console.log('2. 初回表示・実APIデータ');
  ok(await cards() === 8, 'カード8枚', await cards());
  const temps = await page.$$eval('.list .card .tmp', els => els.map(e => e.textContent.trim()));
  ok(temps.length === 8 && temps.every(t => /\d/.test(t)), '全地点に実気温が入っている', temps);
  ok((await page.textContent('#updated')).indexOf('更新') >= 0, '最終更新時刻', await page.textContent('#updated'));
  ok(await noHScroll(), '横スクロールなし（390px）');
  const visible = await page.$$eval('.list .card', els => els.filter(c => { const r = c.getBoundingClientRect(); return r.top < 844 && r.bottom <= 844; }).length);
  ok(visible >= 2, 'レーダーの下に地点カードが見える（実際: ' + visible + '）', visible);
  await page.screenshot({ path: SHOT + 'live-01-list.' + TAG + 'png' });

  console.log('2R. レーダー（初期表示・タイル・3モード・拡大）');
  ok(await page.$eval('#radarPanel', el => { const r = el.getBoundingClientRect(); return r.top > 0 && r.bottom < 844; }), 'レーダーがノータッチで画面内に出る');
  const lt = await waitTiles(() => window.__mw.radar.rainTiles());
  ok(lt && lt.total > 0 && lt.loaded === lt.total, '気象庁の雨雲タイルが読み込まれる', lt);
  const lb = await waitTiles(() => window.__mw.radar.baseTiles());
  ok(lb && lb.total > 0 && lb.loaded === lb.total, '国土地理院の地図タイルが読み込まれる', lb);
  ok(await page.evaluate(() => window.__mw.radar.pinCount()) === 8, '8地点のピン', await page.evaluate(() => window.__mw.radar.pinCount()));
  ok(/^\d\d:\d\d/.test(await page.textContent('#rmTag')), '雨雲の時刻ラベル', await page.textContent('#rmTag'));
  const lf = await page.evaluate(() => window.__mw.radar.frames().length);
  ok(lf >= 5, '気象庁の時刻一覧から雨雲のコマが取れる（' + lf + 'コマ）', lf);
  await page.evaluate(() => window.__mw.radar.play(false));
  const liveFi = await page.evaluate(() => window.__mw.radar.frameIndex());
  await page.evaluate(() => window.__mw.radar.setFrame(0));
  await waitTiles(() => window.__mw.radar.rainTiles());
  ok((await page.evaluate(() => window.__mw.radar.rainTiles())).loaded >= 1, '過去のコマのタイルも読める');
  await page.evaluate(i => window.__mw.radar.setFrame(i), liveFi);
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT + 'live-10-radar-rain.' + TAG + 'png' });

  await page.tap('#rmModes button[data-mode="wind"]');
  await page.waitForTimeout(2500);
  ok(await page.evaluate(() => window.__mw.radar.mode()) === 'wind', '風速に切り替わる');
  ok(await page.evaluate(() => window.__mw.radar.canvasInk()) > 2000, '風向・風速の矢印が描かれる', await page.evaluate(() => window.__mw.radar.canvasInk()));
  ok((await page.textContent('#rmFoot')).indexOf('最大') >= 0, '最大風速を表示', await page.textContent('#rmFoot'));
  await page.screenshot({ path: SHOT + 'live-11-radar-wind.' + TAG + 'png' });

  await page.tap('#rmModes button[data-mode="pressure"]');
  await page.waitForTimeout(2000);
  ok(await page.evaluate(() => window.__mw.radar.mode()) === 'pressure', '台風・気圧に切り替わる');
  ok(await page.evaluate(() => window.__mw.radar.canvasInk()) > 20000, '気圧の色分けが描かれる');
  ok((await page.textContent('#rmFoot')).indexOf('気圧') >= 0, '気圧の範囲を表示', await page.textContent('#rmFoot'));
  await page.screenshot({ path: SHOT + 'live-12-radar-pressure.' + TAG + 'png' });

  await page.tap('#pillRadar');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__mw.radar.isFocus()), 'ピルのタップで拡大表示');
  ok(await page.$eval('#radarMap', el => el.clientHeight) > 420, '地図が全画面近くに大きくなる', await page.$eval('#radarMap', el => el.clientHeight));
  await page.screenshot({ path: SHOT + 'live-13-radar-focus.' + TAG + 'png' });
  await page.tap('#rmFocus');
  await page.waitForTimeout(500);
  ok(!(await page.evaluate(() => window.__mw.radar.isFocus())), '⤡で縮小できる');
  await page.tap('#rmModes button[data-mode="rain"]');
  await page.waitForTimeout(600);

  console.log('3. 絞り込みタブ');
  await page.tap('.pill[data-filter="life"]');
  await page.waitForTimeout(300);
  ok(await cards() === 3, '生活＝3件', await cards());
  await page.tap('.pill[data-filter="work"]');
  await page.waitForTimeout(300);
  ok(await cards() === 5, '乗務範囲＝5件', await cards());
  await page.tap('.pill[data-filter="all"]');
  await page.waitForTimeout(300);
  ok(await cards() === 8, 'すべて＝8件', await cards());

  console.log('4. 詳細シート（実データ）');
  await page.tap('.card[data-id="kix"]');
  await page.waitForTimeout(700);
  ok(await page.$eval('#detailSheet', el => el.classList.contains('open')), '関空カードでシートが開く');
  ok((await page.textContent('#dName')).indexOf('関西空港') >= 0, '見出しが関西空港');
  ok(await page.$$eval('#dBody .hour', els => els.length) === 24, '24時間ぶんのコマ', await page.$$eval('#dBody .hour', els => els.length));
  ok(await page.$$eval('#dBody .day', els => els.length) === 7, '7日間の予報', await page.$$eval('#dBody .day', els => els.length));
  const hourTemps = await page.$$eval('#dBody .hour .h-temp', els => els.map(e => e.textContent.trim()));
  ok(hourTemps.every(t => /\d/.test(t)), '1時間ごとの気温が入っている', hourTemps.slice(0, 6));
  await page.screenshot({ path: SHOT + 'live-02-detail.' + TAG + 'png' });

  const scrollInfo = await page.evaluate(() => {
    const h = document.getElementById('hoursScroll');
    const before = h.scrollLeft; h.scrollLeft = 400;
    return { canScroll: h.scrollWidth > h.clientWidth + 20, moved: h.scrollLeft > before, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok(scrollInfo.canScroll && scrollInfo.moved, '24時間は横スクロール', scrollInfo);
  ok(!scrollInfo.pageOverflow, 'ページ自体は横に伸びない');
  await page.evaluate(() => { document.querySelector('#dBody').scrollTop = 560; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT + 'live-03-week.' + TAG + 'png' });
  await page.tap('#detailSheet [data-close]');
  await page.waitForTimeout(400);

  console.log('5. 地点の追加（三ノ宮）');
  await page.tap('#btnAdd');
  await page.waitForTimeout(500);
  await page.fill('#searchInput', '三ノ宮');
  await page.tap('.btn-search');
  await page.waitForTimeout(900);
  ok(await page.$$eval('#results .res', els => els.length) >= 1, '候補が出る', await page.$$eval('#results .res', els => els.length));
  await page.screenshot({ path: SHOT + 'live-04-add.' + TAG + 'png' });
  await page.tap('#results .res');
  await page.waitForTimeout(2500);
  ok(await cards() === 9, '追加後9枚', await cards());
  ok((await page.textContent('.list')).indexOf('三ノ宮') >= 0, '一覧に三ノ宮が出る');
  const newTmp = await page.$eval('.card[data-id^="p"] .tmp', el => el.textContent.trim());
  ok(/\d/.test(newTmp), '追加地点も実データを取得している', newTmp);
  ok(await noHScroll(), '追加後も横スクロールなし');
  await page.screenshot({ path: SHOT + 'live-05-added.' + TAG + 'png' });

  console.log('6. 並び替えシート・後片付け');
  await page.tap('#btnManage');
  await page.waitForTimeout(600);
  ok(await page.$$eval('#mBody .mrow', els => els.length) === 9, '管理画面に9行', await page.$$eval('#mBody .mrow', els => els.length));
  await page.screenshot({ path: SHOT + 'live-06-manage.' + TAG + 'png' });
  await page.tap('#btnReset');
  await page.waitForTimeout(2500);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')).places.length) === 8, '初期地点に戻せる');
  await page.tap('#manageSheet [data-close]');
  await page.waitForTimeout(300);

  console.log('7. 手動更新');
  await page.tap('#btnRefresh');
  await page.waitForTimeout(3500);
  ok((await page.textContent('#updated')).indexOf('更新') >= 0, '🔄で再取得できる', await page.textContent('#updated'));
  ok(await page.$eval('#btnRefresh', el => !el.classList.contains('spin')), '更新ボタンのスピナーが止まる');

  console.log('8. コンソールエラー');
  ok(errs.length === 0, 'コンソールエラー0件', errs.slice(0, 5));

  console.log('\n結果: ' + pass + ' 件成功 / ' + fail + ' 件失敗');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
