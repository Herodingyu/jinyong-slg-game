#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包手机单文件版: 内联css/js, 图片转base64 data URI, 加viewport。
用法: python3 tools/build_singlefile.py  -> 输出到上级目录 金庸群侠大战_手机单文件版.html
"""
import base64, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), '金庸群侠大战_手机单文件版.html')

def data_uri(path):
    ext = path.rsplit('.', 1)[1].lower()
    mime = 'image/png' if ext == 'png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(open(path, 'rb').read()).decode()

def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()

js = read('js/main.js')
js = js.replace("'assets/tiles.png'", f"'{data_uri(os.path.join(ROOT,'assets/tiles.png'))}'")
for k in ['xiaofeng', 'guojing', 'duanyu', 'xiaobao', 'hero', 'liaobing', 'liaojiang', 'duanyq']:
    js = js.replace(f"'assets/units/' + k + '.png'",
                    f"'{data_uri(os.path.join(ROOT, 'assets/units', k + '.png'))}'")

html = read('index.html')
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>' + read('css/style.css') + '</style>')
html = html.replace('<script src="js/data.js"></script>', '<script>' + read('js/data.js') + '</script>')
html = html.replace('<script src="js/engine.js"></script>', '<script>' + read('js/engine.js') + '</script>')
html = html.replace('<script src="js/main.js"></script>', '<script>' + js + '</script>')
if 'viewport' not in html:
    html = html.replace('<meta charset="UTF-8">',
        '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">')

open(OUT, 'w', encoding='utf-8').write(html)
print(f'单文件版已生成: {OUT} ({os.path.getsize(OUT)/1024:.1f} KB)')
