#!/usr/bin/env python3
"""Extract embedded screenshots into responsive, cacheable WebP files.

Run with Python 3 and Pillow. Existing external images are left unchanged.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets/img/screenshots"
DEST.mkdir(parents=True, exist_ok=True)
PATTERN = re.compile(r'<img\b[^>]*\bsrc="data:image/[^;]+;base64,([^\"]+)"[^>]*>')
report = []

for path in sorted((ROOT / "articles").glob("*.html")):
    original = path.read_text()
    image_number = 0

    def extract(match):
        global image_number
        image_number += 1
        payload = base64.b64decode(match.group(1))
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        width, height = image.size
        name = "shot-" + hashlib.sha256(payload).hexdigest()[:12]
        variants = []
        for target in sorted({min(720, width), min(1280, width), width}):
            resized = image.resize((target, round(height * target / width)), Image.Resampling.LANCZOS)
            output = DEST / f"{name}-{target}.webp"
            encoded = io.BytesIO()
            resized.save(encoded, "WEBP", quality=88, method=6)
            output.write_bytes(encoded.getvalue())
            variants.append((target, f"assets/img/screenshots/{output.name}"))
        src = variants[0][1]
        full = variants[-1][1]
        srcset = ", ".join(f"{url} {size}w" for size, url in variants)
        loading = "eager" if image_number == 1 else "lazy"
        priority = ' fetchpriority="high"' if image_number == 1 else ""
        tag = re.sub(r'\bsrc="[^\"]+"', f'src="{src}"', match.group(0))
        tag = re.sub(r'\s+(?:width|height|loading|decoding|srcset|sizes|fetchpriority)="[^\"]*"', '', tag)
        tag = tag[:-1] + (f' srcset="{srcset}" sizes="(max-width: 600px) calc(100vw - 48px), '
                         f'(max-width: 960px) calc(100vw - 84px), 820px" width="{width}" height="{height}" '
                         f'loading="{loading}" decoding="async" data-full-src="{full}"{priority}>')
        report.append({"article": path.name, "original_bytes": len(payload), "full_src": full})
        return tag

    updated = PATTERN.sub(extract, original)
    if updated != original:
        path.write_text(updated)

print(json.dumps({"extracted_images": len(report),
                  "original_image_bytes": sum(item["original_bytes"] for item in report),
                  "generated_image_bytes": sum(p.stat().st_size for p in DEST.glob("*.webp"))}, indent=2))
