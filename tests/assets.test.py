"""Run with: python3 tests/assets.test.py (Pillow required)."""
from html.parser import HTMLParser
from pathlib import Path
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            self.images.append(dict(attrs))

class AssetsTest(unittest.TestCase):
    def test_all_screenshots_have_valid_responsive_assets(self):
        count = 0
        for path in (ROOT / 'articles').glob('*.html'):
            parsed = Images()
            parsed.feed(path.read_text())
            for index, attrs in enumerate(parsed.images):
                count += 1
                self.assertFalse(attrs['src'].startswith('data:'))
                self.assertEqual(attrs['loading'], 'eager' if index == 0 else 'lazy')
                full = ROOT / attrs['data-full-src']
                with Image.open(full) as image:
                    self.assertEqual(image.size, (int(attrs['width']), int(attrs['height'])))
                for candidate in attrs['srcset'].split(', '):
                    url, width = candidate.split()
                    with Image.open(ROOT / url) as image:
                        self.assertEqual(image.width, int(width[:-1]))
                        self.assertGreater(image.height, 0)
        self.assertEqual(count, 61)

if __name__ == '__main__':
    unittest.main()
