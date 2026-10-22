#!/usr/bin/env python3
"""Generate Android launcher/splash resources from the official Kuro icon crop."""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
RES=ROOT/"android"/"app"/"src"/"main"/"res"
ICON_PATH=ROOT/"public"/"kuro-icon.webp"
ET.register_namespace("android","http://schemas.android.com/apk/res/android")
if not ICON_PATH.is_file(): raise SystemExit("Official Kuro icon missing: public/kuro-icon.webp")
if not RES.is_dir(): raise SystemExit("Android project missing; run npx cap add android first")
icon=Image.open(ICON_PATH).convert("RGB")
densities={"mdpi":1,"hdpi":1.5,"xhdpi":2,"xxhdpi":3,"xxxhdpi":4}
def save_png(image,destination):
    destination.parent.mkdir(parents=True,exist_ok=True)
    image.save(destination,"PNG",optimize=True)

# Density-aware legacy icons and adaptive icon foregrounds.
for density,scale in densities.items():
    size=round(48*scale)
    square=icon.resize((size,size),Image.Resampling.LANCZOS)
    save_png(square,RES/f"mipmap-{density}"/"ic_launcher.png")
    round_icon=square.convert("RGBA")
    mask=Image.new("L",(size,size),0)
    ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    round_icon.putalpha(mask)
    save_png(round_icon,RES/f"mipmap-{density}"/"ic_launcher_round.png")
    side=round(108*scale); art_side=round(78*scale)
    foreground=Image.new("RGBA",(side,side),(0,0,0,0))
    art=icon.resize((art_side,art_side),Image.Resampling.LANCZOS).convert("RGBA")
    foreground.alpha_composite(art,((side-art_side)//2,(side-art_side)//2))
    save_png(foreground,RES/f"mipmap-{density}"/"ic_launcher_foreground.png")

adaptive=RES/"mipmap-anydpi-v26"; adaptive.mkdir(parents=True,exist_ok=True)
adaptive_xml='''<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/kuro_canvas_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n'''
for name in ("ic_launcher","ic_launcher_round"):
    (adaptive/f"{name}.xml").write_text(adaptive_xml,encoding="utf-8")

values=RES/"values"; values.mkdir(parents=True,exist_ok=True)
colors=values/"colors.xml"
if colors.exists(): root=ET.parse(colors).getroot()
else: root=ET.Element("resources")
bg=next((node for node in root.findall("color") if node.get("name")=="kuro_canvas_background"),None)
if bg is None: bg=ET.SubElement(root,"color",{"name":"kuro_canvas_background"})
bg.text="#05040A"; ET.ElementTree(root).write(colors,encoding="utf-8",xml_declaration=True)

# Compose the Android splash from the exact character crop, wordmark, and neon line.
def splash_image(size,landscape=False):
    w,h=size; canvas=Image.new("RGB",size,(5,4,10)); draw=ImageDraw.Draw(canvas)
    font_path="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    try: font=ImageFont.truetype(font_path,max(22,round(min(w,h)*(.067 if landscape else .055))))
    except OSError: font=ImageFont.load_default()
    if landscape:
        art_side=round(h*.63); art=icon.resize((art_side,art_side),Image.Resampling.LANCZOS)
        canvas.paste(art,(round(w*.08),(h-art_side)//2)); left=round(w*.57); top=round(h*.40)
    else:
        art_side=min(round(w*.72),round(h*.44)); art=icon.resize((art_side,art_side),Image.Resampling.LANCZOS)
        canvas.paste(art,((w-art_side)//2,round(h*.19))); left=0; top=round(h*.70)
    first,second="Kuro","Canvas"; b1=draw.textbbox((0,0),first,font=font); b2=draw.textbbox((0,0),second,font=font)
    gap=max(6,round(font.size*.15)); total=b1[2]-b1[0]+gap+b2[2]-b2[0]
    if not landscape: left=(w-total)//2
    draw.text((left,top),first,font=font,fill=(250,248,255)); x2=left+b1[2]-b1[0]+gap
    mask=Image.new("L",size,0); ImageDraw.Draw(mask).text((x2,top),second,font=font,fill=255)
    gradient=Image.new("RGB",size,(255,53,188)); px=gradient.load(); width=max(1,b2[2]-b2[0])
    for x in range(max(0,x2),min(w,x2+width)):
        t=(x-x2)/max(1,width-1)
        if t<.5:
            u=t*2; color=(round(255*(1-u)+162*u),round(53*(1-u)+61*u),round(188*(1-u)+255*u))
        else:
            u=(t-.5)*2; color=(round(162*(1-u)),round(61*(1-u)+215*u),round(255*(1-u)+243*u))
        for y in range(max(0,top),min(h,top+font.size+10)): px[x,y]=color
    canvas.paste(gradient,(0,0),mask)
    bar_w=round(w*(.16 if landscape else .28)); bar_h=max(5,round(min(w,h)*.009))
    bx=left if landscape else (w-bar_w)//2; by=min(h-bar_h-round(h*.12),top+font.size+round(font.size*.7))
    bar=Image.new("RGB",(bar_w,bar_h),(255,53,188)); bp=bar.load()
    for x in range(bar_w):
        t=x/max(1,bar_w-1)
        if t<.5:
            u=t*2; color=(round(255*(1-u)+162*u),round(53*(1-u)+61*u),round(188*(1-u)+255*u))
        else:
            u=(t-.5)*2; color=(round(162*(1-u)),round(61*(1-u)+215*u),round(255*(1-u)+243*u))
        for y in range(bar_h): bp[x,y]=color
    bm=Image.new("L",bar.size,0); ImageDraw.Draw(bm).rounded_rectangle((0,0,bar_w-1,bar_h-1),radius=bar_h//2,fill=255)
    canvas.paste(bar,(max(0,min(w-bar_w,bx)),max(0,min(h-bar_h,by))),bm)
    return canvas

nodpi=RES/"drawable-nodpi"; nodpi.mkdir(parents=True,exist_ok=True)
splash_image((1080,1920)).save(nodpi/"kuro_canvas_splash.png","PNG",optimize=True)
for directory in RES.glob("drawable*"):
    target=directory/"splash.png"
    if target.exists():
        try:
            with Image.open(target) as previous: size=previous.size
        except OSError: size=(1080,1920)
        splash_image(size,size[0]>size[1]).save(target,"PNG",optimize=True)

print("Prepared official Kuro launcher icons for all densities, adaptive icon resources, and native portrait/landscape splash artwork.")
