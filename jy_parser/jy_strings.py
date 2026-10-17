#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
金庸群侠传 文本挖掘工具
DOS 版文本多为 BIG5(CP950) 编码，部分改版为 GBK。
策略: 按滑动窗口尝试两种编码，用"可打印中文+标点比例"打分，双编码都通过时输出对照。

用法:
    python3 jy_strings.py <文件或目录> [--min 4] [--top 50]
"""
import os
import re
import sys

PAT = re.compile(rb'[\x20-\x7e\xa1-\xfe][\x20-\x7e\xa1-\xfe\x40-\x7e]*')

# 常见武侠高频字，用于校验解码是否正确
COMMON = set('的一是了我不人在他有上这中大来以个到说们为子和你地出道也时年得就那要下自之会后可着道之其过家学对去之可将多这武侠江湖功力内力')


def score_text(s):
    if not s:
        return 0.0
    # 任何 CJK 字符、可打印 ASCII、中文标点都算"好字符"
    def ok(c):
        if '\u4e00' <= c <= '\u9fff' or '\u3400' <= c <= '\u4dbf':
            return True
        if c.isascii() and c.isprintable():
            return True
        return c in '，。！？、；：（）《》「」『』…—'
    return sum(1 for c in s if ok(c)) / len(s)


def extract(path, min_len=4, top=50):
    with open(path, 'rb') as f:
        data = f.read()
    hits = []
    for m in PAT.finditer(data):
        raw = m.group()
        if len(raw) < min_len * 2:
            continue
        for enc in ('cp950', 'gbk'):
            try:
                s = raw.decode(enc, errors='strict')
            except UnicodeDecodeError:
                continue
            # 必须含至少2个中文字符才算武侠文本
            if sum(1 for c in s if '\u4e00' <= c <= '\u9fff') < 2:
                continue
            sc = score_text(s)
            if sc >= 0.6:
                hits.append((sc, enc, m.start(), s[:60]))
    hits.sort(reverse=True)
    return hits[:top]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    target = sys.argv[1]
    min_len = 4
    if '--min' in sys.argv:
        min_len = int(sys.argv[sys.argv.index('--min') + 1])
    files = []
    if os.path.isdir(target):
        for f in sorted(os.listdir(target)):
            if f.lower().endswith(('.grp', '.dat', '.ka', '.lib', '.exe')):
                files.append(os.path.join(target, f))
    else:
        files.append(target)
    for path in files:
        hits = extract(path, min_len)
        if hits:
            print(f'\n=== {os.path.basename(path)} ({len(hits)} 条) ===')
            for sc, enc, off, s in hits[:20]:
                print(f'  [{enc} @{off:#x} 置信{sc:.2f}] {s}')


if __name__ == '__main__':
    main()
