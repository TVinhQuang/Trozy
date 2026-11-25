"""Evidence gates for image-derived layout, never expected meter values."""
import sys
from pathlib import Path
import unittest
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/ai'))
from meter_layout import red_suffix, printed_decimal, detected_grid
from meter_row_geometry import refine_row
from meter_reader_worker import visible_row_ends


class LayoutTests(unittest.TestCase):
    def prepared(self, colors):
        image = Image.new('RGB', (len(colors) * 30, 48))
        for index, color in enumerate(colors):
            image.paste(color, (30 * index, 0, 30 * index + 30, 48))
        return {'image': image, 'row_box': (0, 0, image.width, image.height)}

    def test_clear_contiguous_red_suffix_supplies_boundary(self):
        result = red_suffix(self.prepared(['black'] * 5 + ['#b92828'] * 3), 8, 'detected-wheel-grid')
        self.assertEqual((result['digits'], result['decimals']), (8, 3))
        self.assertEqual(len(result['cells']), 8)

    def test_unknown_and_non_suffix_red_never_guess_zero_or_boundary(self):
        for colors in [['black'] * 6, ['red'] * 6, ['black', 'red', 'black', 'red'], ['blue'] * 4 + ['red']]:
            self.assertIsNone(red_suffix(self.prepared(colors), len(colors), 'ocr-line'))

    def test_printed_decimal_requires_two_exact_texts(self):
        result = printed_decimal(['00 123.4', '00123.4'])
        self.assertEqual((result['digits'], result['decimals']), (6, 1))
        for texts in [['00123.4'], ['00123.4', '001234'], ['00123.4', '00123.5'], ['00123:4'] * 2, ['1.0'] * 2]:
            self.assertIsNone(printed_decimal(texts))

    def test_detected_count_accounts_for_entire_window_and_refuses_gaps(self):
        window = {'corners': [[15, 10], [195, 10], [195, 70], [15, 70]]}
        boxes = [{'class_name': '8', 'confidence': .9, 'corners': [[22 + 30*i, 20], [38 + 30*i, 20], [38 + 30*i, 56], [22 + 30*i, 56]]} for i in range(6)]
        grid = detected_grid(window, boxes, (240, 100), refine_row)
        self.assertEqual(grid[0], 6)
        self.assertIsNone(detected_grid(window, boxes[1:], (240, 100), refine_row))
        self.assertIsNone(detected_grid(window, boxes[:3] + boxes[4:], (240, 100), refine_row))

    def test_shortened_dark_row_is_not_complete_when_previous_wheel_remains(self):
        image = Image.new('RGB', (240, 60), '#bbbbbb')
        image.paste('#333333', (0, 10, 210, 50))
        image.paste('#bb2222', (180, 10, 210, 50))
        prepared = {'image': image, 'row_box': (30, 10, 210, 50)}
        self.assertFalse(visible_row_ends(prepared, 6))

    def test_bright_row_does_not_hide_extra_red_wheel(self):
        image = Image.new('RGB', (240, 60), '#eeeeee')
        image.paste('#bb2222', (215, 10, 240, 50))
        self.assertFalse(visible_row_ends({'image': image, 'row_box': (30, 10, 210, 50)}, 6))

    def test_electric_margin_cannot_contain_previous_white_glyph(self):
        image = Image.new('RGB', (240, 60), '#333333')
        image.paste('#eeeeee', (16, 10, 22, 50))
        prepared = {'image': image, 'row_box': (30, 10, 210, 50)}
        self.assertFalse(visible_row_ends(prepared, 6, allow_dark_margin=True))
        image.paste('#333333', (16, 10, 22, 50))
        self.assertTrue(visible_row_ends(prepared, 6, allow_dark_margin=True))


if __name__ == '__main__':
    unittest.main()
