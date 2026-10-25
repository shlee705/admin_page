"""Generate an original square-outline Hangul WOFF using only the standard library.

No third-party font is copied. Every mapped codepoint deliberately shares glyph 1.
Run from any directory; the output is deterministic.
"""
from pathlib import Path
import struct
import zlib


def pack(fmt, *values):
    return struct.pack('>' + fmt, *values)


def padded(data):
    return data + b'\0' * (-len(data) % 4)


def checksum(data):
    data = padded(data)
    return sum(struct.unpack('>' + 'I' * (len(data) // 4), data)) & 0xFFFFFFFF


def generate():
    points = [(100, 0), (100, 700), (600, 700), (600, 0),
              (180, 80), (520, 80), (520, 620), (180, 620)]
    glyph = pack('hhhhhHHH', 2, 100, 0, 600, 700, 3, 7, 0) + bytes([1] * 8)
    for axis in [0, 1]:
        previous = 0
        for point in points:
            glyph += pack('h', point[axis] - previous)
            previous = point[axis]
    glyph = padded(glyph)
    ranges = [(0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F),
              (0xAC00, 0xD7AF), (0xD7B0, 0xD7FF)]
    codes = [cp for first, last in ranges for cp in range(first, last + 1)]
    groups = b''.join(pack('III', cp, cp, 1) for cp in codes)
    cmap = pack('HHHHI', 0, 1, 3, 10, 12) + pack('HHIII', 12, 0, 16 + len(groups), 0, len(codes)) + groups
    names = [(1, 'Workspace Sans'), (2, 'Regular'), (4, 'Workspace Sans Regular'), (6, 'WorkspaceSans-Regular')]
    records, strings = b'', b''
    for name_id, text in names:
        encoded = text.encode('utf-16-be')
        records += pack('HHHHHH', 3, 1, 0x409, name_id, len(encoded), len(strings))
        strings += encoded
    tables = {
        'OS/2': (pack('HhHHH', 0, 700, 400, 5, 0)
                 + pack('h' * 11, 650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0)
                 + bytes(10) + pack('IIII', 0, 0, 0, 0) + b'NONE'
                 + pack('HHHhhhHH', 0x40, 0x1100, 0xD7FF, 800, -200, 0, 800, 200)),
        'cmap': cmap,
        'glyf': glyph,
        'head': pack('IIIIHHQQhhhhHHhhh', 0x10000, 0x10000, 0, 0x5F0F3CF5, 3, 1000, 0, 0, 100, 0, 600, 700, 0, 8, 2, 1, 0),
        'hhea': pack('IhhhHhhhhhhhhhhhH', 0x10000, 800, -200, 0, 700, 100, 100, 600, 1, 0, 0, 0, 0, 0, 0, 0, 2),
        'hmtx': pack('HhHh', 700, 0, 700, 100),
        'loca': pack('III', 0, 0, len(glyph)),
        'maxp': pack('I' + 'H' * 14, 0x10000, 2, 8, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
        'name': pack('HHH', 0, len(names), 6 + 12 * len(names)) + records + strings,
        'post': pack('IIhhIIIII', 0x30000, 0, -100, 50, 0, 0, 0, 0, 0),
    }
    tags = sorted(tables)
    count = len(tags)
    power = 2 ** (count.bit_length() - 1)
    sfnt = pack('IHHHH', 0x10000, count, power * 16, power.bit_length() - 1, count * 16 - power * 16)
    offset = 12 + count * 16
    for tag in tags:
        data = tables[tag]
        sfnt += tag.encode('ascii') + pack('III', checksum(data), offset, len(data))
        offset += len(padded(data))
    sfnt += b''.join(padded(tables[tag]) for tag in tags)
    adjust = (0xB1B0AFBA - checksum(sfnt)) & 0xFFFFFFFF
    head = tables['head']
    tables['head'] = head[:8] + pack('I', adjust) + head[12:]
    directory, body = b'', b''
    offset = 44 + count * 20
    for tag in tags:
        data = tables[tag]
        compressed = zlib.compress(data, 9)
        payload = compressed if len(compressed) < len(data) else data
        # The head checksum uses zero for checkSumAdjustment per the font format.
        original = head if tag == 'head' else data
        directory += tag.encode('ascii') + pack('IIII', offset, len(payload), len(data), checksum(original))
        body += padded(payload)
        offset += len(padded(payload))
    return pack('IIIHHIHHIIIII', 0x774F4646, 0x10000, offset, count, 0, len(sfnt), 1, 0, 0, 0, 0, 0, 0) + directory + body


if __name__ == '__main__':
    target = Path(__file__).resolve().parents[1] / 'src/assets/fonts/workspace-sans.woff'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(generate())
    print(target)
