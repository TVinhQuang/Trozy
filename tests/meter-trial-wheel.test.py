"""Focused offline tests; run with the project-local trial Python (no models)."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("wheel_reader", ROOT / "scripts/meter-trial/wheel_reader.py")
reader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reader)


def peak_probabilities(bins):
    values = np.full((len(bins), 100), 1e-9, dtype=np.float64)
    for row, position in enumerate(bins):
        values[row, position] = 1
    return values / values.sum(axis=1, keepdims=True)


class WheelTests(unittest.TestCase):
    def test_mechanical_carry_is_resolved_across_neighbours(self):
        # The tens wheel is at 1.8 while its neighbour is at 9.8.
        # A per-wheel nearest-digit classifier would round these to 020.
        value, _, bins = reader.wheel_decode(np.log(peak_probabilities([0, 18, 98])))
        self.assertEqual(bins, [0, 18, 98])
        self.assertEqual(value, 19.8)

    def test_leading_zero_and_rounding_are_separate_diagnostics(self):
        observation = reader.decode_probabilities(peak_probabilities([0, 18, 98]), 3)
        self.assertEqual(observation["unroundedDigits"], "019")
        self.assertEqual(observation["upstreamRoundedDigits"], "020")
        self.assertGreaterEqual(observation["rawValueLastWheelUnits"], 19.5)
        self.assertTrue(observation["requiresHumanReview"])

    def test_rounding_at_all_nines_is_explicit(self):
        observation = reader.decode_probabilities(peak_probabilities([98, 98]), 2)
        self.assertEqual(observation["unroundedDigits"], "99")
        self.assertEqual(observation["upstreamRoundedDigits"], "00")
        self.assertTrue(observation["upstreamRoundingWrapped"])

    def test_one_bad_wheel_is_not_hidden_by_confident_neighbours(self):
        probabilities = peak_probabilities([10, 20, 30])
        probabilities[1] = 0.01
        observation = reader.decode_probabilities(probabilities, 3)
        self.assertAlmostEqual(observation["confidence"], 0.09)

    def test_configured_count_mismatch_is_rejected_not_padded(self):
        with self.assertRaises(ValueError):
            reader.decode_probabilities(peak_probabilities([10, 20]), 3)
        for count in (0, -1, True, 13):
            with self.assertRaises(ValueError):
                reader.decode_probabilities(peak_probabilities([10]), count)

    def test_bad_crop_coordinates_are_rejected(self):
        image = Image.new("RGB", (100, 40))
        for box in ((0, 0, 101, 40), (-1, 0, 90, 40), (20, 0, 10, 20), (0.1, 0, 90, 40)):
            with self.assertRaises(ValueError):
                reader.validate_frame(image, box, 5)

    def test_preprocessing_preserves_red_wheel_dark_strokes(self):
        image = Image.new("RGB", (4, 4), "white")
        image.putpixel((1, 1), (255, 0, 0))
        cells = reader.wheel_cells(image, 1, width=4, height=4)
        self.assertEqual(cells.dtype, np.float32)
        self.assertEqual(float(cells[0, 1, 1]), 0)
        self.assertEqual(float(cells[0, 0, 0]), 1)

    def test_context_uses_neighbouring_pixels_not_a_repeated_tight_crop(self):
        # Identity resize makes the upstream half-cell geometry directly observable.
        # The first cell's context crosses the frame edge; only that edge repeats.
        ramp = np.tile(np.arange(8, dtype=np.uint8) * 32, (4, 1))
        image = Image.fromarray(np.repeat(ramp[:, :, None], 3, axis=2))
        context = reader.wheel_context_cells(image, (0, 0, 8, 4), 2, width=8, height=4)
        expected_first = np.array([0, 0, 0, 32, 64, 96, 128, 160], dtype=np.uint8)
        expected_last = np.array([64, 96, 128, 160, 192, 224, 224, 224], dtype=np.uint8)
        expected = []
        for row in (expected_first, expected_last):
            # Autocontrast endpoints, retaining positions in the context crop.
            stretched = ((row.astype(np.float64) - row.min()) * 255 / (row.max() - row.min())).astype(np.uint8)
            expected.append(np.tile(stretched, (4, 1)).astype(np.float32) / 255)
        np.testing.assert_array_equal(context, np.stack(expected))


if __name__ == "__main__":
    unittest.main()
