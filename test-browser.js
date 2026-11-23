/* マイ天気: ブラウザ実画面テスト（390×844）
   - API はルートモック（雨・強風の見た目と操作を再現）
   - レーダーは気象庁・国土地理院のタイルもモックして、表示と切替を検証
   実行: node test-browser.js [baseURL]
*/
const { chromium } = require('/workspace/tool-results/_build/node_modules/playwright');
const { buildFixture, buildField } = require('./test-fixture');

const EXE = '/workspace/tool-results/_build/chromium/chrome-linux/chrome';
const BASE = process.argv[2] || 'http://127.0.0.1:8899/index.html';
const SHOT = '/workspace/weather-app/screenshots/';
const TAG = process.env.TAG || 'b1.';

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 気象庁ナウキャストの時刻一覧（実時間から生成） */
const p2 = n => (n < 10 ? '0' : '') + n;
function stamp(ms) {
  const d = new Date(ms);
  return '' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) +
    p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds());
}
function jmaTimes() {
  const step = 5 * 60 * 1000;
  const base = Math.floor(Date.now() / step) * step;
  const n1 = [], n2 = [];
  for (let k = 12; k >= 0; k--) {
    const s = stamp(base - k * step);
    n1.push({ basetime: s, validtime: s, elements: ['hrpns', 'hrpns_nd'] });
  }
  for (let k = 1; k <= 12; k++) {
    n2.push({ basetime: stamp(base), validtime: stamp(base + k * step), elements: ['hrpns', 'hrpns_nd'] });
  }
  return { n1, n2 };
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
  const badRes = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  page.on('response', r => { if (r.status() >= 400) badRes.push(r.status() + ' ' + r.url()); });

  let fixtureN = 9;
  await page.route('**/v1/forecast*', async route => {
    const url = route.request().url();
    const m = url.match(/latitude=([^&]+)/);
    const n = m ? m[1].split(',').length : fixtureN;
    const isField = url.indexOf('pressure_msl') >= 0 || url.indexOf('wind_direction_10m') >= 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(isField ? buildField(n) : buildFixture(n))
    });
  });
  await page.route('**/geocoding-api.open-meteo.com/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Kobe', latitude: 34.69, longitude: 135.19, admin1: 'Hyogo', country: 'Japan', country_code: 'JP' }] }) });
  });

  /* レーダー: 気象庁の時刻一覧・台風情報は JSON、タイルは 1x1 PNG */
  const TIMES = jmaTimes();
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/targetTimes_N1.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIMES.n1) }));
  await page.route('**/targetTimes_N2.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIMES.n2) }));
  await page.route('**/typhoon/data/targetTc.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/jmatile/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/cyberjapandata.gsi.go.jp/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

  const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const cards = async () => page.$$eval('.list .card', els => els.length);
  const ink = async () => page.evaluate(() => window.__mw.radar.canvasInk());

  console.log('1. 一覧（モックAPI: 雨・強風を含む）');
  const res = await page.goto(BASE + '?cb=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  ok(res && res.status() === 200, 'ローカルページが200で開ける', res && res.status());
  ok(await cards() === 8, 'カード8枚', await cards());
  ok(await noHScroll(), '横スクロールなし（390px）');
  const visible = await page.$$eval('.list .card', els => els.filter(c => { const r = c.getBoundingClientRect(); return r.top < 844 && r.bottom < 844; }).length);
  ok(visible >= 2, 'レーダーの下に地点カードが見える（実際: ' + visible + '）');

  const homeTxt = await page.textContent('.card[data-id="home"]');
  ok(homeTxt.indexOf('自転車OK') >= 0, '自宅は 🚲自転車OK');
  const tenTxt = await page.textContent('.card[data-id="tennoji"]');
  ok(tenTxt.indexOf('傘') >= 0, '雨の地点に ☔傘バッジ');
  const osaTxt = await page.textContent('.card[data-id="osaka"]');
  ok(osaTxt.indexOf('強風') >= 0 && osaTxt.indexOf('m/s') >= 0, '強風バッジに風速', osaTxt);
  const windColor = await page.$eval('.card[data-id="osaka"] .badge.wind', el => getComputedStyle(el).color);
  ok(/rgb\(179, 38, 30\)/.test(windColor), '強風バッジは赤系で強調', windColor);
  ok((await page.textContent('#updated')).indexOf('更新') >= 0, '最終更新時刻を表示', await page.textContent('#updated'));
  await page.screenshot({ path: SHOT + 'mock-01-list.' + TAG + 'png' });

  console.log('2. レーダー（ノータッチで見える雨雲）');
  ok(await page.$eval('#radarPanel', el => { const r = el.getBoundingClientRect(); return r.top > 0 && r.bottom < 844; }), 'レーダーパネルが初期表示で画面内にある');
  ok(await page.$eval('#radarPanel', el => el.getBoundingClientRect().height >= 300), 'レーダーパネルが十分な大きさ', await page.$eval('#radarPanel', el => Math.round(el.getBoundingClientRect().height)));
  ok(await page.$eval('#radarMap', el => el.getBoundingClientRect().height >= 210 && el.getBoundingClientRect().height <= 260), '地図の高さが220〜250px程度', await page.$eval('#radarMap', el => el.getBoundingClientRect().height));
  ok(await page.evaluate(() => { const p = document.getElementById('radarPanel').getBoundingClientRect(); const c = document.querySelector('#list .card').getBoundingClientRect(); return p.bottom <= c.top + 1; }), 'レーダーは地点一覧より上');
  ok(await page.$eval('#rmModes button[data-mode="rain"]', el => el.getAttribute('aria-selected')) === 'true', '初期表示は「🌧️ 雨雲」');
  const tiles = await page.evaluate(() => window.__mw.radar.rainTiles());
  ok(tiles.total >= 1 && tiles.loaded === tiles.total, '雨雲タイルが読み込まれている', tiles);
  const base = await page.evaluate(() => window.__mw.radar.baseTiles());
  ok(base.total >= 1 && base.loaded === base.total, '地図（国土地理院）タイルが読み込まれている', base);
  ok(await page.evaluate(() => window.__mw.radar.pinCount()) === 8, '登録8地点のピンが立つ', await page.evaluate(() => window.__mw.radar.pinCount()));
  const pinNames = await page.$$eval('#rmPins .rm-pin', els => els.map(e => e.getAttribute('aria-label')));
  ok(pinNames.some(t => t.indexOf('自宅') >= 0) && pinNames.some(t => t.indexOf('関西空港') >= 0), 'ピンに自宅・関空がある', pinNames);
  ok(/^\d\d:\d\d/.test(await page.textContent('#rmTag')), '雨雲の時刻ラベルが出る', await page.textContent('#rmTag'));
  const frames = await page.evaluate(() => window.__mw.radar.frames().length);
  ok(frames >= 5, '時間経過アニメーションのコマがある（' + frames + 'コマ）');
  await page.evaluate(() => window.__mw.radar.play(false));
  const fi1 = await page.evaluate(() => window.__mw.radar.frameIndex());
  await page.waitForTimeout(1400);
  const fi2 = await page.evaluate(() => window.__mw.radar.frameIndex());
  ok(fi1 === fi2, '一時停止するとコマが進まない', { fi1, fi2 });
  await page.tap('#rmPlay');
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => window.__mw.radar.frameIndex()) !== fi2, '▶でアニメーションが再開');
  await page.evaluate(() => window.__mw.radar.play(false));
  await page.screenshot({ path: SHOT + 'mock-10-radar-rain.' + TAG + 'png' });

  console.log('3. ワンタッチで 雨雲→風速→台風・気圧');
  await page.tap('#rmModes button[data-mode="wind"]');
  await page.waitForTimeout(900);
  ok(await page.$eval('#rmModes button[data-mode="wind"]', el => el.getAttribute('aria-selected')) === 'true', '風速に切り替わる');
  ok(await page.$eval('#rmModes button[data-mode="rain"]', el => el.getAttribute('aria-selected')) === 'false', '雨雲の選択が外れる');
  ok(await page.evaluate(() => document.getElementById('rmRain').hidden), '風速のときは雨雲タイルを隠す');
  ok((await ink()) > 2000, '風向・風速の矢印が描かれる', await ink());
  ok((await page.textContent('#rmFoot')).indexOf('最大') >= 0, '最大風速を表示', await page.textContent('#rmFoot'));
  await page.screenshot({ path: SHOT + 'mock-11-radar-wind.' + TAG + 'png' });

  await page.tap('#rmModes button[data-mode="pressure"]');
  await page.waitForTimeout(900);
  ok(await page.$eval('#rmModes button[data-mode="pressure"]', el => el.getAttribute('aria-selected')) === 'true', '台風・気圧に切り替わる');
  ok((await ink()) > 20000, '気圧の色分けが全面に描かれる', await ink());
  ok((await page.textContent('#rmFoot')).indexOf('気圧') >= 0, '気圧の範囲を表示', await page.textContent('#rmFoot'));
  const link = await page.$eval('#rmFoot a', el => el.getAttribute('href'));
  ok(link.indexOf('jma.go.jp') >= 0 && link.indexOf('typhoon') >= 0, '気象庁 台風情報へのリンク', link);
  await page.screenshot({ path: SHOT + 'mock-12-radar-pressure.' + TAG + 'png' });

  console.log('4. 拡大表示と地図の操作');
  await page.tap('#pillRadar');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => window.__mw.radar.isFocus()), 'ピルのタップで拡大表示になる');
  const bigH = await page.$eval('#radarMap', el => el.clientHeight);
  ok(bigH > 420, '地図が大きく（全画面に近く）なる', bigH);
  ok(await page.$eval('#radarPanel', el => getComputedStyle(el).position === 'fixed'), '拡大中は前面に固定表示');
  await page.screenshot({ path: SHOT + 'mock-13-radar-focus.' + TAG + 'png' });
  await page.tap('#rmFocus');
  await page.waitForTimeout(500);
  ok(!(await page.evaluate(() => window.__mw.radar.isFocus())), '⤡で縮小できる');

  const z0 = await page.evaluate(() => window.__mw.radar.view().z);
  await page.tap('#rmZin');
  await page.waitForTimeout(500);
  const z1 = await page.evaluate(() => window.__mw.radar.view().z);
  ok(z1 > z0, '＋で拡大できる', { z0, z1 });
  await page.tap('#rmZout');
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => window.__mw.radar.view());
  const box = await page.$eval('#radarMap', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.7, box.y + box.h * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.45, box.y + box.h * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => window.__mw.radar.view());
  ok(Math.abs(after.lon - before.lon) > 0.05 || Math.abs(after.lat - before.lat) > 0.05, 'ドラッグで地図を動かせる', { before, after });

  await page.evaluate(() => window.__mw.radar.setPoint(34.66, 135.44, 8.1));
  await page.waitForTimeout(400);
  await page.tap('#rmPins .rm-pin[data-id="kix"]');
  await page.waitForTimeout(600);
  ok(await page.$eval('#detailSheet', el => el.classList.contains('open')), 'ピンをタップで地点の詳細が開く');
  ok((await page.textContent('#dName')).indexOf('関西空港') >= 0, '関空の詳細が出る');
  await page.tap('#detailSheet [data-close]');
  await page.waitForTimeout(400);

  console.log('5. 絞り込みピル');
  await page.tap('.pill[data-filter="life"]');
  await page.waitForTimeout(250);
  ok(await cards() === 3, '生活ピルで3件', await cards());
  ok(await page.$eval('.pill[data-filter="life"]', el => el.getAttribute('aria-selected')) === 'true', '選択状態が切り替わる');
  await page.tap('.pill[data-filter="work"]');
  await page.waitForTimeout(250);
  ok(await cards() === 5, '乗務範囲ピルで5件', await cards());
  await page.tap('.pill[data-filter="all"]');
  await page.waitForTimeout(250);
  ok(await cards() === 8, 'すべてに戻すと8件', await cards());

  console.log('6. 詳細ボトムシート');
  await page.tap('.card[data-id="tennoji"]');
  await page.waitForTimeout(600);
  ok(await page.$eval('#detailSheet', el => el.classList.contains('open')), 'シートが開く');
  ok((await page.textContent('#dName')) === '天王寺（勤務先）', '地点名が見出しに出る');
  ok(await page.$$eval('#dBody .hour', els => els.length) === 24, '1時間ごと24コマ', await page.$$eval('#dBody .hour', els => els.length));
  ok(await page.$$eval('#dBody .day', els => els.length) === 7, '週間予報7日', await page.$$eval('#dBody .day', els => els.length));
  ok((await page.textContent('#dBody .hour')).indexOf('今') >= 0, '先頭コマは「今」');
  await page.screenshot({ path: SHOT + 'mock-02-detail.' + TAG + 'png' });

  const scroller = await page.evaluate(() => {
    const h = document.getElementById('hoursScroll');
    const before = h.scrollLeft; h.scrollLeft = 300;
    return { canScroll: h.scrollWidth > h.clientWidth + 20, moved: h.scrollLeft > before, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok(scroller.canScroll && scroller.moved, '24時間は横スクロールできる', scroller);
  ok(!scroller.pageOverflow, 'シート内スクロールでもページは横に伸びない');
  await wait(200);
  await page.screenshot({ path: SHOT + 'mock-03-hours.' + TAG + 'png' });

  await page.evaluate(() => { document.querySelector('#dBody').scrollTop = 520; });
  await wait(300);
  await page.screenshot({ path: SHOT + 'mock-04-week.' + TAG + 'png' });
  await page.tap('#detailSheet [data-close]');
  await page.waitForTimeout(400);
  ok(!(await page.$eval('#detailSheet', el => el.classList.contains('open'))), '✕でシートが閉じる');

  console.log('7. 場所の追加（検索→追加→保存→再読込）');
  await page.tap('#btnAdd');
  await page.waitForTimeout(500);
  ok(await page.$eval('#addSheet', el => el.classList.contains('open')), '追加シートが開く');
  await page.fill('#searchInput', '三ノ宮');
  await page.tap('.btn-search');
  await page.waitForTimeout(500);
  ok(await page.$$eval('#results .res', els => els.length) >= 1, '検索結果が出る', await page.$$eval('#results .res', els => els.length));
  ok((await page.textContent('#results .res')).indexOf('三ノ宮') >= 0, '三ノ宮が候補に出る');
  await page.screenshot({ path: SHOT + 'mock-05-add.' + TAG + 'png' });
  await page.tap('#results .res');
  await page.waitForTimeout(900);
  ok(await cards() === 9, '追加すると9枚になる', await cards());
  ok((await page.textContent('.list')).indexOf('三ノ宮') >= 0, '一覧に三ノ宮が出る');
  ok(await page.evaluate(() => window.__mw.radar.pinCount()) === 9, '追加した地点のピンも立つ', await page.evaluate(() => window.__mw.radar.pinCount()));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')));
  ok(stored.places.length === 9 && stored.places[8].name === '三ノ宮', 'localStorageに保存', stored.places.length);
  ok(await noHScroll(), '追加後も横スクロールなし');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1400);
  ok(await cards() === 9, '再読込しても9枚（保存が効く）', await cards());
  ok((await page.textContent('.list')).indexOf('三ノ宮') >= 0, '再読込後も三ノ宮が残る');

  console.log('8. 並び替え・削除・初期化');
  await page.tap('#btnManage');
  await page.waitForTimeout(500);
  ok(await page.$$eval('#mBody .mrow', els => els.length) === 9, '管理画面に9行', await page.$$eval('#mBody .mrow', els => els.length));
  const firstBefore = await page.$eval('#mBody .mrow .m-name', el => el.textContent);
  await page.tap('#mBody .mrow:nth-child(2) button[data-act="up"]');
  await page.waitForTimeout(400);
  const firstAfter = await page.$eval('#mBody .mrow .m-name', el => el.textContent);
  ok(firstBefore !== firstAfter, '▲で並びが変わる', { firstBefore, firstAfter });
  ok((await page.textContent('.list')).indexOf(firstAfter.split('神戸')[0]) >= 0, '一覧にも反映');
  await page.screenshot({ path: SHOT + 'mock-06-manage.' + TAG + 'png' });

  const delRow = await page.$('#mBody .mrow:nth-child(9)');
  await (await delRow.$('button[data-act="del"]')).click();
  await page.waitForTimeout(500);
  ok(await page.$$eval('#mBody .mrow', els => els.length) === 8, '✕で削除できる', await page.$$eval('#mBody .mrow', els => els.length));

  await page.tap('#btnReset');
  await page.waitForTimeout(1200);
  ok(await page.$$eval('#mBody .mrow', els => els.length) === 8, '初期地点に戻すと8件');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')).places.length) === 8, 'リセットが保存される');
  const resetNames = await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')).places.map(p => p.name));
  ok(resetNames[0] === '自宅（北区）', '先頭は自宅（北区）', resetNames[0]);
  ok(!resetNames.some(n => n.indexOf('白浜') >= 0), '初期地点に白浜はない', resetNames);
  await page.tap('#manageSheet [data-close]');
  await page.waitForTimeout(300);

  const onlineErrs = errs.slice();

  console.log('9. 通信できないとき');
  await page.route('**/v1/forecast*', route => route.abort());
  await page.evaluate(() => localStorage.removeItem('my_weather_cache_v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  ok(!(await page.$eval('#banner', el => el.hidden)), 'エラーバナーが出る');
  ok((await page.textContent('#banner')).indexOf('取得できません') >= 0, '文言が分かりやすい', await page.textContent('#banner'));
  ok(await page.evaluate(() => window.__mw.radar.rainTiles().loaded) >= 1, '通信できなくてもレーダーの地図・雨雲は出る');
  await page.screenshot({ path: SHOT + 'mock-07-offline.' + TAG + 'png' });
  await page.unroute('**/v1/forecast*');

  console.log('10. 端末に残った旧9地点の引き継ぎ');
  await page.route('**/v1/forecast*', async route => {
    const url = route.request().url();
    const m = url.match(/latitude=([^&]+)/);
    const n = m ? m[1].split(',').length : fixtureN;
    const isField = url.indexOf('pressure_msl') >= 0 || url.indexOf('wind_direction_10m') >= 0;
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(isField ? buildField(n) : buildFixture(n)) });
  });
  await page.evaluate(() => localStorage.setItem('my_weather_v1', JSON.stringify({ places: [
    { id: 'home', name: '自宅（花山）', sub: '神戸市北区 花山東町', emoji: '🏠', cat: 'life', lat: 34.7639, lon: 135.1886, home: true },
    { id: 'tennoji', name: '天王寺（勤務先）', sub: '大阪市天王寺区', emoji: '🏢', cat: 'life', lat: 34.6473, lon: 135.5139 },
    { id: 'nishikujo', name: '西九条（プール）', sub: '大阪市此花区', emoji: '🏊', cat: 'life', lat: 34.6828, lon: 135.4668 },
    { id: 'osaka', name: '大阪・環状線', sub: '大阪市北区', emoji: '🏙️', cat: 'work', lat: 34.7025, lon: 135.4959 },
    { id: 'otori', name: '鳳（阪和線）', sub: '堺市西区', emoji: '🚉', cat: 'work', lat: 34.5342, lon: 135.4488 },
    { id: 'kix', name: '関西空港（連絡橋）', sub: '泉佐野市 関空連絡橋', emoji: '✈️', cat: 'work', lat: 34.4347, lon: 135.2440 },
    { id: 'wakayama', name: '和歌山（阪和線）', sub: '和歌山市', emoji: '🍊', cat: 'work', lat: 34.2323, lon: 135.1916 },
    { id: 'shirahama', name: '白浜（きのくに線）', sub: '西牟婁郡 白浜町', emoji: '🐼', cat: 'work', lat: 33.6811, lon: 135.3886 },
    { id: 'kyoto', name: '京都（JR京都線）', sub: '京都市下京区', emoji: '⛩️', cat: 'work', lat: 34.9858, lon: 135.7588 }
  ], addCat: 'life' })));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  ok(await cards() === 8, '旧9地点の保存データでも8枚', await cards());
  const legacyTxt = await page.textContent('.list');
  ok(legacyTxt.indexOf('白浜') < 0, '白浜は一覧から消える');
  ok(legacyTxt.indexOf('自宅（北区）') >= 0 && legacyTxt.indexOf('花山') < 0, '自宅は「自宅（北区）」表記（花山は出ない）');
  const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')));
  ok(legacy.dv === 2 && legacy.places.length === 8, 'dv=2 で8地点が保存し直される', { dv: legacy.dv, n: legacy.places.length });
  const pinTxt = await page.$eval('#rmPins', el => el.textContent);
  ok(pinTxt.indexOf('花山') < 0, 'レーダーのピンにも花山は出ない');
  await page.screenshot({ path: SHOT + 'mock-08-migrated.' + TAG + 'png' });

  console.log('11. コンソールエラー・失敗レスポンス');
  ok(onlineErrs.length === 0, '通常操作でのコンソールエラー0件', onlineErrs.slice(0, 5));
  ok(badRes.length === 0, 'HTTP 4xx/5xx なし', badRes.slice(0, 5));

  console.log('\n結果: ' + pass + ' 件成功 / ' + fail + ' 件失敗');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
