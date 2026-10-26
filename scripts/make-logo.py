#!/usr/bin/env python3
"""Generate the Roj logo, the symbolic panel icon and the footer heart as SVG.

The geometry reproduces the tsroj logo (eyelid arc with nine lashes, black
pupil, thirteen-ray sun) measured from the original raster, made symmetric.
Colours are sampled from the original: sun #F5CD0E, ink #020202, face #F8F8F8.

Usage: python3 scripts/make-logo.py   (writes into assets/ and extension/icons/)
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUN = '#F5CD0E'
INK = '#020202'
FACE = '#F8F8F8'
RIM = '#1E1E1E'


def ellipse_radius(rx, ry, deg):
    a = math.radians(deg)
    return 1 / math.sqrt((math.cos(a) / rx) ** 2 + (math.sin(a) / ry) ** 2)


def pt(cx, cy, r, deg, down=False):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + (r if down else -r) * math.sin(a)


def fmt(x, y):
    return f'{x:.2f},{y:.2f}'


def fan_points(cx, cy, tip_radii, edge_r, body_r, spacing, half_base, knee=None, notch=0.0):
    """Polygon of the sun: a half disc with a flat top edge and spikes fanning
    downwards. Each spike's base spans `half_base` degrees either side of its
    axis on the disc. `knee` = (radius fraction, half-angle) bends the spike
    edges inwards, giving the slender concave rays of the original; the
    outermost spikes lie flat along the top edge."""
    n = len(tip_radii) - 1
    angles = [90 + spacing * k for k in range(-n, n + 1)]
    radii = [tip_radii[abs(k)] for k in range(-n, n + 1)]

    def spike(ang, r):
        pts = [pt(cx, cy, body_r, ang - half_base, down=True)]
        if knee:
            pts.append(pt(cx, cy, r * knee[0], ang - knee[1], down=True))
        pts.append(pt(cx, cy, r, ang, down=True))
        if knee:
            pts.append(pt(cx, cy, r * knee[0], ang + knee[1], down=True))
        pts.append(pt(cx, cy, body_r, ang + half_base, down=True))
        return pts

    edge_axis = 90 - spacing * (n + 1)
    pts = [(cx + edge_r, cy)]
    if knee:
        pts.append(pt(cx, cy, edge_r * knee[0], edge_axis + knee[1], down=True))
    pts.append(pt(cx, cy, body_r, edge_axis + half_base, down=True))
    for ang, r in zip(angles, radii):
        pts.extend(spike(ang, r))
    pts.append(pt(cx, cy, body_r, 180 - edge_axis - half_base, down=True))
    if knee:
        pts.append(pt(cx, cy, edge_r * knee[0], 180 - edge_axis - knee[1], down=True))
    pts.append((cx - edge_r, cy))
    if notch:
        pts.append((cx - notch, cy))
    return pts


def full_logo():
    cx, cy = 522, 496  # coordinates of the original raster
    arc_rx, arc_ry, arc_w = 214.5, 188, 24
    lash_rx, lash_ry, lash_w = 320, 308, 22
    lashes = [90 + 18.4 * k for k in range(-4, 5)]

    parts = [f'<circle cx="{cx}" cy="{cy}" r="446" fill="{FACE}" stroke="{RIM}" stroke-width="3"/>']

    fan = fan_points(cx, cy, [298, 300, 300, 292, 272, 271], 296, 152, 89 / 6, 7.4, knee=(0.8, 2.0))
    parts.append(f'<path fill="{SUN}" d="M{" L".join(fmt(*p) for p in fan)} Z"/>')

    rays = []
    for ang in lashes:
        r0 = ellipse_radius(arc_rx, arc_ry, ang)
        r1 = ellipse_radius(lash_rx, lash_ry, ang) - lash_w / 2
        (x0, y0), (x1, y1) = pt(cx, cy, r0, ang), pt(cx, cy, r1, ang)
        rays.append(f'M{fmt(x0, y0)} L{fmt(x1, y1)}')
    parts.append(f'<path fill="none" stroke="{INK}" stroke-width="{lash_w}" stroke-linecap="round" d="{" ".join(rays)}"/>')
    parts.append(
        f'<path fill="none" stroke="{INK}" stroke-width="{arc_w}" '
        f'd="M{cx - arc_rx},{cy} A{arc_rx},{arc_ry} 0 0 1 {cx + arc_rx},{cy}"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="{INK}"/>')

    # Centre the 892px disc in a 1024 canvas with a small margin.
    scale = 488 / 449.5
    body = '\n    '.join(parts)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>Roj</title>
  <g transform="translate(512 512) scale({scale:.5f}) translate({-cx} {-cy})">
    {body}
  </g>
</svg>
'''


def symbolic_icon():
    """16px single-colour icon; GNOME Shell recolours it to the panel text colour."""
    cx, cy = 8, 8.4
    color = '#2e3436'
    rays = []
    for ang in (90, 54, 126, 18, 162):
        r0 = ellipse_radius(4.6, 4.0, ang)
        r1 = ellipse_radius(7.1, 6.9, ang) - 0.55
        (x0, y0), (x1, y1) = pt(cx, cy, r0, ang), pt(cx, cy, r1, ang)
        rays.append(f'M{fmt(x0, y0)} L{fmt(x1, y1)}')
    fan = fan_points(cx, cy, [6.9, 6.9, 6.4], 6.6, 3.6, 30, 8, notch=2.1)
    # Notch around the pupil: lower half-circle back to the right of centre.
    fan_d = f'M{" L".join(fmt(*p) for p in fan)} A2.1,2.1 0 0 0 {cx + 2.1:.2f},{cy:.2f} Z'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <g fill="{color}">
    <path d="{fan_d}"/>
    <circle cx="{cx}" cy="{cy}" r="1.35"/>
  </g>
  <g fill="none" stroke="{color}" stroke-width="1.1">
    <path stroke-linecap="round" d="{" ".join(rays)}"/>
    <path d="M{cx - 4.6:.2f},{cy:.2f} A4.6,4.0 0 0 1 {cx + 4.6:.2f},{cy:.2f}"/>
  </g>
</svg>
'''


HEART = '''<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path fill="#E01B24" d="M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.6.6 3.4 1.6C8.8 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6Z"/>
</svg>
'''


def main():
    logo = full_logo()
    for path in (ROOT / 'assets' / 'logo.svg', ROOT / 'extension' / 'icons' / 'roj-logo.svg'):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(logo)
    (ROOT / 'extension' / 'icons' / 'roj-symbolic.svg').write_text(symbolic_icon())
    (ROOT / 'extension' / 'icons' / 'heart.svg').write_text(HEART)
    print('wrote assets/logo.svg and extension/icons/{roj-logo,roj-symbolic,heart}.svg')


if __name__ == '__main__':
    main()
