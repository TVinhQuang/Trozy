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
             patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', return_value=[]):
            result = worker.process_request(request)
        self.assertEqual(result['status'], 'needs_review')
        self.assertEqual(result['engine'], 'paddleocr')
        self.assertIsNone(result['reading'])

    def test_water_never_dispatches_to_paddle(self):
        encoded = io.BytesIO(); self.frame.save(encoded, format='PNG')
        with patch.object(paddle, 'electric_request', side_effect=AssertionError('Paddle must not run')), \
             patch.object(worker, 'detect', return_value={'status': 'no_window'}):
            result = worker.process_request({'protocol': 1, 'mode': 'auto', 'utility': 'water', 'image': base64.b64encode(encoded.getvalue()).decode()})
        self.assertEqual(result['status'], 'needs_review')
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

    def test_without_profile_two_explicit_decimal_observations_infer_layout(self):
        full, crop = observation('00123.4'), observation('00123.4', pass_name='crop')
        with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[full], [crop]]), \
             patch.object(paddle, 'numeric_candidates', return_value=[full]), \
             patch.object(worker, 'visible_row_ends', return_value=True):
            result = paddle.electric_request({'mode': 'auto', 'utility': 'electric'}, self.frame)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['reading']['displayText'], '00123.4')
        self.assertEqual(result['profileSource'], 'image')
        self.assertEqual(result['layoutEvidence']['method'], 'printed-decimal')
        self.assertEqual(result['config']['digits'], 6)
        self.assertEqual(result['config']['decimals'], 1)

    def test_without_profile_agreement_on_digits_alone_does_not_guess_scale(self):
        full, crop = observation('001234'), observation('001234', pass_name='crop')
        with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[full], [crop]]), \
             patch.object(paddle, 'numeric_candidates', return_value=[full]), patch.object(paddle, 'red_suffix', return_value=None):
            result = paddle.electric_request({'mode': 'auto', 'utility': 'electric'}, self.frame)
        self.assertEqual(result['status'], 'needs_review')
        self.assertIsNone(result['reading'])

    def test_disagreeing_printed_and_colored_decimal_evidence_is_refused(self):
        full, crop = observation('00123.4'), observation('00123.4', pass_name='crop')
        with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[full], [crop]]), \
             patch.object(paddle, 'numeric_candidates', return_value=[full]), \
             patch.object(paddle, 'red_suffix', return_value={'digits': 6, 'decimals': 2}):
            result = paddle.electric_request({'mode': 'auto', 'utility': 'electric'}, self.frame)
        self.assertEqual(result['status'], 'needs_review')
        self.assertIsNone(result['reading'])

    def test_visible_decimal_conflicting_with_confirmed_layout_is_refused(self):
        full, crop = observation('001234'), observation('001234', pass_name='crop')
        with patch.object(paddle, 'create_ocr'), patch.object(paddle, 'observations', side_effect=[[full], [crop]]), \
             patch.object(paddle, 'numeric_candidates', return_value=[full]), \
             patch.object(paddle, 'red_suffix', return_value={'digits': 6, 'decimals': 2}):
            result = paddle.electric_request(self.request, self.frame)
        self.assertEqual(result['status'], 'needs_review')
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

    def test_vietnamese_kwh_unit_variants_are_recognized_as_electric_context(self):
        unit = observation('kW.h', .92, [[.75, .25], [.95, .25], [.95, .45], [.75, .45]])
        row = observation('007664', .96, [[.15, .30], [.70, .30], [.70, .55], [.15, .55]])
        self.assertEqual(len(paddle.numeric_candidates([row, unit], self.frame, 6, 1, automatic=True)), 1)

    def test_rotated_electric_observation_mapping_preserves_valid_ccw_polygons(self):
        rows = [observation('007664', .96, [[.2, .3], [.7, .3], [.7, .5], [.2, .5]])]
        for angle in (90, 180, 270):
            mapped = paddle._map_rotated_observations(rows, angle)
            self.assertEqual(len(mapped), 1)
            pts = np.asarray(mapped[0]['corners'], dtype=np.float64)
            self.assertTrue((pts >= 0).all() and (pts <= 1).all())
            edges = np.roll(pts, -1, axis=0) - pts
            cross = edges[:, 0] * np.roll(edges, -1, axis=0)[:, 1] - edges[:, 1] * np.roll(edges, -1, axis=0)[:, 0]
            self.assertTrue(np.all(cross > 1e-8))

    def test_rotated_auto_fallback_reads_when_upright_has_no_kwh_context(self):
        portrait = Image.fromarray(np.random.default_rng(7).integers(20, 140, (320, 160, 3), dtype=np.uint8))
        rot_unit = observation('kWh', .95, [[.72, .35], [.92, .35], [.92, .55], [.72, .55]])
        rot_num = observation('00123.4', .95, [[.1, .35], [.7, .35], [.7, .55], [.1, .55]])
        crop = observation('00123.4', .95, pass_name='crop')
        with patch.object(paddle, 'create_ocr'), \
             patch.object(paddle, 'observations', side_effect=[[], [rot_num, rot_unit], [crop]]), \
             patch.object(worker, 'visible_row_ends', return_value=True):
            result = paddle.electric_request({'mode': 'auto', 'utility': 'electric'}, portrait)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['reading']['displayText'], '00123.4')
        self.assertEqual(result['profileSource'], 'image')

    def test_guide_box_roi_fallback_requires_kwh_context_and_two_clean_passes(self):
        unit = observation('kWh', .95, [[.75, .2], [.95, .2], [.95, .4], [.75, .4]])
        guided = observation('00123.4', .95, [[.1, .3], [.7, .3], [.7, .55], [.1, .55]], pass_name='region')
        crop = observation('00123.4', .95, pass_name='crop')
        req = {'mode': 'auto', 'utility': 'electric', 'guideBox': {'left': .1, 'top': .25, 'width': .65, 'height': .3}}
        with patch.object(paddle, 'create_ocr'), \
             patch.object(paddle, 'observations', side_effect=[[unit], [guided], [crop]]), \
             patch.object(worker, 'visible_row_ends', return_value=True):
            result = paddle.electric_request(req, self.frame)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['reading']['displayText'], '00123.4')


if __name__ == '__main__':
    unittest.main()
