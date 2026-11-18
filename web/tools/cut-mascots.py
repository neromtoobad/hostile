"""Cut the Higgsfield mascot sheets in art/mascots/ into one transparent WebP per stock.

Each sheet is a 3x3 grid on a flat backdrop (see public/mascots/CREDITS.md). Every cell is keyed
against its own backdrop colour, magenta fringe is removed, stray specks are dropped, and the
figure is placed on a square canvas with its feet on the bottom edge so all sprites line up.

Run from web/:  python3 tools/cut-mascots.py
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

WEB = Path(__file__).resolve().parent.parent
RAW = WEB / "art" / "mascots"
OUT = WEB / "public" / "mascots"
SIZE = 360  # output canvas, px

SHEETS = {
    "s1": ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AMD", "AVGO"],
    "s2": ["NFLX", "PLTR", "ORCL", "MSTR", "MU", "SNDK", "INTC", "MRVL", "CRCL"],
    "s3": ["SPCX", "HOOD", "HIMS", "LLY", "MRNA", "TTWO", "BE", "LITE", "AAOI"],
    "s4": ["BRK.B"],  # one figure filling the whole image
}


def key(cell: np.ndarray) -> np.ndarray:
    """RGBA cut of one cell, keyed on the median colour of its border."""
    rgb = cell[..., :3].astype(np.float32)
    ring = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)

    dist = np.linalg.norm(rgb - bg, axis=-1)
    alpha = np.clip((dist - 38) / 50, 0, 1)

    # keep the figure and what it holds: drop small specks, fill holes inside solid parts
    solid = alpha > 0.5
    labels, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, labels, range(1, n + 1))
        keep = np.isin(labels, 1 + np.flatnonzero(sizes >= max(400, sizes.max() * 0.02)))
        near = ndimage.binary_dilation(keep, iterations=3)
        alpha = np.where(near, alpha, 0)

    # un-mix the backdrop from semi-transparent edge pixels
    a = alpha[..., None]
    fg = np.where(a > 0.02, (rgb - (1 - a) * bg) / np.maximum(a, 0.02), rgb)
    fg = np.clip(fg, 0, 255)
    return np.dstack([fg, alpha * 255]).astype(np.uint8)


def place(rgba: np.ndarray) -> Image.Image:
    ys, xs = np.nonzero(rgba[..., 3] > 30)
    crop = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    im = Image.fromarray(crop, "RGBA")
    h, w = crop.shape[:2]
    s = (SIZE - 8) / max(h, w)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, SIZE - im.height - 4), im)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, names in SHEETS.items():
        img = np.asarray(Image.open(RAW / f"{sheet}.png").convert("RGB"))
        grid = 3 if len(names) > 1 else 1
        H, W = img.shape[:2]
        ch, cw = H // grid, W // grid
        for i, name in enumerate(names):
            r, c = divmod(i, grid)
            cell = img[r * ch : (r + 1) * ch, c * cw : (c + 1) * cw]
            place(key(cell)).save(OUT / f"{name}.webp", "WEBP", quality=88, method=6)
            print("cut", name)


if __name__ == "__main__":
    main()
