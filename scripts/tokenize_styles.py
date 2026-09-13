"""One-shot codemod: replace hard-coded style values with --sg-* tokens.

Scope: <style> blocks + template style="..." attributes of src/**/*.vue.
Only values inside matched declarations are rewritten; formatting is preserved.
"""
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'src'))

# hex -> token, property-agnostic
HEX_MAP = {
    '#409eff': '--sg-color-primary',
    '#79bbff': '--sg-color-primary-light-3',
    '#66b1ff': '--sg-color-primary-light-3',
    '#a0cfff': '--sg-color-primary-light-5',
    '#c6e2ff': '--sg-color-primary-light-7',
    '#b3d8ff': '--sg-color-primary-light-7',
    '#d9ecff': '--sg-color-primary-light-8',
    '#ecf5ff': '--sg-color-primary-light-9',
    '#337ecc': '--sg-color-primary-dark-2',
    '#67c23a': '--sg-color-success',
    '#95d475': '--sg-color-success-light-3',
    '#e1f3d8': '--sg-color-success-light-8',
    '#f0f9eb': '--sg-color-success-light-9',
    '#e6a23c': '--sg-color-warning',
    '#eebe77': '--sg-color-warning-light-3',
    '#faecd8': '--sg-color-warning-light-8',
    '#fdf6ec': '--sg-color-warning-light-9',
    '#f56c6c': '--sg-color-danger',
    '#f89898': '--sg-color-danger-light-3',
    '#f78989': '--sg-color-danger-light-3',
    '#fde2e2': '--sg-color-danger-light-8',
    '#fef0f0': '--sg-color-danger-light-9',
    '#fdf6f6': '--sg-color-danger-light-9',
    '#e9e9eb': '--sg-color-info-light-8',
    '#f4f4f5': '--sg-color-info-light-9',
    '#303133': '--sg-text-color-primary',
    '#606266': '--sg-text-color-regular',
    '#909399': 'AMBIG_INFO_TEXT',  # color -> text-secondary, else info
    '#c0c4cc': '--sg-text-color-placeholder',
    '#a8abb2': '--sg-text-color-placeholder',
    '#999': '--sg-text-color-secondary',
    '#dcdfe6': '--sg-border-color',
    '#e4e7ed': '--sg-border-color-light',
    '#ebeef5': '--sg-border-color-lighter',
    '#f0f0f0': '--sg-border-color-extra-light',
    '#e2e8f0': '--sg-border-color-light',
    '#f0f2f5': '--sg-fill-color',
    '#f2f3f5': '--sg-fill-color',
    '#f5f7fa': '--sg-fill-color-light',
    '#fafafa': '--sg-fill-color-lighter',
    '#f0f7ff': '--sg-color-primary-light-9',
    '#f0f9ff': '--sg-color-primary-light-9',
    '#bae6fd': '--sg-color-primary-light-7',
    '#0ea5e9': '--sg-color-primary',
    '#ef4444': '--sg-color-danger',
    '#22c55e': '--sg-color-success',
    '#3b82f6': '--sg-color-primary',
    '#eab308': '--sg-color-warning',
    '#6b7280': '--sg-text-color-secondary',
    '#f8fafc': '--sg-bg-color-page',
    '#1e293b': '--sg-text-color-primary',
}

FONT_SIZE_MAP = {
    '10px': '--sg-font-size-xs',
    '11px': '--sg-font-size-sm',
    '12px': '--sg-font-size-base',
    '13px': '--sg-font-size-md',
    '14px': '--sg-font-size-lg',
    '15px': '--sg-font-size-lg',  # normalize to 14px
    '16px': '--sg-font-size-xl',
    '20px': '--sg-font-size-2xl',
    '32px': '--sg-font-size-3xl',
}

SPACING_MAP = {
    2: '--sg-spacing-1',
    3: '--sg-spacing-2',   # normalize to 4px
    4: '--sg-spacing-2',
    5: '--sg-spacing-2',   # normalize to 4px
    6: '--sg-spacing-3',
    8: '--sg-spacing-4',
    10: '--sg-spacing-5',
    12: '--sg-spacing-6',
    14: '--sg-spacing-7',
    16: '--sg-spacing-8',
    18: '--sg-spacing-10',  # normalize to 20px
    20: '--sg-spacing-10',
    24: '--sg-spacing-12',
    32: '--sg-spacing-16',
    40: '--sg-spacing-20',
    48: '--sg-spacing-24',
}

RADIUS_MAP = {
    2: '--sg-radius-xs',
    3: '--sg-radius-sm',
    4: '--sg-radius-md',
    5: '--sg-radius-md',   # normalize to 4px
    6: '--sg-radius-lg',
    7: '--sg-radius-xl',   # normalize to 8px
    8: '--sg-radius-xl',
    9: '--sg-radius-xl',   # normalize to 8px
}

ZINDEX_MAP = {
    1: '--sg-z-index-base',
    2: '--sg-z-index-raised',
    10: '--sg-z-index-sticky',
    100: '--sg-z-index-overlay',
    1000: '--sg-z-index-topmost',
}

# keys are whitespace-stripped value forms
SHADOW_MAP = {
    '01px2pxrgba(0,0,0,0.15)': '--sg-shadow-sm',
    '02px3pxrgba(0,0,0,0.1)': '--sg-shadow-sm',
    '02px8pxrgba(0,0,0,0.15)': '--sg-shadow-md',
    '02px12pxrgba(0,0,0,0.1)': '--sg-shadow-lg',
    '04px12pxrgba(0,0,0,0.1)': '--sg-shadow-lg',
    '04px16pxrgba(0,0,0,0.08)': '--sg-shadow-xl',
    '06px24pxrgba(0,0,0,0.12)': '--sg-shadow-xl',
    '0002pxrgba(64,158,255,0.18)': '--sg-shadow-focus',
    '0002pxrgba(64,158,255,0.2)': '--sg-shadow-focus',
    '0002pxrgba(64,158,255,0.4)': '--sg-shadow-focus-strong',
}

DURATION_MAP = {
    '0.15s': 'var(--sg-duration-fast)',
    '0.2s': 'var(--sg-duration-normal)',
    '0.25s': 'var(--sg-duration-normal)',
}

stats = {}


def bump(file, kind, n=1):
    stats.setdefault(file, {}).setdefault(kind, 0)
    stats[file][kind] += n


def transform_declaration(prop, value, file):
    """Return tokenized value for one CSS declaration (formatting untouched)."""
    orig = value

    # 1. box-shadow: whole-value map
    if prop == 'box-shadow':
        key = re.sub(r'\s+', '', value)
        token = SHADOW_MAP.get(key)
        if token:
            bump(file, 'shadow')
            return f'var({token})'

    # 2. hex colors (whitelist; property-aware for #fff / #909399)
    def hex_repl(m):
        hexv = m.group(0).lower()
        if hexv in ('#fff', '#ffffff'):
            token = '--sg-color-white' if prop == 'color' else '--sg-bg-color'
        else:
            token = HEX_MAP.get(hexv)
            if token is None:
                return m.group(0)
            if token == 'AMBIG_INFO_TEXT':
                token = '--sg-text-color-secondary' if prop == 'color' else '--sg-color-info'
        bump(file, 'hex')
        return f'var({token})'

    value = re.sub(r'#[0-9a-fA-F]{3,8}\b', hex_repl, value)

    # white alpha overlay -> color-mix
    value = re.sub(r'rgba\(255,\s*255,\s*255,\s*0?\.25\)',
                   'color-mix(in srgb, var(--sg-color-white) 25%, transparent)', value)

    # 3. font-size
    if prop == 'font-size':
        v = value.strip()
        if v in FONT_SIZE_MAP:
            bump(file, 'font-size')
            return f'var({FONT_SIZE_MAP[v]})'

    # 4. spacing: padding/margin/gap families, per component
    if re.match(r'^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?$', prop):
        def comp_repl(m):
            n = int(m.group(1))
            if n in SPACING_MAP:
                bump(file, 'spacing')
                return f'var({SPACING_MAP[n]})'
            return m.group(0)
        value = re.sub(r'(?<![\w.-])(\d+)px', comp_repl, value)

    # 5. border-radius
    if 'radius' in prop:
        def comp_repl(m):
            tok = m.group(1)
            if tok == '50%':
                bump(file, 'radius')
                return 'var(--sg-radius-circle)'
            if tok == '9999px':
                bump(file, 'radius')
                return 'var(--sg-radius-round)'
            n = int(tok[:-2])
            if n in RADIUS_MAP:
                bump(file, 'radius')
                return f'var({RADIUS_MAP[n]})'
            return m.group(0)
        value = re.sub(r'\b(50%|9999px|\d+px)(?![\w.-])', comp_repl, value)

    # 6. z-index
    if prop == 'z-index':
        v = value.strip()
        if v.isdigit() and int(v) in ZINDEX_MAP:
            bump(file, 'z-index')
            return f'var({ZINDEX_MAP[int(v)]})'

    # 7. transition durations
    if prop.startswith('transition'):
        def dur_repl(m):
            if m.group(0) in DURATION_MAP:
                bump(file, 'duration')
                return DURATION_MAP[m.group(0)]
            return m.group(0)
        value = re.sub(r'\b\d*\.?\d+s\b', dur_repl, value)

    if value != orig:
        bump(file, 'total')
    return value


DECL_RE = re.compile(r'([-a-zA-Z][-a-zA-Z0-9]*)(\s*:\s*)([^;{}]+)([;}]|$)')


def transform_css(css, file):
    def decl_repl(m):
        prop = m.group(1).lower()
        new_value = transform_declaration(prop, m.group(3), file)
        if new_value == m.group(3):
            return m.group(0)
        return f'{m.group(1)}{m.group(2)}{new_value}{m.group(4)}'
    return DECL_RE.sub(decl_repl, css)


STYLE_BLOCK_RE = re.compile(r'(<style[^>]*>)(.*?)(</style>)', re.S)


def process(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()

    changed = False
    pieces, last = [], 0

    for m in STYLE_BLOCK_RE.finditer(text):
        pieces.append(('plain', text[last:m.start()]))
        new_css = transform_css(m.group(2), path)
        if new_css != m.group(2):
            changed = True
        pieces.append(('style', m.group(1) + new_css + m.group(3)))
        last = m.end()
    pieces.append(('plain', text[last:]))

    out = []
    for kind, seg in pieces:
        if kind == 'style':
            out.append(seg)
            continue

        def style_attr_repl(m):
            nonlocal changed
            inner = m.group(1)
            new_inner = transform_css(inner, path)
            if new_inner != inner:
                changed = True
            return f'style="{new_inner}"'
        out.append(re.sub(r'style="([^"]*)"', style_attr_repl, seg))

    new_text = ''.join(out)
    if changed:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(new_text)
    return changed


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for dirpath, _, files in os.walk(ROOT):
        for name in files:
            if not name.endswith('.vue'):
                continue
            p = os.path.join(dirpath, name)
            if only and only not in p.replace('\\', '/'):
                continue
            process(p)
    grand = 0
    for f in sorted(stats):
        kinds = stats[f]
        total = kinds.get('total', 0)
        grand += total
        detail = ', '.join(f'{k}={v}' for k, v in sorted(kinds.items()) if k != 'total')
        print(f'{os.path.relpath(f, ROOT)}: {detail} (total={total})')
    print(f'\nTOTAL declarations rewritten: {grand}')


if __name__ == '__main__':
    main()
