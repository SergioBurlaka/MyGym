#!/usr/bin/env python3
"""
capture.py — screenshot + probe matrix with REAL device emulation.

Use when no browser MCP with true emulation (Chrome DevTools MCP `emulate`,
Playwright MCP `--device`) is available but Python Playwright is. It opens each
URL as a phone (isMobile, touch, DPR 3, mobile UA) and as a desktop, in light
and dark colour schemes, saves a first-viewport and a full-page screenshot,
and runs probe-craft.js in each cell.

    python3 capture.py https://app.example.com/ https://app.example.com/workout \
        --out review-shots [--storage-state auth.json] [--no-dark] [--tablet]

Auth: log in once in a headed browser and save the session —
    python3 capture.py --login https://app.example.com/ --storage-state auth.json
then pass --storage-state on every capture. Never put passwords in this script.

Output: <out>/<slug>__<viewport>__<scheme>.png / __full.png / __craft.json,
plus <out>/index.json listing every cell.
"""
import argparse, json, pathlib, re, sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Python Playwright is missing: pip install playwright && python -m playwright install chromium")

HERE = pathlib.Path(__file__).resolve().parent
MOBILE_UA = ("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")
VIEWPORTS = {
    "mobile-390": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                       is_mobile=True, has_touch=True, user_agent=MOBILE_UA),
    "tablet-768": dict(viewport={"width": 768, "height": 1024}, device_scale_factor=2,
                       is_mobile=True, has_touch=True, user_agent=MOBILE_UA),
    "desktop-1440": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1),
}


def slug(url: str) -> str:
    s = re.sub(r"^https?://[^/]+", "", url).strip("/") or "home"
    return re.sub(r"[^a-zA-Z0-9]+", "-", s)[:60]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--out", default="review-shots")
    ap.add_argument("--storage-state")
    ap.add_argument("--no-dark", action="store_true")
    ap.add_argument("--tablet", action="store_true")
    ap.add_argument("--wait", type=int, default=1500, help="ms to wait after load for client rendering")
    ap.add_argument("--login", action="store_true", help="open a headed browser to sign in, then save --storage-state")
    a = ap.parse_args()

    with sync_playwright() as p:
        if a.login:
            if not a.storage_state:
                sys.exit("--login needs --storage-state <file>")
            b = p.chromium.launch(headless=False)
            ctx = b.new_context()
            ctx.new_page().goto(a.urls[0])
            input("Sign in in the opened window, then press Enter here… ")
            ctx.storage_state(path=a.storage_state)
            b.close()
            print("saved", a.storage_state)
            return

        out = pathlib.Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        probe = (HERE / "probe-craft.js").read_text()
        schemes = ["light"] if a.no_dark else ["light", "dark"]
        vps = [v for v in VIEWPORTS if a.tablet or v != "tablet-768"]
        b = p.chromium.launch()
        index = []
        for url in a.urls:
            for vp in vps:
                for scheme in schemes:
                    opts = dict(VIEWPORTS[vp], color_scheme=scheme)
                    if a.storage_state:
                        opts["storage_state"] = a.storage_state
                    ctx = b.new_context(**opts)
                    pg = ctx.new_page()
                    cell = {"url": url, "viewport": vp, "scheme": scheme}
                    try:
                        pg.goto(url, wait_until="networkidle", timeout=45000)
                        pg.wait_for_timeout(a.wait)
                        base = out / f"{slug(url)}__{vp}__{scheme}"
                        pg.screenshot(path=f"{base}.png")
                        pg.screenshot(path=f"{base}__full.png", full_page=True)
                        (pathlib.Path(f"{base}__craft.json")).write_text(pg.evaluate(probe))
                        cell.update(final_url=pg.url, shot=f"{base}.png", full=f"{base}__full.png",
                                    craft=f"{base}__craft.json")
                    except Exception as e:  # keep going: one broken cell should not kill the matrix
                        cell["error"] = str(e)[:300]
                    index.append(cell)
                    print(json.dumps(cell, ensure_ascii=False))
                    ctx.close()
        b.close()
        (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
