#!/usr/bin/env python3
"""生成应用图标：深色背景 + 计算器符号"""
import os
from PIL import Image, ImageDraw

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "res")


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 圆角背景（深色渐变近似：直接用 Catppuccin 底色）
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=(30, 30, 46, 255))
    # 显示屏区域
    disp = (int(size * 0.18), int(size * 0.16), int(size * 0.82), int(size * 0.42))
    d.rounded_rectangle(disp, radius=int(size * 0.05), fill=(24, 24, 37, 255),
                        outline=(137, 180, 250, 255), width=max(1, int(size * 0.02)))
    # 显示屏上的数字
    d.text((int(size * 0.30), int(size * 0.20)), "42",
           fill=(205, 214, 244, 255),
           font=None, anchor=None)
    # 四个按钮
    colors = [(137, 180, 250, 255), (249, 226, 175, 255),
              (166, 227, 161, 255), (243, 139, 168, 255)]
    labels = ["7", "8", "9", "+"]
    bw = int(size * 0.17)
    gap = int(size * 0.04)
    start_x = int(size * 0.16)
    y = int(size * 0.54)
    for i, (c, lab) in enumerate(zip(colors, labels)):
        x = start_x + i * (bw + gap)
        d.rounded_rectangle([x, y, x + bw, y + bw], radius=int(size * 0.04), fill=c)
        d.text((x + int(bw * 0.32), y + int(bw * 0.24)), lab,
               fill=(30, 30, 46, 255), font=None, anchor=None)
    return img


def main():
    for folder, size in SIZES.items():
        out_dir = os.path.join(BASE_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        draw_icon(size).save(os.path.join(out_dir, "ic_launcher.png"))
        print(f"generated {folder}/ic_launcher.png ({size}x{size})")


if __name__ == "__main__":
    main()
