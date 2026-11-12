"""Builds the A to F logo and every icon from one window drawing: a cabin window with a low blue sun.

Writes web/public/logo.svg and web/app/icon.svg and renders the PNGs
(PWA icons, apple-icon, plugin icon, brand preview) with the pre-installed Playwright Chromium.
Run from the repo root: python brand/make_logo.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
NAVY, BLUE, LIGHT_BLUE, WHITE = "#0B2350", "#1F5FD6", "#6FA8F5", "#FFFFFF"
LABEL = "A to F logo: an airplane window with a low blue sun"


def window(line: str, sun: str) -> str:
    """The 260 x 340 window. Same pane geometry the Virtual Window frame uses (pane 24..236 x 24..316)."""
    return f"""<rect x="10" y="10" width="240" height="320" rx="110" fill="none" stroke="{line}" stroke-width="14"/>
<clipPath id="win"><rect x="24" y="24" width="212" height="292" rx="98"/></clipPath>
<clipPath id="above"><rect x="0" y="0" width="260" height="238"/></clipPath>
<g clip-path="url(#win)">
<circle cx="130" cy="238" r="44" fill="{sun}" clip-path="url(#above)"/>
<rect x="0" y="0" width="260" height="76" fill="{line}"/>
</g>
<rect x="116" y="72" width="28" height="10" rx="5" fill="{line}"/>"""


def logo_svg() -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 340" role="img" aria-label="{LABEL}">\n'
            f"{window(NAVY, BLUE)}\n</svg>\n")


def icon_svg(side: float = 447.4) -> str:
    """Square app icon: white window on navy. A bigger `side` adds padding (maskable icons)."""
    dx, dy = (side - 260) / 2, (side - 340) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" role="img" aria-label="{LABEL}">\n'
            f'<rect width="{side}" height="{side}" fill="{NAVY}"/>\n'
            f'<g transform="translate({dx:.1f} {dy:.1f})">{window(WHITE, LIGHT_BLUE)}</g>\n</svg>\n')


def main() -> None:
    logo, icon, maskable = logo_svg(), icon_svg(), icon_svg(562)
    for p in ("web/public/logo.svg",):
        (ROOT / p).write_text(logo)
    for p in ("web/app/icon.svg",):
        (ROOT / p).write_text(icon)

    renders = [
        (icon, 192, 192, "web/public/icons/icon-192.png"),
        (icon, 512, 512, "web/public/icons/icon-512.png"),
        (maskable, 192, 192, "web/public/icons/icon-maskable-192.png"),
        (maskable, 512, 512, "web/public/icons/icon-maskable-512.png"),
        (icon, 180, 180, "web/app/apple-icon.png"),
        (icon, 512, 512, "plugin/a-to-f-trip-planner/.claude-plugin/icon.png"),
        (logo, 260, 340, "brand/logo-preview.png"),
    ]
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for svg, w, h, out in renders:
            page = browser.new_page(viewport={"width": w, "height": h})
            body = svg.replace("<svg ", f'<svg width="{w}" height="{h}" ', 1)
            page.set_content(f'<html><body style="margin:0;background:#fff">{body}</body></html>')
            page.screenshot(path=str(ROOT / out), clip={"x": 0, "y": 0, "width": w, "height": h})
            page.close()
            print("wrote", out)
        browser.close()


if __name__ == "__main__":
    main()
