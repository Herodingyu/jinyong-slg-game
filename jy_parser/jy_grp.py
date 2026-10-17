#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
金庸群侠传(DOS, 1996 智冠/河洛) 资源解析器
格式来源: 社区公开研究 (idx/grp 图片包 + Mmap.col 调色板)

文件结构
--------
调色板 Mmap.col:
    256 * 3 byte (r,g,b)，每个值需 *4 (即 VGA 6bit 色)，按索引顺序存放。

索引 xxx.idx:
    连续 int32 (小端)，每个值 = 一张图片在 xxx.grp 中的 endoffset；
    上一张的 endoffset 即本张 startoffset。

图片数据 xxx.grp:
    每张图:
        int16 w, int16 h, int16 x, int16 y   (x/y 为偏移标记，渲染可忽略)
        共 h 行，每行:
            int8  该行字节数 count
            然后按 count 消耗字节:
                int8 t   透明像素数 (跳过)
                int8 nt  非透明像素数，随后 nt 个字节为调色板索引

用法
----
    python3 jy_grp.py <游戏目录> <输出目录>
    python3 jy_grp.py /path/to/game ./out          # 解全部 grp
    python3 jy_grp.py /path/to/game ./out --only Hdgrp

自测
----
    python3 jy_grp.py --selftest                   # 生成合成样本并验证
"""
import os
import struct
import sys


def load_palette(path):
    """读取 Mmap.col -> [(r,g,b), ...] 256 色"""
    with open(path, 'rb') as f:
        raw = f.read()
    if len(raw) < 256 * 3:
        raise ValueError(f"调色板文件过小: {path} ({len(raw)} bytes)")
    pal = []
    for i in range(256):
        r, g, b = raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]
        pal.append((min(r * 4, 255), min(g * 4, 255), min(b * 4, 255)))
    return pal


def read_idx(path):
    """读取 idx -> [endoffset, ...]"""
    with open(path, 'rb') as f:
        raw = f.read()
    n = len(raw) // 4
    return list(struct.unpack(f'<{n}i', raw[:n * 4]))


def decode_image(data, offset, pal):
    """从 data 的 offset 处解码一张图 -> (w, h, rgb_bytes) 或 None"""
    if offset + 8 > len(data):
        return None
    w, h, x, y = struct.unpack_from('<4h', data, offset)
    if w <= 0 or h <= 0 or w > 1024 or h > 1024:
        return None
    pos = offset + 8
    pixels = bytearray(w * h * 3)
    for row in range(h):
        if pos >= len(data):
            return None
        count = data[pos]; pos += 1
        col = 0
        consumed = 0
        while consumed < count and pos + 1 < len(data):
            t = data[pos]; pos += 1; consumed += 1
            col += t
            if pos >= len(data):
                return None
            nt = data[pos]; pos += 1; consumed += 1
            for _ in range(nt):
                if pos >= len(data) or col >= w:
                    return None
                idx = data[pos]; pos += 1; consumed += 1
                r, g, b = pal[idx]
                p = (row * w + col) * 3
                pixels[p], pixels[p + 1], pixels[p + 2] = r, g, b
                col += 1
    return w, h, bytes(pixels)


def write_ppm(path, w, h, rgb):
    """写 PPM（无依赖，任何工具可转 PNG）；装了 Pillow 时自动转 PNG"""
    try:
        from PIL import Image
        img = Image.frombytes('RGB', (w, h), rgb)
        img.save(path.rsplit('.', 1)[0] + '.png')
        os.remove(path) if os.path.exists(path) else None
        return path.rsplit('.', 1)[0] + '.png'
    except ImportError:
        with open(path, 'wb') as f:
            f.write(f'P6\n{w} {h}\n255\n'.encode())
            f.write(rgb)
        return path


def extract_set(basepath, outdir, pal):
    """解一对 idx/grp"""
    name = os.path.basename(basepath)
    idx_path, grp_path = basepath + '.idx', basepath + '.grp'
    if not (os.path.exists(idx_path) and os.path.exists(grp_path)):
        return 0
    ends = read_idx(idx_path)
    with open(grp_path, 'rb') as f:
        data = f.read()
    os.makedirs(outdir, exist_ok=True)
    start = 0
    ok = 0
    for i, end in enumerate(ends):
        if end <= start or end > len(data):
            start = end
            continue
        img = decode_image(data, start, pal)
        start = end
        if img is None:
            continue
        w, h, rgb = img
        out = os.path.join(outdir, f'{name}_{i:04d}.ppm')
        write_ppm(out, w, h, rgb)
        ok += 1
    return ok


def scan_game_dir(game_dir):
    """扫描游戏目录，返回资源清单"""
    report = {'idx_grp_pairs': [], 'palette': None, 'saves': [], 'exe': [], 'other': []}
    for f in sorted(os.listdir(game_dir)):
        p = os.path.join(game_dir, f)
        if not os.path.isfile(p):
            continue
        fl = f.lower()
        if fl.endswith('.col'):
            report['palette'] = p
        elif fl.endswith('.idx'):
            if os.path.exists(p[:-4] + '.grp'):
                report['idx_grp_pairs'].append(p[:-4])
        elif fl in ('r1.grp', 'r2.grp', 'r3.grp'):
            report['saves'].append(p)
        elif fl.endswith('.exe') or fl.endswith('.com'):
            report['exe'].append(p)
        elif fl.endswith(('.ka', '.dat', '.lib', '.pak', '.mid', '.snd')):
            report['other'].append(p)
    return report


def main():
    if '--selftest' in sys.argv:
        selftest()
        return
    if len(sys.argv) < 3:
        print(__doc__)
        return
    game_dir, out_root = sys.argv[1], sys.argv[2]
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1].lower()

    rep = scan_game_dir(game_dir)
    print(f"扫描: {game_dir}")
    print(f"  调色板: {rep['palette'] or '未找到 (尝试任意 .col)'}")
    print(f"  图片包: {len(rep['idx_grp_pairs'])} 组")
    print(f"  存档: {rep['saves']}")
    print(f"  可执行: {[os.path.basename(x) for x in rep['exe']]}")

    # 找调色板
    pal_path = rep['palette']
    if pal_path is None:
        cols = [f for f in os.listdir(game_dir) if f.lower().endswith('.col')]
        if cols:
            pal_path = os.path.join(game_dir, cols[0])
    if pal_path is None:
        sys.exit('找不到 .col 调色板文件')
    pal = load_palette(pal_path)

    total = 0
    for base in rep['idx_grp_pairs']:
        if only and only not in os.path.basename(base).lower():
            continue
        n = extract_set(base, os.path.join(out_root, os.path.basename(base)), pal)
        total += n
        print(f"  {os.path.basename(base)}: {n} 张图")
    print(f"完成，共 {total} 张图 -> {out_root}")


def selftest():
    """生成合成样本验证编解码闭环"""
    import tempfile
    tmp = tempfile.mkdtemp()
    # 造 4 色调色板文件
    cols = [(0, 0, 0), (63, 0, 0), (0, 63, 0), (0, 0, 63)]
    with open(os.path.join(tmp, 'T.col'), 'wb') as f:
        for i in range(256):
            r, g, b = cols[i % 4]
            f.write(bytes((r, g, b)))
    # 造一张 4x2 图: 第0行 [透明2, 红2, 透明0], 第1行 [蓝4]
    body = struct.pack('<4h', 4, 2, 0, 0)
    # 第0行: 透明2, 然后红2     -> count = 1(t)+1(nt)+2(像素) = 4
    row0 = bytes([4, 2, 2, 1, 1])
    # 第1行: 透明0, 蓝4         -> count = 1(t)+1(nt)+4(像素) = 6
    row1 = bytes([6, 0, 4, 3, 3, 3, 3])
    body += row0 + row1
    with open(os.path.join(tmp, 'T.grp'), 'wb') as f:
        f.write(body)
    with open(os.path.join(tmp, 'T.idx'), 'wb') as f:
        f.write(struct.pack('<i', len(body)))
    pal = load_palette(os.path.join(tmp, 'T.col'))
    n = extract_set(os.path.join(tmp, 'T'), os.path.join(tmp, 'out'), pal)
    assert n == 1, f'应解出1张, 实际{n}'
    out = os.path.join(tmp, 'out', 'T_0000.png')
    if not os.path.exists(out):
        out = out[:-4] + '.ppm'
    with open(out, 'rb') as f:
        head = f.read(32)
    assert b'PNG' in head[:8] or head.startswith(b'P6'), '输出格式异常'
    print(f'自测通过: 合成样本解出 {n} 张图 -> {out}')
    print('校验像素: (0,0)应为透明黑, (2,0)应为红, (0,1)应为蓝')
    from PIL import Image
    im = Image.open(out).convert('RGB')
    print('  (0,0)=', im.getpixel((0, 0)), ' (2,0)=', im.getpixel((2, 0)), ' (0,1)=', im.getpixel((0, 1)))


if __name__ == '__main__':
    main()
