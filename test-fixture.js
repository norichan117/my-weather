/* マイ天気: テスト用の Open-Meteo 風レスポンス生成
   地点の並びは state.places と同じ順（latitude の配列順）に返す想定。
   place i の振る舞い:
     0 自宅    : 晴れ・降水10%・風3m/s  -> 傘なし / 🚲自転車OK
     1 天王寺  : 雨・降水80%            -> ☔傘
     2 西九条  : 晴れ
     3 大阪    : 強風 12m/s             -> 💨強風
     4 鳳      : 晴れ（風 7.5m/s -> 「風」バッジ）
     5 関空    : 強風 14m/s + 雨
     6 以降    : 晴れ
*/
const BASE_DATE = '2026-11-23';
const CURRENT_HOUR = '09:00';

function pad(n) { return (n < 10 ? '0' : '') + n; }

function times(days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(Date.UTC(2026, 10, 23 + d));
    const ds = day.getUTCFullYear() + '-' + pad(day.getUTCMonth() + 1) + '-' + pad(day.getUTCDate());
    for (let h = 0; h < 24; h++) out.push(ds + 'T' + pad(h) + ':00');
  }
  return out;
}

function buildOne(i) {
  const t = times(7);
  const n = t.length;
  const profile = i % 9;
  const isRain = (profile === 1 || profile === 5);
  const wind = profile === 3 ? 12 : profile === 5 ? 14 : profile === 4 ? 7.5 : 3;
  const pop = isRain ? 80 : profile === 5 ? 70 : 10;
  const code = isRain ? (profile === 5 ? 82 : 63) : 1;

  return {
    latitude: 34.7 - i * 0.05,
    longitude: 135.2 + i * 0.02,
    timezone: 'Asia/Tokyo',
    utc_offset_seconds: 32400,
    current_units: { temperature_2m: '°C', wind_speed_10m: 'm/s' },
    current: {
      time: BASE_DATE + 'T' + CURRENT_HOUR,
      interval: 900,
      temperature_2m: 12 + i,
      weather_code: code,
      wind_speed_10m: wind,
      apparent_temperature: 11 + i,
      precipitation: isRain ? 0.4 : 0
    },
    hourly_units: { temperature_2m: '°C', wind_speed_10m: 'm/s', precipitation: 'mm', precipitation_probability: '%' },
    hourly: {
      time: t,
      temperature_2m: t.map((x, k) => 8 + (k % 12) * 0.6 + i),
      precipitation_probability: t.map((x, k) => (k >= 9 && k <= 20 ? pop : Math.max(0, pop - 40))),
      precipitation: t.map((x, k) => (isRain && k >= 9 && k <= 20 ? 0.6 : 0)),
      weather_code: t.map((x, k) => (isRain && k >= 9 && k <= 20 ? code : 1)),
      wind_speed_10m: t.map((x, k) => (k >= 9 && k <= 14 ? wind : 2))
    },
    daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%', wind_speed_10m_max: 'm/s' },
    daily: {
      time: [0, 1, 2, 3, 4, 5, 6].map(d => {
        const dt = new Date(Date.UTC(2026, 10, 23 + d));
        return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
      }),
      weather_code: [0, 1, 2, 3, 61, 0, 1].map((c, k) => (isRain && k < 3 ? code : c)),
      temperature_2m_max: [15, 16, 17, 14, 13, 15, 16].map(v => v + i * 0.5),
      temperature_2m_min: [5, 6, 7, 4, 3, 5, 6].map(v => v + i * 0.5),
      precipitation_probability_max: [pop, pop, 30, 20, 60, 10, 20],
      wind_speed_10m_max: [wind, wind, 4, 3, 5, 2, 3],
      sunrise: [0, 1, 2, 3, 4, 5, 6].map(() => BASE_DATE + 'T06:41'),
      sunset: [0, 1, 2, 3, 4, 5, 6].map(() => BASE_DATE + 'T16:51')
    }
  };
}

function buildFixture(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(buildOne(i));
  return out;
}

module.exports = { buildFixture, BASE_DATE, CURRENT_HOUR };
