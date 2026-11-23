# マイ天気（my-weather）

生活圏と乗務範囲の天気を、1画面でぱっと見渡すための個人用アプリです。
`index.html` 1ファイルで完結する静的サイトで、データは [Open-Meteo](https://open-meteo.com/) の無料API（APIキー不要）から取得します。

公開URL: **https://norichan117.github.io/my-weather/**

## できること

- **1画面の一覧**：自宅・天王寺・西九条（生活）と、大阪環状線・鳳・関西空港・和歌山・京都（乗務範囲）の8地点をカードで表示（乗務範囲の南端は和歌山駅まで）
- **ひと目で分かるバッジ**
  - ☔ 傘 … 現在雨／雪、または今後12時間の降水確率50%以上、または今後6時間の降水量0.5mm以上
  - 💨 強風 ○m/s … 今後12時間の最大風速10m/s以上（赤）、7m/s以上（橙）
  - 🚲 自転車OK／🚶 徒歩27分目安 … 自宅カード専用
- **タップで詳細**：これから24時間の1時間ごと予報（天気・気温・降水確率・降水量・風速）と7日間予報
- **場所の追加**：駅名・市区町村・海外都市を検索して追加（関西の主要駅と主要都市は内蔵データから即座に候補表示、それ以外は Open-Meteo Geocoding API）
- **並び替え・削除・初期地点に戻す**：すべて端末の `localStorage` に保存
- **オフライン耐性**：最後に取得したデータをキャッシュして表示

> 公開ページに載る自宅は「自宅（北区）」表記、座標は北区の代表地点（約1kmずらし）で、町名や自宅そのものが出ないようにしています。

## 使い方（スマホ）

1. https://norichan117.github.io/my-weather/ を開く
2. Chrome のメニュー →「ホーム画面に追加」でアプリのように起動できます

## ファイル

| ファイル | 内容 |
| --- | --- |
| `index.html` | アプリ本体（HTML/CSS/JS を1ファイルに同梱。PWAマニフェストとアイコンもデータURLで埋め込み） |
| `icon-192.png` / `icon-512.png` | ホーム画面用アイコン |
| `build-icons.py` | アイコンとマニフェストを再生成するスクリプト（`index.html` の `__MANIFEST__` / `__ICON192__` を置換） |
| `test-fixture.js` | テスト用の Open-Meteo 風レスポンス（雨・強風のシナリオを含む） |
| `test-logic.js` | jsdom によるロジックテスト（79項目） |
| `test-browser.js` | Playwright によるモバイル実画面テスト（390×844・45項目） |
| `test-live.js` | 公開URLに対するライブテスト |

## テスト

```bash
# ロジック（jsdom）
node test-logic.js

# ブラウザ（ローカルを 8899 で配信してから）
python3 -m http.server 8899
node test-browser.js http://127.0.0.1:8899/index.html

# 公開URL
node test-live.js
```

## データについて

- 天気: Open-Meteo Forecast API（`timezone=auto`, `forecast_days=7`, `wind_speed_unit=ms`）
- 地名検索: Open-Meteo Geocoding API（日本語対応）＋ 内蔵の関西主要駅リスト
- 地点・並び順・追加した場所は端末内（`localStorage` キー `my_weather_v1`）にのみ保存され、外部には送信しません
- 既定地点は `DEFAULT_VERSION` で管理し、古い一覧が端末に残っている場合は読み込み時に新しい既定へ引き継ぎます（v2 で白浜を削除、自宅の表記・座標をぼかし）
