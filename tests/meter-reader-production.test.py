"""Production worker validation/quality/carry checks without loading model weights."""
import base64
import importlib.util
import io
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/ai'))
import meter_reader_worker as worker
from meter_wheels import wheel_decode


class ProductionWorkerTests(unittest.TestCase):
    def test_mirrored_and_crossed_reading_orders_are_refused(self):
        frame = Image.new('RGB', (200, 80))
        for corners in [[[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [0, 1], [1, 1], [1, 0]], [[0, 0], [1, 0], [1, 1], [float('nan'), 1]]]:
            with self.assertRaises(ValueError):
                worker.normalized_corners(corners, frame)

    def test_blank_image_returns_no_reading_before_model_load(self):
        image = Image.new('RGB', (300, 100), '#888888')
        encoded = io.BytesIO(); image.save(encoded, format='PNG')
        result = worker.process_request({'protocol': 1, 'mode': 'read', 'image': base64.b64encode(encoded.getvalue()).decode(),
                  'digits': 6, 'decimals': 1, 'utility': 'water', 'corners': [[.1,.1],[.9,.1],[.9,.9],[.1,.9]]})
        self.assertEqual(result['status'], 'retake')
        self.assertIsNone(result['reading'])
        self.assertFalse(result['quality']['canRead'])
        self.assertEqual(result['cells'], [])

    def test_source_resolution_cannot_be_invented_by_cell_resize(self):
        row = Image.fromarray(np.tile(np.arange(80, dtype=np.uint8), (30, 1)))
        quality, _ = worker.quality_for({'image': row, 'row_box': (0, 0, 80, 30)}, 8)
        self.assertFalse(quality['checks']['resolution'])
        self.assertEqual(quality['metrics']['cellWidth'], 10)

    def test_production_mechanical_decoder_preserves_carry_without_history(self):
        probabilities = np.full((3, 100), 1e-9)
        for index, position in enumerate([0, 18, 98]): probabilities[index, position] = 1
        value, _, bins = wheel_decode(np.log(probabilities))
        self.assertEqual(value, 19.8)
        self.assertEqual(bins, [0, 18, 98])

    def test_edge_quality_uses_reader_scale_without_upscaling_source(self):
        pixels = np.full((144, 576), 60, dtype=np.uint8)
        for offset in range(24, 576, 96):
            pixels[24:120, offset:offset+18] = 230
        image = Image.fromarray(pixels)
        quality, _ = worker.quality_for({'image': image, 'row_box': (0, 0, 576, 144)}, 6)
        self.assertTrue(quality['checks']['sharpness'])
        self.assertEqual(quality['metrics']['cellWidth'], 96)
        blurred = image.filter(ImageFilter.GaussianBlur(30))
        quality, _ = worker.quality_for({'image': blurred, 'row_box': (0, 0, 576, 144)}, 6)
        self.assertFalse(quality['checks']['sharpness'])


if __name__ == '__main__':
    unittest.main()
