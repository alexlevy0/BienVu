"""Derive UI fonts without changing glyphs or any CSS-declared font weight.

One-time tooling: pip install 'fonttools[woff]==4.60.2'
Run: python scripts/prepare-web-fonts.py
The original fonts remain available to the video editor and other consumers.
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

fonts = Path(__file__).resolve().parent.parent / "apps/web/public/fonts"
for name, maximum in [("newsreader", 700), ("newsreader-italic", 700), ("inter-tight", 900)]:
    font = TTFont(fonts / f"{name}.woff2", recalcTimestamp=False)
    characters = font.getBestCmap()
    instantiateVariableFont(font, {"wght": (400, maximum)}, inplace=True)
    assert font.getBestCmap() == characters
    font.save(fonts / f"{name}-ui.woff2")
