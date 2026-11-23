/* マイ天気: ロジックテスト（jsdom・APIはモック）
   実行: node test-logic.js
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/workspace/.testdeps/node_modules/jsdom');
const { buildFixture, BASE_DATE } = require('./test-fixture');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function newApp(opts) {
  const o = opts || {};
  const calls = [];
  const dom = new JSDOM(html, {
    url: 'https://norichan117.github.io/my-weather/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.confirm = () => true;
      window.fetch = function (url) {
        calls.push(String(url));
        if (o.fail) return Promise.reject(new Error('offline'));
        const count = (String(url).match(/,/g) ? 1 : 0) + 0; // 使わない
        if (String(url).indexOf('/search') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
        // latitude の数を数えて地点数とする
        const m = String(url).match(/latitude=([^&]+)/);
        const n = m ? m[1].split(',').length : 9;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(buildFixture(n)) });
      };
    }
  });
  return { dom, window: dom.window, doc: dom.window.document, calls };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('1. 初期表示');
  let { window, doc, calls } = newApp();
  await wait(120);
  const mw = window.__mw;
  ok(!!mw, '__mw フックがある');
  eq(mw.state.places.length, 9, '初期地点は9か所');
  eq(doc.querySelectorAll('.list .card').length, 9, 'カードが9枚描画される');
  eq([...doc.querySelectorAll('.pill')].map(p => p.textContent.replace(/\s/g, '')),
     ['すべて9', '生活3', '乗務範囲6'], 'ピルの件数（すべて9/生活3/乗務範囲6）');
  ok(doc.getElementById('updated').textContent.indexOf('更新') >= 0, '最終更新時刻が出る', doc.getElementById('updated').textContent);
  ok(calls[0].indexOf('wind_speed_unit=ms') > 0, 'APIに wind_speed_unit=ms を指定');
  ok(calls[0].indexOf('timezone=auto') > 0, 'APIに timezone=auto を指定');
  ok(calls[0].indexOf('forecast_days=7') > 0, 'APIに forecast_days=7 を指定');

  console.log('2. 天気アイコンと日本語名');
  const codes = { 0: '快晴', 1: '晴れ', 2: '晴れ時々曇り', 3: '曇り', 45: '霧', 61: '弱い雨', 63: '雨', 65: '強い雨', 80: 'にわか雨', 95: '雷雨', 71: '弱い雪', 75: '強い雪' };
  for (const c of Object.keys(codes)) {
    eq(mw.weatherMeta(Number(c)).label, codes[c], 'コード' + c + ' → ' + codes[c]);
  }
  ok(mw.weatherMeta(0).icon.length > 0, 'アイコンが返る');

  console.log('3. 傘・強風・自転車の判定');
  const home = mw.state.places[0];
  const tennoji = mw.state.places[1];
  const osaka = mw.state.places[3];
  const otori = mw.state.places[4];
  const kix = mw.state.places[5];
  const aHome = mw.analyze(home.id), aTen = mw.analyze(tennoji.id), aOsa = mw.analyze(osaka.id), aOto = mw.analyze(otori.id), aKix = mw.analyze(kix.id);
  eq(aHome.umbrella, false, '自宅（晴れ・10%）は傘なし');
  eq(aTen.umbrella, true, '天王寺（雨80%）は傘あり');
  eq(aKix.umbrella, true, '関空（雨82コード）は傘あり');
  eq(aOsa.strong, true, '大阪（風12m/s）は強風');
  eq(aKix.strong, true, '関空（風14m/s）は強風');
  eq(aOto.windy, true, '鳳（風7.5m/s）は「風」注意');
  eq(aHome.strong, false, '自宅は強風ではない');

  const homeCard = doc.querySelector('.card[data-id="home"]');
  ok(homeCard.textContent.indexOf('自転車OK') >= 0, '自宅カードに 🚲自転車OK');
  ok(homeCard.textContent.indexOf('徒歩27分') < 0, '晴れの日は徒歩表示なし');
  const tenCard = doc.querySelector('.card[data-id="tennoji"]');
  ok(tenCard.textContent.indexOf('傘') >= 0, '雨の地点に ☔傘バッジ');
  ok(tenCard.querySelector('.badge.rain'), '傘バッジのクラス');
  const osaCard = doc.querySelector('.card[data-id="osaka"]');
  ok(osaCard.textContent.indexOf('強風 12m/s') >= 0, '強風バッジに風速が出る', osaCard.textContent);
  ok(osaCard.querySelector('.badge.wind'), '強風バッジは強調クラス');

  /* 雨の日は自宅が徒歩27分になる */
  const savedHome = JSON.parse(JSON.stringify(mw.placeData['home']));
  mw.placeData['home'] = JSON.parse(JSON.stringify(mw.placeData['tennoji']));
  mw.render();
  ok(doc.querySelector('.card[data-id="home"]').textContent.indexOf('徒歩27分') >= 0, '雨の日は自宅に 🚶徒歩27分目安');
  ok(doc.querySelector('.card[data-id="home"]').textContent.indexOf('自転車OK') < 0, '雨の日は自転車OKを出さない');
  mw.placeData['home'] = savedHome;

  console.log('4. 24時間の切り出し');
  const idx = mw.hourStartIndex(mw.placeData['home']);
  eq(mw.placeData['home'].hourly.time[idx].slice(11, 13), '09', '現在時刻(09時)から開始');
  const h24 = mw.nextHours(mw.placeData['home'], 24);
  eq(h24.length, 24, '24時間ぶん取れる');
  eq(h24[0].time.slice(0, 10), BASE_DATE, '先頭は今日');

  console.log('5. 絞り込みピル');
  doc.querySelector('.pill[data-filter="life"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  eq(doc.querySelectorAll('.list .card').length, 3, '生活＝3件');
  eq(doc.querySelector('.pill[data-filter="life"]').getAttribute('aria-selected'), 'true', '選択状態が入る');
  doc.querySelector('.pill[data-filter="work"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  eq(doc.querySelectorAll('.list .card').length, 6, '乗務範囲＝6件');
  doc.querySelector('.pill[data-filter="all"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  eq(doc.querySelectorAll('.list .card').length, 9, 'すべて＝9件');

  console.log('6. 地点の追加');
  const added = mw.addPlace({ name: '三ノ宮', sub: '神戸市中央区', lat: 34.6946, lon: 135.1955, emoji: '🚉' });
  ok(!!added, '地点を追加できる');
  eq(mw.state.places.length, 10, '10か所になる');
  eq(mw.state.places[9].cat, 'life', '追加先は生活（既定）');
  const stored = JSON.parse(window.localStorage.getItem('my_weather_v1'));
  eq(stored.places.length, 10, 'localStorageに保存される');
  eq(stored.places[9].name, '三ノ宮', '保存内容に名前が入る');
  ok(!mw.addPlace({ name: '三ノ宮', sub: '', lat: 34.6946, lon: 135.1955 }), '同じ地点は二重追加しない');

  console.log('7. 並び替え・削除・初期化');
  mw.movePlace('home', 1);
  eq(mw.state.places[1].id, 'home', '▲▼で並びが入れ替わる');
  mw.movePlace('home', -1);
  eq(mw.state.places[0].id, 'home', '元に戻せる');
  mw.removePlace('tennoji');
  eq(mw.state.places.length, 9, '削除できる');
  ok(!mw.state.places.some(p => p.id === 'tennoji'), '削除した地点が消える');
  mw.state.places = mw.DEFAULT_PLACES.map(p => Object.assign({}, p));
  eq(mw.state.places.length, 9, '初期地点は9か所のまま（定数）');

  console.log('8. 通信エラー時');
  const app2 = newApp({ fail: true });
  await wait(150);
  const d2 = app2.doc;
  ok(!d2.getElementById('banner').hidden, 'エラーバナーが出る');
  ok(d2.getElementById('banner').textContent.indexOf('取得できません') >= 0, '取得失敗の文言', d2.getElementById('banner').textContent);
  eq(d2.querySelectorAll('.list .card').length, 9, 'エラーでも地点は並ぶ');
  ok(d2.querySelector('.card[data-id="home"] .tmp').textContent.indexOf('—') >= 0, '気温は — 表示');
  ok(d2.getElementById('btnRetry'), '再試行ボタンがある');

  console.log('9. キャッシュ（前回データ）');
  const app3 = newApp();
  await wait(120);
  const cache = app3.window.localStorage.getItem('my_weather_cache_v1');
  ok(!!cache && JSON.parse(cache).byId.home, '取得結果をキャッシュに保存');
  ok(app3.window.__mw.getLastUpdated() !== null, '最終更新時刻が入る');

  console.log('10. 検索（内蔵データベース）');
  eq(mw.searchLocal('さんのみや')[0].name, '三ノ宮', 'ひらがなで駅を検索');
  eq(mw.searchLocal('Sannomiya')[0].name, '三ノ宮', 'ローマ字で駅を検索');
  ok(mw.searchLocal('三ノ宮').length >= 1, '漢字で駅を検索');
  ok(mw.searchLocal('マニラ').length === 1, '海外都市も検索できる');
  ok(mw.searchLocal('王寺').some(x => x.name === '王寺'), '王寺が引ける');
  ok(mw.LOCAL_DB.length >= 60, '内蔵地点が60件以上', mw.LOCAL_DB.length);

  console.log('\n結果: ' + pass + ' 件成功 / ' + fail + ' 件失敗');
  process.exit(fail ? 1 : 0);
})();
