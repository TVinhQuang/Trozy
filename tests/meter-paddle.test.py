"""Electric Paddle dispatch and proposal guards, without loading OCR weights."""
import base64
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/ai'))
import meter_paddle as paddle
import meter_reader_worker as worker


def observation(text='123456', confidence=.95, corners=None, pass_name='full'):
    return {'text': text, 'confidence': confidence, 'corners': corners or [[.1, .3], [.8, .3], [.8, .6], [.1, .6]], 'pass': pass_name}


class PaddleMeterTests(unittest.TestCase):
    def setUp(self):
        self.frame = Image.fromarray(np.random.default_rng(42).integers(20, 230, (100, 320, 3), dtype=np.uint8))
        self.request = {'mode': 'auto', 'utility': 'electric', 'profile': {'digits': 6, 'decimals': 1}}

    def test_parser_preserves_zeros_and_never_removes_unknown_letters_or_punctuation(self):
        self.assertEqual(paddle.canonical_digits('00 0054', 6, 1), '000054')
        self.assertEqual(paddle.canonical_digits('00005.4', 6, 1), '000054')
        for text in ['00005:4', '000054kWh', 'O00054', '0000.54', '00054', '0000054', '-000054']:
            self.assertIsNone(paddle.canonical_digits(text, 6, 1))

    def test_electric_never_dispatches_to_water_models(self):
        encoded = io.BytesIO(); self.frame.save(encoded, format='PNG')
        request = {'protocol': 1, 'mode': 'auto', 'utility': 'electric', 'image': base64.b64encode(encoded.getvalue()).decode()}
        with patch.object(worker, 'detect', side_effect=AssertionError('water locator must not run')), \
             patch.object(worker, 'WheelReader', side_effect=AssertionError('wheel reader must not run')), \
             patch.object(paddle, 'create_ocr', side_effect=AssertionError('setup first')):
            result = worker.process_request(request)
        self.assertEqual(result['status'], 'needs_setup')
        self.assertEqual(result['engine'], 'paddleocr')
        self.assertIsNone(result['reading'])

    def test_water_never_dispatches_to_paddle(self):
        encoded = io.BytesIO(); self.frame.save(encoded, format='PNG')
        with patch.object(paddle, 'electric_request', side_effect=AssertionError('Paddle must not run')):
            result = worker.process_request({'protocol': 1, 'mode': 'auto', 'utility': 'water', 'image': base64.b64encode(encoded.getvalue()).decode()})
        self.assertEqual(result['status'], 'needs_setup')
        self.assertEqual(result['engine'], 'visionstate')

    def test_automatic_numeric_serial_without_kwh_context_is_not_a_meter_reading(self):
        self.assertEqual(paddle.numeric_candidates([observation()], self.frame, 6, 1, automatic=True), [])

    def test_multiple_automatic_rows_and_partial_text_never_get_joined(self):
        for candidates in [[observation(), observation('654321')], []]:
            with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', return_value=[observation('123'), observation('456')]), \
                 patch.object(paddle, 'numeric_candidates', return_value=candidates):
                result = paddle.electric_request(self.request, self.frame)
            self.assertEqual(result['status'], 'needs_review')
            self.assertIsNone(result['reading'])

    def test_two_complete_passes_must_agree_and_have_real_source_polygons(self):
        for crop, expected in [(observation('123456', pass_name='crop'), 'ready'),
                               (observation('123457', pass_name='crop'), 'needs_review'),
                               (observation('123456', .5, pass_name='crop'), 'needs_review')]:
            full = observation()
            with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[full], [crop]]), \
                 patch.object(paddle, 'numeric_candidates', return_value=[full]):
                result = paddle.electric_request(self.request, self.frame)
            self.assertEqual(result['status'], expected)
            self.assertEqual(result['cells'], [])
            if expected == 'ready':
                self.assertEqual(result['reading']['displayText'], '12345.6')
                self.assertEqual(result['confidence'], .95)
                self.assertEqual(result['ocrEvidence']['selectedObservationIndices'], [0, 1])
            else:
                self.assertIsNone(result['reading'])

    def test_manual_selection_can_read_two_region_passes_without_full_photo_text(self):
        region = observation('000054', pass_name='region')
        crop = observation('000054', pass_name='crop')
        request = {'mode': 'read', 'utility': 'electric', 'digits': 6, 'decimals': 1, 'corners': region['corners']}
        with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[region], [crop]]) as read, \
             patch.object(paddle, 'numeric_candidates', return_value=[region]):
            result = paddle.electric_request(request, self.frame)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['reading']['displayText'], '00005.4')
        self.assertEqual(result['ocrEvidence']['scope'], 'owner-region')
        self.assertEqual(read.call_args_list[0].args[2], 'region')

    def test_empty_invalid_score_or_mirrored_observations_are_not_promoted_to_evidence(self):
        polygon = np.array([[10, 10], [200, 10], [200, 40], [10, 40]])
        class OCR:
            def predict(self, **_):
                return [{'rec_texts': ['', '  ', '123456', '123456', '123456'],
                         'rec_scores': [.95, .95, 2, float('nan'), .95],
                         'rec_polys': [polygon, polygon, polygon, polygon, polygon[::-1]]}]
        self.assertEqual(paddle.observations(OCR(), self.frame, 'full'), [])


if __name__ == '__main__':
    unittest.main()
