"""Generate a tileable transparent "printed then scanned" overlay.

White pixels with alpha = highlights, black pixels with alpha = shadows.
Everything uses wrap-around filtering so the PNG tiles seamlessly.
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
OUT = sys.argv[1] if len(sys.argv) > 1 else "scan-overlay.png"
rng = np.random.default_rng(7)


def noise(sigma, shape=(SIZE, SIZE)):
    n = gaussian_filter(rng.standard_normal(shape), sigma, mode="wrap")
    return n / (n.std() + 1e-9)


# 1. Fine film/toner grain (dominant)
grain = noise(0.55) * 0.9 + noise(1.2) * 0.45

# 2. Paper mottling — soft low-frequency blotches
mottle = noise(6) * 0.35 + noise(24) * 0.3 + noise(70) * 0.2

# # 3. Paper fibres — short directional streaks in a few orientations
# fibres = np.zeros((SIZE, SIZE))
# for sig in [(0.5, 7), (7, 0.5), (0.6, 4), (4, 0.6)]:
#     f = noise(sig)
#     fibres += np.where(np.abs(f) > 2.2, f, 0)  # keep only the strongest streaks
# fibres *= 0.35

# 4. Scanner banding — faint streaks along the scan axis (horizontal)
# row = gaussian_filter(rng.standard_normal(SIZE), 1.5, mode="wrap")
# row += gaussian_filter(rng.standard_normal(SIZE), 25, mode="wrap") * 3
# row /= row.std()
# banding = np.tile(row[:, None], (1, SIZE)) * 0.22

# 5. Dust & specks — sparse dark and light dots
dust = np.zeros((SIZE, SIZE))
n_specks = SIZE * SIZE // 9000
ys, xs = rng.integers(0, SIZE, n_specks), rng.integers(0, SIZE, n_specks)
dust[ys, xs] = rng.choice([-1, 1], n_specks, p=[0.7, 0.3]) * rng.uniform(4, 14, n_specks)
dust = gaussian_filter(dust, 0.8, mode="wrap")

field = grain + mottle+ dust 
#  + fibres + banding 
field /= np.percentile(np.abs(field), 99.5)
field = np.clip(field, -1, 1)

# Map signed field -> RGBA. Shadows slightly stronger than highlights (looks
# more like ink/toner on paper).
MAX_HI, MAX_SH = 0.30, 0.38
alpha = np.where(field > 0, field * MAX_HI, -field * MAX_SH)
# Gentle curve so most pixels stay subtle and only peaks get strong.
alpha = alpha ** 1.15

rgb = np.where(field[..., None] > 0, 255, 0).astype(np.uint8)
rgb = np.repeat(rgb, 3, axis=2) if rgb.shape[2] == 1 else rgb
# Warm tint: highlights slightly cream, shadows slightly brown-black
rgb = np.where(field[..., None] > 0, np.array([255, 250, 240]), np.array([20, 14, 8])).astype(np.uint8)

rgba = np.dstack([rgb, (alpha * 255).round().astype(np.uint8)])
Image.fromarray(rgba, "RGBA").save(OUT, optimize=True)
print("wrote", OUT, rgba.shape)
