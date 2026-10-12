import subprocess, os, sys
DEFS='''<defs>
<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0A0E1A"/><stop offset="100%" stop-color="#001A4D"/></linearGradient>
<linearGradient id="bl" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2E86FF"/><stop offset="100%" stop-color="#0A4FE0"/></linearGradient>
<linearGradient id="gr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00FF66"/><stop offset="100%" stop-color="#00CC44"/></linearGradient>
</defs>'''
GLYPH='''<path d="M32 32L48 18L62 18L62 72L48 72L48 35L35 44Z" fill="url(#bl)"/>
<path d="M52 28L78 54L72 58L48 34Z" fill="url(#gr)" opacity=".9"/>
<path d="M44 42L70 68L64 72L40 48Z" fill="url(#gr)" opacity=".7"/>
<path d="M36 56L62 82L56 86L30 62Z" fill="url(#gr)" opacity=".5"/>'''
def svg(rounded=True, scale=1.0):
    bgr = '<rect width="100" height="100" rx="22" fill="url(#bg)"/>' if rounded else '<rect width="100" height="100" fill="url(#bg)"/>'
    g = GLYPH if scale==1 else f'<g transform="translate(50 50) scale({scale}) translate(-50 -50)">{GLYPH}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{DEFS}{bgr}{g}</svg>'
def glyph_only():
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="28 16 52 72">{DEFS}{GLYPH}</svg>'
out=sys.argv[1]
open(f'{out}/logo.svg','w').write(svg())
open(f'{out}/mark.svg','w').write(glyph_only())
jobs=[('icon-192.png',192,svg()),('icon-512.png',512,svg()),('favicon-32.png',32,svg()),
      ('apple-touch-icon.png',180,svg(False)),('maskable-512.png',512,svg(False,0.8))]
for name,size,s in jobs:
    open('tmp.svg','w').write(s)
    open('tmp.html','w').write(f'<html><body style="margin:0;background:transparent"><img src="tmp.svg" style="display:block;width:{size}px;height:{size}px"></body></html>')
    subprocess.run(['/opt/pw-browsers/chromium','--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars',
      '--default-background-color=00000000',f'--window-size={max(size,400)},{size+300}',f'--screenshot={out}/{name}','file://'+os.path.abspath('tmp.html')],stderr=subprocess.DEVNULL,check=True)

from PIL import Image
for name,size,_ in jobs:
    p=f'{out}/{name}'; Image.open(p).crop((0,0,size,size)).save(p)
