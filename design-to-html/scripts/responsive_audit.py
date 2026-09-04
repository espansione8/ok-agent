"""Assert every asset survives the responsive layouts.

The point of extracting assets individually is that they exist in every
breakpoint. This is the check that proves it: at each width it verifies every
image actually decoded (naturalWidth > 0), nothing overflows the viewport, and
the console is clean.

Usage:
  python responsive_audit.py page.html [--sizes 390x844,768x1024,1920x1080]
         [--expect 9] [--art .art] [--flow main.flow] [--shot out]
"""
import argparse
import os

from playwright.sync_api import sync_playwright

JS = """(sel) => {
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
           s.display !== 'none' && s.visibility !== 'hidden';
  };
  const imgs = [...document.querySelectorAll('img')].map(el => ({
    src: el.getAttribute('src'),
    shown: vis(el),
    ok: el.complete && el.naturalWidth > 0,
    nat: el.naturalWidth + 'x' + el.naturalHeight
  }));
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  // Only worth naming culprits when the document really overflows. Artwork
  // legitimately bleeds past the artboard edge and is clipped by its
  // overflow:hidden -- flagging that as overflow is a false positive.
  const wide = overflow
    ? [...document.querySelectorAll('body *')]
        .filter(vis)
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 5)
        .map(el => (el.tagName + '.' + (el.className || '')).slice(0, 40))
    : [];
  return {
    imgs, wide, overflow,
    svgs: [...document.querySelectorAll('svg')].filter(vis).length,
    scrollW: document.documentElement.scrollWidth,
    artShown: vis(document.querySelector(sel.art)),
    flowShown: vis(document.querySelector(sel.flow))
  };
}"""

DEFAULT = "390x844,430x932,768x1024,1024x768,1440x900,1920x1080"
NAMES = {(390, 844): "mobile", (430, 932): "mobile-l", (768, 1024): "tablet",
         (1024, 768): "laptop", (1440, 900): "desktop", (1920, 1080): "full"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--sizes", default=DEFAULT)
    ap.add_argument("--expect", type=int, default=0,
                    help="expected number of distinct image assets (0 = no check)")
    ap.add_argument("--art", default=".art")
    ap.add_argument("--flow", default="main.flow")
    ap.add_argument("--shot", default=None,
                    help="prefix for full-page screenshots")
    a = ap.parse_args()

    sizes = []
    for s in a.sizes.split(","):
        w, h = (int(v) for v in s.strip().lower().split("x"))
        sizes.append((w, h))

    url = "file:///" + os.path.abspath(a.html).replace("\\", "/")
    fails = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--disable-lcd-text"])
        for w, h in sizes:
            pg = b.new_page(viewport={"width": w, "height": h},
                            device_scale_factor=1)
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.type + ": " + m.text)
                  if m.type == "error" else None)
            pg.goto(url)
            try:
                pg.wait_for_function("document.fonts.status === 'loaded'",
                                     timeout=15000)
            except Exception:
                pass
            pg.wait_for_timeout(500)
            r = pg.evaluate(JS, {"art": a.art, "flow": a.flow})

            live = [i for i in r["imgs"] if i["shown"]]
            seen = sorted({i["src"].split("/")[-1] for i in live})
            broken = [i["src"] for i in live if not i["ok"]]

            problems = []
            if broken:
                problems.append("BROKEN: %s" % ", ".join(broken))
            if r["overflow"]:
                problems.append("OVERFLOW scrollW=%d > %d" % (r["scrollW"], w))
            if r["wide"]:
                problems.append("WIDE: %s" % ", ".join(r["wide"]))
            if errs:
                problems.append("ERRORS: %s" % errs[:3])
            if a.expect and len(seen) < a.expect:
                problems.append("only %d/%d assets visible" % (len(seen), a.expect))
            # exactly one of the two layouts should be live
            if r["artShown"] == r["flowShown"]:
                problems.append("art=%s flow=%s (exactly one must show)"
                                % (r["artShown"], r["flowShown"]))
            fails += bool(problems)

            print("%-9s %4dx%-5d art=%-5s flow=%-5s assets=%-4d svgs=%-3d "
                  "overflow=%-5s %s"
                  % (NAMES.get((w, h), "%dx%d" % (w, h)), w, h,
                     r["artShown"], r["flowShown"], len(seen), r["svgs"],
                     r["overflow"], "OK" if not problems else "FAIL"))
            print("           %s" % " ".join(
                os.path.splitext(s)[0] for s in seen))
            for p in problems:
                print("    ! %s" % p)

            if a.shot:
                pg.screenshot(path="%s_%d.png" % (a.shot, w), full_page=True)
            pg.close()
        b.close()

    print("\n%d/%d viewports clean" % (len(sizes) - fails, len(sizes)))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
