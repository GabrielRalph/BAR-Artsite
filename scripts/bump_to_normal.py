"""Convert a bump (height) map into a tangent-space normal map.

Brighter pixels are treated as higher, darker as lower. Output uses the
OpenGL / three.js convention (+Y up).

Usage:
    python3 scripts/bump_to_normal.py <bump> <normal_out> [--strength 4] [--blur 0] [--invert] [--no-wrap]
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter


def bump_to_normal(height, strength=4.0, wrap=True):
    p = np.pad(height, 1, mode="wrap" if wrap else "edge")
    # Sobel gradients
    gx = (p[1:-1, 2:] - p[1:-1, :-2]) * 2 + (p[:-2, 2:] - p[:-2, :-2]) + (p[2:, 2:] - p[2:, :-2])
    gy = (p[2:, 1:-1] - p[:-2, 1:-1]) * 2 + (p[2:, :-2] - p[:-2, :-2]) + (p[2:, 2:] - p[:-2, 2:])

    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(gx)
    length = np.sqrt(nx**2 + ny**2 + nz**2)
    rgb = np.stack([nx, ny, nz], -1) / length[..., None] * 0.5 + 0.5
    return (rgb * 255).round().astype(np.uint8)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("bump", help="input bump/height map")
    parser.add_argument("out", help="output normal map path")
    parser.add_argument("--strength", type=float, default=4.0, help="slope multiplier (default 4)")
    parser.add_argument("--blur", type=float, default=0.0, help="gaussian blur radius applied to the bump first")
    parser.add_argument("--invert", action="store_true", help="treat dark as high instead of low")
    parser.add_argument("--no-wrap", action="store_true", help="clamp edges instead of tiling")
    args = parser.parse_args()

    img = Image.open(args.bump).convert("L")
    if args.blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(args.blur))
    height = np.asarray(img).astype(np.float32) / 255.0
    if args.invert:
        height = 1.0 - height

    Image.fromarray(bump_to_normal(height, args.strength, not args.no_wrap)).save(args.out, quality=95)


if __name__ == "__main__":
    main()
