#!/usr/bin/env python3
"""Generate native Android launcher assets from Kuro's official public artwork.

The source artwork remains the source of truth. This script only resizes/crops it
for Android's launcher density buckets and adaptive-icon safe area.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ICON_PATH = ROOT / "public" / "kuro-icon.webp"
SPLASH_PATH = ROOT / "public" / "kuro-splash.webp"
ANDROID = "http://schemas.android.com/apk/res/android"
ET.register_namespace("android", ANDROID)

if not ICON_PATH.is_file() or not SPLASH_PATH.is_file():
    raise SystemExit("Official Kuro assets missing: expected public/kuro-icon.webp and public/kuro-splash.webp")
if not RES.is_dir():
    raise SystemExit("Native Android project is missing; run npx cap add android first")

icon = Image.open(ICON_PATH).convert("RGB")
splash = Image.open(SPLASH_PATH).convert("RGB")
densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

def save_png(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG", optimize=True)

# Legacy launcher assets plus their round-icon variant.
for density, scale in densities.items():
    size = round(48 * scale)
    square = icon.resize((size, size), Image.Resampling.LANCZOS)
    save_png(square, RES / f"mipmap-{density}" / "ic_launcher.png")
    round_icon = square.convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_icon.putalpha(mask)
    save_png(round_icon, RES / f"mipmap-{density}" / "ic_launcher_round.png")

    # Adaptive icons use a transparent foreground and reserve a safe margin so
    # Android's circular/squircle masks don't cut off Kuro's face or the cat.
    canvas_size = round(108 * scale)
    artwork_size = round(78 * scale)
    foreground = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    artwork = icon.resize((artwork_size, artwork_size), Image.Resampling.LANCZOS).convert("RGBA")
    offset = (canvas_size - artwork_size) // 2
    foreground.alpha_composite(artwork, (offset, offset))
    save_png(foreground, RES / f"mipmap-{density}" / "ic_launcher_foreground.png")

# Android 8+ adaptive icon definitions.
adaptive_dir = RES / "mipmap-anydpi-v26"
adaptive_dir.mkdir(parents=True, exist_ok=True)
for name in ("ic_launcher", "ic_launcher_round"):
    xml = f'''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/kuro_canvas_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''
    (adaptive_dir / f"{name}.xml").write_text(xml, encoding="utf-8")

# The native/system splash stays dark and uses the matching launcher mark.
values_dir = RES / "values"
values_dir.mkdir(parents=True, exist_ok=True)
colors_path = values_dir / "colors.xml"
if colors_path.exists():
    tree = ET.parse(colors_path)
    colors_root = tree.getroot()
else:
    colors_root = ET.Element("resources")
background = next((node for node in colors_root.findall("color") if node.get("name") == "kuro_canvas_background"), None)
if background is None:
    background = ET.SubElement(colors_root, "color", {"name": "kuro_canvas_background"})
background.text = "#05040A"
ET.ElementTree(colors_root).write(colors_path, encoding="utf-8", xml_declaration=True)

# Preserve the entire user-supplied splash reference in native resources for
# projects/themes that elect to use a full-art drawable rather than only an icon.
nodpi = RES / "drawable-nodpi"
nodpi.mkdir(parents=True, exist_ok=True)
splash.save(nodpi / "kuro_canvas_splash.png", format="PNG", optimize=True)

print("Prepared Kuro Canvas launcher icons (all densities), adaptive icons, native background color, and full splash artwork.")
