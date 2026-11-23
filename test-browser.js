/* マイ天気: ブラウザ実画面テスト（390×844）
   - API はルートモック（雨・強風の見た目と操作を再現）
   - 最後に実APIでも表示を確認
   実行: node test-browser.js [baseURL]
*/
const { chromium } = require('/workspace/tool-results/_build/node_modules/playwright');
const { buildFixture } = require('./test-fixture');

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

  let fixtureN = 9;
  await page.route('**/v1/forecast*', async route => {
    const m = route.request().url().match(/latitude=([^&]+)/);
    const n = m ? m[1].split(',').length : fixtureN;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(buildFixture(n))
    });
  });
  await page.route('**/geocoding-api.open-meteo.com/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Kobe', latitude: 34.69, longitude: 135.19, admin1: 'Hyogo', country: 'Japan', country_code: 'JP' }] }) });
  });

  const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const cards = async () => page.$$eval('.list .card', els => els.length);

  console.log('1. 一覧（モックAPI: 雨・強風を含む）');
  const res = await page.goto(BASE + '?cb=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  ok(res && res.status() === 200, 'ローカルページが200で開ける', res && res.status());
  ok(await cards() === 8, 'カード8枚', await cards());
  ok(await noHScroll(), '横スクロールなし（390px）');
  const visible = await page.$$eval('.list .card', els => els.filter(c => { const r = c.getBoundingClientRect(); return r.top < 844 && r.bottom < 844; }).length);
  ok(visible >= 5, '1画面に5地点以上がすっぽり入る（実際: ' + visible + '）');

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

  console.log('2. 絞り込みピル');
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

  console.log('3. 詳細ボトムシート');
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

  console.log('4. 場所の追加（検索→追加→保存→再読込）');
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
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')));
  ok(stored.places.length === 9 && stored.places[8].name === '三ノ宮', 'localStorageに保存', stored.places.length);
  ok(await noHScroll(), '追加後も横スクロールなし');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  ok(await cards() === 9, '再読込しても9枚（保存が効く）', await cards());
  ok((await page.textContent('.list')).indexOf('三ノ宮') >= 0, '再読込後も三ノ宮が残る');

  console.log('5. 並び替え・削除・初期化');
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

  console.log('6. 通信できないとき');
  await page.route('**/v1/forecast*', route => route.abort());
  await page.evaluate(() => localStorage.removeItem('my_weather_cache_v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  ok(!(await page.$eval('#banner', el => el.hidden)), 'エラーバナーが出る');
  ok((await page.textContent('#banner')).indexOf('取得できません') >= 0, '文言が分かりやすい', await page.textContent('#banner'));
  await page.screenshot({ path: SHOT + 'mock-07-offline.' + TAG + 'png' });
  await page.unroute('**/v1/forecast*');

  console.log('7. 端末に残った旧9地点の引き継ぎ');
  await page.route('**/v1/forecast*', async route => {
    const m = route.request().url().match(/latitude=([^&]+)/);
    const n = m ? m[1].split(',').length : fixtureN;
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(buildFixture(n)) });
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
  await page.waitForTimeout(1500);
  ok(await cards() === 8, '旧9地点の保存データでも8枚', await cards());
  const legacyTxt = await page.textContent('.list');
  ok(legacyTxt.indexOf('白浜') < 0, '白浜は一覧から消える');
  ok(legacyTxt.indexOf('自宅（北区）') >= 0 && legacyTxt.indexOf('花山') < 0, '自宅は「自宅（北区）」表記（花山は出ない）');
  const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem('my_weather_v1')));
  ok(legacy.dv === 2 && legacy.places.length === 8, 'dv=2 で8地点が保存し直される', { dv: legacy.dv, n: legacy.places.length });
  await page.screenshot({ path: SHOT + 'mock-08-migrated.' + TAG + 'png' });

  console.log('8. コンソールエラー');
  ok(onlineErrs.length === 0, '通常操作でのコンソールエラー0件', onlineErrs.slice(0, 5));

  console.log('\n結果: ' + pass + ' 件成功 / ' + fail + ' 件失敗');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
