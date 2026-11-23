#!/usr/bin/env python3
"""マイ天気: アイコンPNGとPWAマニフェストを生成し、index.html のプレースホルダーを埋める。
   使い方: python3 build-icons.py
"""
import base64, io, json, os, re
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def make_icon(size):
    S = size * 4  # 高解像度で描いて縮小（アンチエイリアス）
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 空のグラデーション
    top, bot = (0x4F, 0x9C, 0xE0), (0x9A, 0xD2, 0xF2)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=(
            int(top[0] + (bot[0] - top[0]) * t),
            int(top[1] + (bot[1] - top[1]) * t),
            int(top[2] + (bot[2] - top[2]) * t), 255))
    # 太陽
    cx, cy, r = S * 0.36, S * 0.34, S * 0.15
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0xFF, 0xD5, 0x66, 255))
    for i in range(8):
        import math
        a = math.radians(i * 45)
        x1, y1 = cx + math.cos(a) * r * 1.28, cy + math.sin(a) * r * 1.28
        x2, y2 = cx + math.cos(a) * r * 1.55, cy + math.sin(a) * r * 1.55
        d.line([(x1, y1), (x2, y2)], fill=(0xFF, 0xE0, 0x8A, 255), width=int(S * 0.022))
    # 雲（白い楕円の合成）
    white = (255, 255, 255, 255)
    d.ellipse([S * 0.20, S * 0.52, S * 0.55, S * 0.74], fill=white)
    d.ellipse([S * 0.36, S * 0.45, S * 0.72, S * 0.75], fill=white)
    d.ellipse([S * 0.55, S * 0.55, S * 0.84, S * 0.76], fill=white)
    d.rounded_rectangle([S * 0.20, S * 0.63, S * 0.84, S * 0.76], radius=int(S * 0.065), fill=white)
    # 角丸マスク
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


def data_url(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    i192, i512 = make_icon(192), make_icon(512)
    i192.save(os.path.join(HERE, "icon-192.png"))
    i512.save(os.path.join(HERE, "icon-512.png"))
    u192, u512 = data_url(i192), data_url(i512)
    manifest = {
        "name": "マイ天気", "short_name": "マイ天気",
        "description": "生活圏と乗務範囲の天気を1画面で確認できる個人用天気アプリ。",
        "lang": "ja", "dir": "ltr", "start_url": ".", "scope": ".",
        "display": "standalone", "orientation": "portrait",
        "background_color": "#eef4fb", "theme_color": "#eef4fb",
        "categories": ["weather", "utilities"],
        "icons": [
            {"src": u192, "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": u512, "sizes": "512x512", "type": "image/png", "purpose": "any"},
        ],
    }
    murl = "data:application/manifest+json;base64," + base64.b64encode(
        json.dumps(manifest, ensure_ascii=False).encode()).decode()
    p = os.path.join(HERE, "index.html")
    html = open(p, encoding="utf-8").read()
    html = html.replace("__MANIFEST__", murl).replace("__ICON192__", u192)
    open(p, "w", encoding="utf-8").write(html)
    left = len(re.findall(r"__[A-Z0-9]+__", html))
    print("index.html 更新: %d bytes, 残プレースホルダー %d" % (len(html), left))


if __name__ == "__main__":
    main()
