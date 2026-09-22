# -*- coding: utf-8 -*-
"""Generate Schemagine favicon.svg — flat-vector rebuild of the AI-rendered icon.

Interlocked slabs (like the source render): lower slabs slightly flatter
(perspective, Hp 89/79/73.5) with the same width, so wing notches stay small
and are merged by light side-tone fillers. Front rhythm (center column), per
the user's 9-layer model:
    1 white face -> 2 underside = thickness h = 31
    2->3 = h/2 air, 3 shadow band, 3->4 = h/2 air -> next white face.
"""
import math

S = 512.0

TILE_RX = 92.0
Wp = 181.0                          # plate half-width (362px wide, 2:1-ish iso)
HPS = (89.0, 79.0, 73.5)            # half-height per slab: top / middle / bottom
THICK = 31.0                        # h: slab thickness (face -> underside)
CUT = 37.0                          # plate corner cut along edge
BAND_W = 15.5                       # shadow band width (~h/2)
SHADOW_H = 17.0                     # cast shadow band height

CX = S / 2
CY = (150.0, 222.0, 289.5)          # face centers: top / middle / bottom

# holes (plane fractions of plate half-side)
H_C, H_S = 0.345, 0.225
HOLE_CUT_F = 0.17

# palette (sampled from source)
TILE = "#8B5BCB"
HOLE_FILL = "#8455C5"
FACE = "#FFFFFF"
SIDE_TOP = "#EBE1F6"
SIDE_BOT = "#D7C8ED"
BAND_SHADOW = "#A287D2"    # soft cast shadow landing on the lower face
SHADOW_NOTCH = "#6F42B5"   # wing-notch filler (on tile)
SHADOW_GROUND = "#3A1B70"


def rp(cx, cy, w, h, cut):
    """Rounded rhombus path: vertices T,R,B,L, corners cut by `cut` along edges."""
    T = (cx, cy - h); R = (cx + w, cy); B = (cx, cy + h); L = (cx - w, cy)
    verts = [T, R, B, L]

    def along(a, b, d):
        ln = math.hypot(b[0] - a[0], b[1] - a[1])
        return (a[0] + (b[0] - a[0]) * d / ln, a[1] + (b[1] - a[1]) * d / ln)

    entries = [along(V, verts[(i - 1) % 4], cut) for i, V in enumerate(verts)]
    exits = [along(V, verts[(i + 1) % 4], cut) for i, V in enumerate(verts)]
    parts = ["M %.2f %.2f" % exits[0]]
    for i in (1, 2, 3, 0):
        V = verts[i]
        parts.append("L %.2f %.2f" % entries[i])
        parts.append("Q %.2f %.2f %.2f %.2f" % (V[0], V[1], exits[i][0], exits[i][1]))
    parts.append("Z")
    return " ".join(parts)


def plate(cx, cy, hp=HPS[0]):
    return rp(cx, cy, Wp, hp, CUT)


def holes(cx, cy):
    """4 hole paths: plane 2x2 grid -> N/E/S/W diamonds in iso view."""
    hw = H_S * Wp
    hh = H_S * HPS[0]
    cut = HOLE_CUT_F * hw
    offs = [(0, -H_C * HPS[0]), (H_C * Wp, 0), (0, H_C * HPS[0]), (-H_C * Wp, 0)]
    return [rp(cx + dx, cy + dy, hw, hh, cut) for dx, dy in offs]


def blur_filter(fid, dev):
    return (f'<filter id="{fid}" x="-60%" y="-60%" width="220%" height="220%">'
            f'<feGaussianBlur stdDeviation="{dev}"/></filter>')


def build():
    f = []
    f.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
             'width="512" height="512">')
    f.append('<defs>'
             + blur_filter("bBand", 3) + blur_filter("bNotch", 6)
             + blur_filter("bGround", 8) + blur_filter("bGround2", 20)
             + f'<linearGradient id="gSide" x1="0" y1="0" x2="0" y2="1">'
               f'<stop offset="0" stop-color="{SIDE_TOP}"/>'
               f'<stop offset="1" stop-color="{SIDE_BOT}"/></linearGradient>'
             + f'<linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1">'
               f'<stop offset="0" stop-color="{BAND_SHADOW}" stop-opacity="0.2"/>'
               f'<stop offset="0.5" stop-color="{BAND_SHADOW}" stop-opacity="0.72"/>'
               f'<stop offset="1" stop-color="{BAND_SHADOW}" stop-opacity="0.12"/></linearGradient>'
             + '</defs>')
    # tile
    f.append(f'<rect width="512" height="512" rx="{TILE_RX}" fill="{TILE}"/>')
    # ground shadow: tight dark band + wide soft spread
    gs = rp(CX, CY[2] + THICK + 8, Wp * 0.98, HPS[2] * 0.98, CUT)
    f.append(f'<path d="{gs}" fill="{SHADOW_GROUND}" opacity="0.75" filter="url(#bGround)"/>')
    gs2 = rp(CX, CY[2] + THICK + 26, Wp * 0.92, HPS[2] * 0.92, CUT)
    f.append(f'<path d="{gs2}" fill="{SHADOW_GROUND}" opacity="0.3" filter="url(#bGround2)"/>')

    def draw_plate(idx):
        cy, hp = CY[idx], HPS[idx]
        side = rp(CX, cy + THICK, Wp, hp, CUT)
        f.append(f'<path d="{side}" fill="url(#gSide)"/>')
        f.append(f'<path d="{plate(CX, cy, hp)}" fill="{FACE}"/>')
        if idx == 0:
            for hd in holes(CX, cy):
                f.append(f'<path d="{hd}" fill="{HOLE_FILL}"/>')

    # painted back-to-front; the top slab is drawn last (closest to camera).
    # Per gap: a white body polygon fills the notch between the slabs (its top
    # edge = the underside V under the upper slab's side, straight vertical
    # edges at the wings), then the V-shaped cast shadow band right below that
    # edge (darkest at the top, fading down), then the lower slab on top.
    bottom, middle, top = 2, 1, 0
    draw_plate(bottom)
    for i, (up, low) in enumerate(((middle, bottom), (top, middle))):
        hp_up, hp_low = HPS[up], HPS[low]
        y_v = CY[up] + HPS[up] + THICK            # underside V low point
        y_b = CY[low] + HPS[low] + 2              # just under the lower face
        f.append(f'<path d="M {CX - Wp:.1f} {y_v:.1f} '
                 f'L {CX:.1f} {CY[up] + HPS[up] + THICK:.1f} '
                 f'L {CX + Wp:.1f} {y_v:.1f} '
                 f'L {CX + Wp:.1f} {y_b:.1f} L {CX - Wp:.1f} {y_b:.1f} Z" '
                 f'fill="{FACE}"/>')
        # cast shadow: V-shaped band right under the upper slab's underside,
        # darkest at the edge, fading out downward
        ring = (rp(CX, CY[up] + THICK + SHADOW_H, Wp, hp_up, CUT) + " "
                + rp(CX, CY[up] + THICK, Wp, hp_up, CUT))
        gid = f"gBand{i}"
        y1 = CY[up] + THICK
        f.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
                 f'x1="0" y1="{y1:.0f}" x2="0" y2="{y1 + SHADOW_H + 8:.0f}">'
                 f'<stop offset="0" stop-color="{BAND_SHADOW}" stop-opacity="0.85"/>'
                 f'<stop offset="0.55" stop-color="{BAND_SHADOW}" stop-opacity="0.35"/>'
                 f'<stop offset="1" stop-color="{BAND_SHADOW}" stop-opacity="0"/></linearGradient>')
        f.append(f'<clipPath id="cBand{i}"><path d="{plate(CX, CY[low], hp_low)}"/></clipPath>')
        f.append(f'<g clip-path="url(#cBand{i})">'
                 f'<path d="{ring}" fill-rule="evenodd" fill="url(#{gid})" '
                 f'filter="url(#bBand)"/></g>')
        draw_plate(up)
    f.append('</svg>')
    return "\n".join(f)


if __name__ == "__main__":
    svg = build()
    out = r"F:\Docker\laboratory\schemagine\public\favicon.svg"
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(svg)
    print("wrote", out, len(svg), "bytes")
