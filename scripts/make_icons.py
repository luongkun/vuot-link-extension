"""Generate Vượt Link extension icons (16/32/48/128 PNG).

The design is a simple gradient blue rounded square with a stylized
right-arrow "FastForward" double chevron in white. Run:
    python3 scripts/make_icons.py
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "icons")


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: gradient-ish blue rounded square.
    radius = max(2, size // 5)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bg)
    # Solid base color, then a lighter band on the top half to fake a gradient.
    bd.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=(30, 136, 229, 255))
    bd.rounded_rectangle(
        (0, 0, size - 1, size // 2),
        radius=radius,
        fill=(66, 165, 245, 255),
    )
    img = Image.alpha_composite(img, bg)
    draw = ImageDraw.Draw(img)

    # Double-chevron ">>"
    w = size
    # Geometry for the chevrons.
    pad_x = w * 0.20
    pad_y = w * 0.22
    chev_w = w * 0.30
    chev_h = w * 0.56
    gap = w * 0.05
    thickness = max(1, int(w * 0.10))

    def chevron(x0: float) -> None:
        # An "arrow head" filled polygon.
        top = (x0, pad_y)
        mid = (x0 + chev_w, pad_y + chev_h / 2)
        bot = (x0, pad_y + chev_h)
        inner_top = (x0 + chev_w - thickness * 1.4, pad_y + thickness * 0.8)
        inner_mid = (x0 + chev_w - thickness * 1.4, pad_y + chev_h / 2)
        inner_bot = (x0 + chev_w - thickness * 1.4, pad_y + chev_h - thickness * 0.8)
        # Simplify: draw two thick lines forming the chevron.
        draw.line(
            [top, mid],
            fill=(255, 255, 255, 255),
            width=thickness,
            joint="curve",
        )
        draw.line(
            [mid, bot],
            fill=(255, 255, 255, 255),
            width=thickness,
            joint="curve",
        )

    x_first = pad_x
    x_second = pad_x + chev_w - thickness * 1.0 + gap
    chevron(x_first)
    chevron(x_second)
    return img


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        img = make_icon(s)
        path = os.path.join(OUT_DIR, f"icon{s}.png")
        img.save(path, "PNG")
        print("wrote", path)


if __name__ == "__main__":
    main()
