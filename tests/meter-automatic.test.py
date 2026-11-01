"""Automatic inference must refuse ambiguity without inventing a layout/value."""
import base64
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/ai'))
import meter_reader_worker as worker


class AutomaticWorkerTests(unittest.TestCase):
    def setUp(self):
        self.frame = Image.new('RGB', (400, 240), '#888888')

    def test_missing_profile_never_guesses_count_or_decimal_boundary(self):
        encoded = io.BytesIO(); self.frame.save(encoded, format='PNG')
        with patch.object(worker, 'detect', side_effect=AssertionError('must not run')):
            result = worker.process_request({'protocol': 1, 'mode': 'auto', 'utility': 'water',
                'image': base64.b64encode(encoded.getvalue()).decode()})
        self.assertEqual(result['status'], 'needs_setup')
        self.assertIsNone(result['reading'])
        self.assertIsNone(result['config'])
        self.assertIsNone(result['profileSource'])

    def test_profile_cannot_supply_old_geometry_or_expected_digits(self):
        for profile in [{'digits': 8, 'decimals': 3, 'corners': []}, {'digits': 6, 'decimals': 1, 'reading': '007664'},
                        {'digits': True, 'decimals': 0}, {'digits': 4, 'decimals': 4}, {'digits': 10, 'decimals': 0}]:
            with self.assertRaises(ValueError):
                worker.automatic({'utility': 'water', 'profile': profile}, self.frame)

    def test_multiple_windows_or_missing_window_do_not_select_an_arbitrary_crop(self):
        for status in ['ambiguous_window', 'no_window', 'invalid_window']:
            with patch.object(worker, 'detect', return_value={'status': status}), \
                 patch.object(worker, 'WheelReader', side_effect=AssertionError('must not read')):
                result = worker.automatic({'utility': 'water', 'profile': {'digits': 6, 'decimals': 1}}, self.frame)
            self.assertEqual(result['status'], 'needs_review')
            self.assertIsNone(result['reading'])
            self.assertIsNone(result['config'])

    def test_geometry_refusal_never_falls_back_to_broad_window(self):
        located = {'status': 'selected', 'selected': {'corners': []}, 'detections': []}
        with patch.object(worker, 'detect', return_value=located), \
             patch.object(worker, 'refine_row', return_value={'status': 'rejected'}) as refine, \
             patch.object(worker, 'WheelReader', side_effect=AssertionError('must not read')):
            result = worker.automatic({'utility': 'water', 'profile': {'digits': 8, 'decimals': 3}}, self.frame)
        self.assertEqual(refine.call_args.args[2], 8)
        self.assertEqual(result['status'], 'needs_review')
        self.assertIsNone(result['reading'])

    def test_reading_direction_needs_unique_evidence_and_margin(self):
        def result(status, confidence, text='123'):
            return {'status': status, 'confidence': confidence,
                    'reading': {'digits': text} if status == 'ready' else None}
        choose = worker.select_direction
        self.assertEqual(choose([result('ready', .95), result('needs_review', .3)]), 0)
        self.assertEqual(choose([result('needs_review', .3), result('ready', .95)]), 1)
        self.assertIsNone(choose([result('ready', .71), result('needs_review', .69)]))
        self.assertIsNone(choose([result('ready', .99), result('ready', .8, '456')]))
        self.assertIsNone(choose([result('needs_review', .6), result('needs_review', .3)]))
        self.assertEqual(choose([result('ready', .95), result('ready', .8)]), 0)

    def test_automatic_corners_keep_chosen_direction_and_confirmed_count(self):
        corners = [[80, 70], [320, 70], [320, 110], [80, 110]]
        located = {'status': 'selected', 'selected': {}, 'detections': []}
        refused = {'status': 'needs_review', 'confidence': .2, 'reading': None, 'quality': {}}
        ready = {'status': 'ready', 'confidence': .95, 'reading': {'digits': '00001056'}, 'quality': {}}
        with patch.object(worker, 'detect', return_value=located), \
             patch.object(worker, 'refine_row', return_value={'status': 'selected', 'corners': corners}), \
             patch.object(worker, 'WheelReader'), \
             patch.object(worker, 'read_prepared', side_effect=[refused, ready]) as read:
            result = worker.automatic({'utility': 'water', 'profile': {'digits': 8, 'decimals': 3}}, self.frame)
        self.assertEqual(read.call_args_list[0].args[0], {'digits': 8, 'decimals': 3, 'utility': 'water'})
        self.assertEqual(result['automation']['orientation'], 180)
        self.assertEqual(result['config']['corners'][0], [.8, 110/240])
        self.assertEqual(result['profileSource'], 'confirmed')
        self.assertFalse(result['configNeedsConfirmation'])


if __name__ == '__main__':
    unittest.main()
