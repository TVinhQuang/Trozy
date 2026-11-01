"""Independent geometry-only row refinement cases, without reference readings."""

import importlib.util
from pathlib import Path
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("meter_trial_row", ROOT / "scripts/meter-trial/row_geometry.py")
row_geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(row_geometry)


def box(cx, cy, width=16, height=36, name="8", confidence=0.9):
    return {"class_name": name, "confidence": confidence, "corners": [
        [cx - width / 2, cy - height / 2], [cx + width / 2, cy - height / 2],
        [cx + width / 2, cy + height / 2], [cx - width / 2, cy + height / 2],
    ]}


WINDOW = {"corners": [[10, 10], [250, 10], [250, 100], [10, 100]], "class_name": "window"}


def row():
    return [box(45 + index * 30, 48) for index in range(6)]


class RowTests(unittest.TestCase):
    def test_complete_row_fits_cells_instead_of_broad_unit_window(self):
        result = row_geometry.refine_row(WINDOW, row(), 6, [300, 150])
        self.assertEqual(result["status"], "selected")
        corners = np.asarray(result["corners"])
        self.assertAlmostEqual(corners[:, 0].min(), 30)
        self.assertAlmostEqual(corners[:, 0].max(), 210)
        self.assertEqual(result["evidence"]["accepted_grid_count"], 1)
        self.assertFalse(result["evidence"]["predicted_digit_values_used"])

    def test_off_row_units_or_tiny_extra_detection_do_not_shift_grid(self):
        baseline = row_geometry.refine_row(WINDOW, row(), 6)
        extras = [box(220, 85, name="1"), box(230, 48, width=8, height=10, name="0"), box(215, 48, name="kWh")]
        result = row_geometry.refine_row(WINDOW, row() + extras, 6)
        self.assertEqual(result["status"], "selected")
        np.testing.assert_allclose(result["corners"], baseline["corners"])

    def test_numeric_values_do_not_affect_any_selected_geometry(self):
        first = row()
        second = [dict(item, class_name=str(index)) for index, item in enumerate(first)]
        a = row_geometry.refine_row(WINDOW, first, 6)
        b = row_geometry.refine_row(WINDOW, second, 6)
        self.assertEqual(a["status"], "selected")
        self.assertEqual(a, b)

    def test_overlapping_alternative_classes_are_one_physical_box(self):
        detections = row() + [box(105.5, 48.5, name="u", confidence=0.7)]
        result = row_geometry.refine_row(WINDOW, detections, 6)
        self.assertEqual(result["status"], "selected")
        self.assertEqual(result["evidence"]["deduplicated_box_count"], 1)

    def test_missing_box_is_never_padded(self):
        result = row_geometry.refine_row(WINDOW, row()[:-1], 6)
        self.assertEqual(result["status"], "rejected")
        self.assertIn("missing boxes", result["reason"])
        self.assertIsNone(result["corners"])

    def test_gap_from_missing_box_plus_stray_cannot_be_interpolated(self):
        detections = [box(35 + index * 25, 48) for index in (0, 1, 2, 4, 5, 6)]
        result = row_geometry.refine_row(WINDOW, detections, 6)
        self.assertEqual(result["status"], "rejected")

    def test_seven_contiguous_boxes_cannot_select_six_by_reading(self):
        detections = [box(35 + index * 28, 48) for index in range(7)]
        result = row_geometry.refine_row(WINDOW, detections, 6)
        self.assertEqual(result["status"], "rejected")
        self.assertGreater(result["evidence"]["accepted_grid_count"], 1)
        self.assertIn("Multiple", result["reason"])

    def test_no_selected_window_and_source_boundary_are_refused(self):
        self.assertEqual(row_geometry.refine_row(None, row(), 6)["status"], "rejected")
        self.assertEqual(row_geometry.refine_row(WINDOW, row(), 6, [100, 50])["status"], "rejected")

    def test_two_physical_rows_stay_ambiguous(self):
        tall_window = {"corners": [[10, 0], [250, 0], [250, 150], [10, 150]]}
        detections = [box(45 + index * 30, height, height=30) for height in (35, 110) for index in range(6)]
        result = row_geometry.refine_row(tall_window, detections, 6)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["evidence"]["accepted_grid_count"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
