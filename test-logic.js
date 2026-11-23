/* マイ天気: ロジックテスト（jsdom・APIはモック）
   実行: node test-logic.js
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/workspace/.testdeps/node_modules/jsdom');
const { buildFixture, buildField, BASE_DATE } = require('./test-fixture');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); }

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/* v1（公開初版）の既定9地点。端末に残っている古い保存データの再現用 */
const OLD_PLACES = [
  { id: 'home', name: '自宅（花山）', sub: '神戸市北区 花山東町', emoji: '🏠', cat: 'life', lat: 34.7639, lon: 135.1886, home: true },
  { id: 'tennoji', name: '天王寺（勤務先）', sub: '大阪市天王寺区', emoji: '🏢', cat: 'life', lat: 34.6473, lon: 135.5139 },
  { id: 'nishikujo', name: '西九条（プール）', sub: '大阪市此花区', emoji: '🏊', cat: 'life', lat: 34.6828, lon: 135.4668 },
  { id: 'osaka', name: '大阪・環状線', sub: '大阪市北区', emoji: '🏙️', cat: 'work', lat: 34.7025, lon: 135.4959 },
  { id: 'otori', name: '鳳（阪和線）', sub: '堺市西区', emoji: '🚉', cat: 'work', lat: 34.5342, lon: 135.4488 },
  { id: 'kix', name: '関西空港（連絡橋）', sub: '泉佐野市 関空連絡橋', emoji: '✈️', cat: 'work', lat: 34.4347, lon: 135.2440 },
  { id: 'wakayama', name: '和歌山（阪和線）', sub: '和歌山市', emoji: '🍊', cat: 'work', lat: 34.2323, lon: 135.1916 },
  { id: 'shirahama', name: '白浜（きのくに線）', sub: '西牟婁郡 白浜町', emoji: '🐼', cat: 'work', lat: 33.6811, lon: 135.3886 },
  { id: 'kyoto', name: '京都（JR京都線）', sub: '京都市下京区', emoji: '⛩️', cat: 'work', lat: 34.9858, lon: 135.7588 }
];

function newApp(opts) {
  const o = opts || {};
  const calls = [];
  /* jsdom は canvas を持たないので、その「未実装」通知だけを黙らせる */
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    if(!/Not implemented: HTMLCanvasElement/.test(String(e && e.message))) console.error(e && e.message);
  });
  const dom = new JSDOM(html, {
    url: 'https://norichan117.github.io/my-weather/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.confirm = () => true;
      if (o.geo) {
        try {
          Object.defineProperty(window.navigator, 'geolocation', {
            configurable: true,
            value: {
              getCurrentPosition(ok) { setTimeout(() => ok({ coords: { latitude: o.geo.latitude, longitude: o.geo.longitude } }), 0); },
              watchPosition() { return 1; },
              clearWatch() {}
            }
          });
        } catch (e) {}
      }
      if (o.denyGeo) {
        try {
          Object.defineProperty(window.navigator, 'geolocation', {
            configurable: true,
            value: {
              getCurrentPosition(ok, ng) { setTimeout(() => ng({ code: 1, message: 'User denied Geolocation' }), 0); },
              watchPosition() { return 1; },
              clearWatch() {}
            }
          });
        } catch (e) {}
      }
      if (o.seed) window.localStorage.setItem('my_weather_v1', typeof o.seed === 'string' ? o.seed : JSON.stringify(o.seed));
      window.fetch = function (url) {
        calls.push(String(url));
        if (o.fail) return Promise.reject(new Error('offline'));
        if (String(url).indexOf('heartrails') >= 0) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { location: [{ city: '大阪市北区' }] } }) });
        if (String(url).indexOf('bigdatacloud') >= 0) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ city: '大阪市北区' }) });
        const count = (String(url).match(/,/g) ? 1 : 0) + 0; // 使わない
        if (String(url).indexOf('/search') >= 0) return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
        if (String(url).indexOf('pressure_msl') >= 0) {
          const mf = String(url).match(/latitude=([^&]+)/);
          const nf = mf ? mf[1].split(',').length : 56;
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(buildField(nf)) });
        }
        // latitude の数を数えて地点数とする
        const m = String(url).match(/latitude=([^&]+)/);
        const n = m ? m[1].split(',').length : 8;
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
  eq(mw.state.places.length, 8, '初期地点は8か所');
  eq(doc.querySelectorAll('.list .card').length, 9, 'カードが9枚（現在地＋8地点）描画される');
  eq([...doc.querySelectorAll('.pill[data-filter]')].map(p => p.textContent.replace(/\s/g, '')),
     ['すべて9', '生活4', '乗務範囲5'], 'ピルの件数（すべて9/生活4/乗務範囲5）');
  ok(doc.querySelector('#pillRadar'), 'ピルに「🗺️ レーダー」がある');
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
  eq(doc.querySelectorAll('.list .card').length, 4, '生活＝4件（現在地＋3地点）');
  eq(doc.querySelector('.pill[data-filter="life"]').getAttribute('aria-selected'), 'true', '選択状態が入る');
  doc.querySelector('.pill[data-filter="work"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  eq(doc.querySelectorAll('.list .card').length, 5, '乗務範囲＝5件（現在地は出ない）');
  doc.querySelector('.pill[data-filter="all"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  eq(doc.querySelectorAll('.list .card').length, 9, 'すべて＝9件');

  console.log('6. 地点の追加');
  const added = mw.addPlace({ name: '三ノ宮', sub: '神戸市中央区', lat: 34.6946, lon: 135.1955, emoji: '🚉' });
  ok(!!added, '地点を追加できる');
  eq(mw.state.places.length, 9, '9か所になる');
  eq(mw.state.places[8].cat, 'life', '追加先は生活（既定）');
  const stored = JSON.parse(window.localStorage.getItem('my_weather_v1'));
  eq(stored.places.length, 9, 'localStorageに保存される');
  eq(stored.places[8].name, '三ノ宮', '保存内容に名前が入る');
  ok(!mw.addPlace({ name: '三ノ宮', sub: '', lat: 34.6946, lon: 135.1955 }), '同じ地点は二重追加しない');

  console.log('7. 並び替え・削除・初期化');
  mw.movePlace('home', 1);
  eq(mw.state.places[1].id, 'home', '▲▼で並びが入れ替わる');
  mw.movePlace('home', -1);
  eq(mw.state.places[0].id, 'home', '元に戻せる');
  mw.removePlace('tennoji');
  eq(mw.state.places.length, 8, '削除できる');
  ok(!mw.state.places.some(p => p.id === 'tennoji'), '削除した地点が消える');
  mw.state.places = mw.DEFAULT_PLACES.map(p => Object.assign({}, p));
  eq(mw.state.places.length, 8, '初期地点は8か所のまま（定数）');

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

  console.log('11. 旧保存データの引き継ぎ（既定地点 v1→v2）');
  const app4 = newApp({ seed: { places: OLD_PLACES, addCat: 'life' } });
  await wait(160);
  const m4 = app4.window.__mw;
  eq(m4.state.places.length, 8, '旧9地点は8地点になる');
  ok(!m4.state.places.some(p => p.id === 'shirahama'), '既定の白浜は消える');
  eq(m4.state.places[7].id, 'kyoto', '京都が8番目に詰まる');
  const h4 = m4.state.places.filter(p => p.id === 'home')[0];
  eq([h4.name, h4.sub], ['自宅（北区）', '神戸市北区'], '自宅の表記がぼける');
  eq([h4.lat, h4.lon], [34.77, 135.18], '自宅の座標が北区の代表地点にずれる');
  const st4 = JSON.parse(app4.window.localStorage.getItem('my_weather_v1'));
  eq(st4.dv, 2, '引き継ぎ版（dv=2）が保存される');
  eq(st4.places.length, 8, '保存内容も8地点');
  eq(app4.doc.querySelectorAll('.list .card').length, 9, '画面も9枚（現在地＋8地点）');

  const app5 = newApp({ seed: { places: OLD_PLACES.concat([{ id: 'px1', name: '白浜', sub: '西牟婁郡白浜町', emoji: '📍', cat: 'work', lat: 33.68, lon: 135.38, home: false }]), addCat: 'work' } });
  await wait(160);
  const m5 = app5.window.__mw;
  eq(m5.state.places.length, 9, '自分で追加した白浜は残る');
  ok(m5.state.places.some(p => p.id === 'px1' && p.name === '白浜'), '自分で追加した白浜はそのまま');

  const app6 = newApp({ seed: st4 });
  await wait(160);
  eq(app6.window.__mw.state.places.length, 8, '引き継ぎ済みのデータは変わらない（再読込）');
  eq(app6.window.__mw.state.places[0].name, '自宅（北区）', '再読込しても自宅はぼけたまま');

  console.log('12. レーダー（雨雲・風速・台風／気圧）');
  const app7 = newApp();
  await wait(220);
  const m7 = app7.window.__mw, d7 = app7.doc, r7r = m7.radar;
  ok(!!r7r, 'radar フックがある');
  ok(!!d7.getElementById('radarPanel'), 'レーダーパネルがある');
  eq(r7r.mode(), 'rain', '初期表示は「雨雲」');
  eq(d7.querySelectorAll('#rmModes button[data-mode]').length, 3, '雨雲・風速・台風の3ボタン');
  eq(d7.querySelector('#rmModes button[data-mode="rain"]').getAttribute('aria-selected'), 'true', '雨雲が選択済み');
  eq(d7.querySelectorAll('#rmPins .rm-pin').length, 8, '登録8地点のピンが立つ');
  ok(d7.querySelector('#rmPins .rm-pin.home'), '自宅のピンは区別される');
  ok(/^\d\d:\d\d/.test(d7.getElementById('rmTag').textContent), '雨雲の時刻ラベル', d7.getElementById('rmTag').textContent);
  ok(r7r.frames().length >= 5, '時間経過のコマがある', r7r.frames().length);

  r7r.setMode('wind');
  await wait(250);
  eq(r7r.mode(), 'wind', '風速に切り替わる');
  eq(d7.querySelector('#rmModes button[data-mode="wind"]').getAttribute('aria-selected'), 'true', '風速ボタンが選択状態');
  eq(d7.querySelector('#rmModes button[data-mode="rain"]').getAttribute('aria-selected'), 'false', '雨雲ボタンの選択が外れる');
  ok(d7.getElementById('rmRain').hidden, '風速では雨雲タイルを隠す');
  ok(d7.getElementById('rmFoot').textContent.indexOf('最大') >= 0, '最大風速を表示', d7.getElementById('rmFoot').textContent);
  ok(!!r7r.field() && r7r.field().lat.length === 56, '風・気圧の格子点データ（8×7）', r7r.field() && r7r.field().lat.length);

  r7r.setMode('pressure');
  await wait(250);
  eq(r7r.mode(), 'pressure', '台風・気圧に切り替わる');
  ok(d7.getElementById('rmFoot').textContent.indexOf('気圧') >= 0, '気圧の範囲を表示', d7.getElementById('rmFoot').textContent);
  ok((d7.querySelector('#rmFoot a') || {}).getAttribute && d7.querySelector('#rmFoot a').getAttribute('href').indexOf('typhoon') > 0, '気象庁 台風情報へのリンク');

  r7r.setMode('rain');
  await wait(120);
  ok(!d7.getElementById('rmRain').hidden, '雨雲に戻すとタイルが再表示');
  const fr = r7r.frames();
  r7r.setFrame(fr.length - 1);
  eq(r7r.frameIndex(), fr.length - 1, 'コマを指定できる');

  r7r.setFocus(true);
  ok(r7r.isFocus(), 'ピルから拡大表示できる');
  ok(d7.getElementById('radarPanel').classList.contains('focus'), '拡大用クラスが付く');
  r7r.setFocus(false);
  ok(!r7r.isFocus(), '元に戻せる');

  ok(d7.querySelector('#rmPins .rm-pin[data-id="kix"]'), '関空のピンがある');
  d7.querySelector('#rmPins .rm-pin[data-id="kix"]').dispatchEvent(new app7.window.Event('click', { bubbles: true }));
  await wait(120);
  ok(d7.getElementById('detailSheet').classList.contains('open'), 'ピンのタップで地点の詳細が開く');

  console.log('13. 現在地カード（位置情報）');
  const app8 = newApp({ geo: { latitude: 34.7050, longitude: 135.4900 } });
  await wait(260);
  const m8 = app8.window.__mw, d8 = app8.doc;
  ok(!!d8.querySelector('.card[data-id="geo"]'), '現在地カードがある');
  eq(d8.querySelector('.list .card').getAttribute('data-id'), 'geo', '一覧のいちばん上が現在地');
  ok(!!m8.geo.coords(), '位置情報を取得できる');
  eq(m8.geo.coords().lat, 34.705, '緯度');
  eq(m8.geo.coords().lon, 135.49, '経度');
  eq(m8.geo.label(), '大阪市北区', '市区町村名（逆ジオコーディング）');
  const gc = d8.querySelector('.card[data-id="geo"]').textContent;
  ok(gc.indexOf('現在地') >= 0 && gc.indexOf('大阪市北区') >= 0, 'カードに現在地と地名', gc.replace(/\s+/g, ' ').slice(0, 80));
  ok(/\d+°/.test(gc), '現在地の気温が出る', gc.replace(/\s+/g, ' ').slice(0, 80));
  ok(!!d8.querySelector('.card[data-id="geo"] [data-act="geo"]'), '「現在地を更新」ボタンがある');
  eq(d8.querySelectorAll('.list .card').length, 9, '現在地＋8地点で9枚');
  eq(m8.state.places.length, 8, '保存される地点は8のまま（現在地は別扱い）');
  ok(!JSON.parse(app8.window.localStorage.getItem('my_weather_v1')).places.some(p => p.id === 'geo'), '現在地は地点リストに保存しない');
  const rv8 = m8.radar.view();
  ok(Math.abs(rv8.lat - 34.705) < 0.05 && Math.abs(rv8.lon - 135.49) < 0.05, 'レーダーの中心が現在地に合う', rv8);
  ok(!!d8.querySelector('#rmPins .rm-pin.geo'), 'レーダーに現在地ピンがある');
  d8.querySelector('.card[data-id="geo"]').dispatchEvent(new app8.window.Event('click', { bubbles: true }));
  await wait(120);
  ok(d8.getElementById('detailSheet').classList.contains('open'), '現在地カードの詳細が開く');

  console.log('14. 位置情報を拒否されたとき');
  const app9 = newApp({ denyGeo: true });
  await wait(220);
  const d9 = app9.doc;
  ok(!!d9.querySelector('.card[data-id="geo"]'), '拒否されても現在地カードは残る');
  ok(d9.querySelector('.card[data-id="geo"]').textContent.indexOf('許可されて') >= 0, '拒否の案内を出す', d9.querySelector('.card[data-id="geo"]').textContent.replace(/\s+/g, ' '));
  ok(!!d9.querySelector('.card[data-id="geo"] [data-act="geo"]'), '「現在地を取得」ボタンがある');
  d9.querySelector('.card[data-id="geo"] [data-act="geo"]').dispatchEvent(new app9.window.Event('click', { bubbles: true }));
  await wait(160);
  ok(!!d9.querySelector('.card[data-id="geo"]'), '再取得しても崩れない');
  eq(d9.querySelectorAll('.list .card').length, 9, '地点カードはそのまま（現在地＋8）');

  console.log('\n結果: ' + pass + ' 件成功 / ' + fail + ' 件失敗');
  process.exit(fail ? 1 : 0);
})();
