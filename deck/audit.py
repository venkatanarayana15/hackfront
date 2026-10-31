"""Geometric audit of the generated deck: bounds, estimated overflow, text collisions."""
from pptx import Presentation
from pptx.util import Emu
import sys

PATH = 'docs/CodeCompass-hackFront-India.pptx'
prs = Presentation(PATH)
SW, SH = prs.slide_width / 914400, prs.slide_height / 914400
print(f'slides={len(prs.slides)} size={SW:.2f}x{SH:.2f}')

def boxes(shapes):
    out = []
    for sh in shapes:
        try:
            if not sh.has_text_frame:
                continue
            text = sh.text_frame.text.strip()
            if not text:
                continue
            out.append((sh, text, sh.left / 914400, sh.top / 914400, sh.width / 914400, sh.height / 914400))
        except Exception:
            continue
    return out

issues = 0
for i, slide in enumerate(prs.slides, 1):
    for sh, text, x, y, w, h in boxes(slide.shapes):
        if x < -0.01 or y < -0.01 or x + w > SW + 0.01 or y + h > SH + 0.01:
            print(f'  slide {i}: OUT OF BOUNDS {x:.2f},{y:.2f} {w:.2f}x{h:.2f} :: {text[:50]!r}')
            issues += 1
        # crude overflow estimate from font size and run count
        sizes = [r.font.size.pt for p in sh.text_frame.paragraphs for r in p.runs if r.font.size]
        size = max(sizes) if sizes else 12
        cpl = max(4, int((w * 72) / (size * 0.52)))
        lines = text.split('\n')
        est_lines = sum(max(1, -(-len(l) // cpl)) for l in lines)
        capacity = max(1, int((h * 72) / (size * 1.22)))
        if est_lines > capacity + 1:
            print(f'  slide {i}: MAY OVERFLOW size={size} box={w:.2f}x{h:.2f} est_lines={est_lines} cap={capacity} :: {text[:60]!r}')
            issues += 1
    # collide text boxes
    bs = boxes(slide.shapes)
    for a in range(len(bs)):
        for b in range(a + 1, len(bs)):
            _, ta, ax, ay, aw, ah = bs[a]
            _, tb, bx, by, bw, bh = bs[b]
            ox = max(0, min(ax + aw, bx + bw) - max(ax, bx))
            oy = max(0, min(ay + ah, by + bh) - max(ay, by))
            inter = ox * oy
            small = min(aw * ah, bw * bh) or 1
            if inter / small > 0.35:
                print(f'  slide {i}: TEXT COLLISION {inter/small:.0%} :: {ta[:32]!r} / {tb[:32]!r}')
                issues += 1

print('issues', issues)
sys.exit(1 if issues else 0)
