"""Geometry/selection regressions for the isolated meter trial; no model downloads."""

import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace
import unittest

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("meter_trial_yolo", ROOT / "scripts/meter-trial/yolo_detector.py")
yolo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(yolo)


COLORS = np.array([[230, 20, 20], [20, 220, 30], [20, 40, 230], [230, 210, 20], [210, 20, 210]], dtype=np.uint8)


def landmark_frame(corners, width=400, height=230, count=4):
    """A synthetic strip with independently known colored left-to-right cells."""
    sheet_width, sheet_height = count * 80, 64
    sheet = np.zeros((sheet_height, sheet_width, 3), dtype=np.uint8)
    for index in range(count):
        sheet[:, index * 80:(index + 1) * 80] = COLORS[index]
    source = np.array([[0, 0], [sheet_width, 0], [sheet_width, sheet_height], [0, sheet_height]], dtype=np.float32)
    transform = cv2.getPerspectiveTransform(source, np.asarray(corners, dtype=np.float32))
    frame = cv2.warpPerspective(sheet, transform, (width, height), flags=cv2.INTER_NEAREST)
    return frame


class GeometryTests(unittest.TestCase):
    def assert_cell_colors(self, result, count=4):
        pixels = np.asarray(result["image"])
        left, top, right, bottom = result["row_box"]
        for index in range(count):
            x = round(left + (index + 0.5) * (right - left) / count)
            center = pixels[round((top + bottom) / 2), x]
            self.assertLess(np.abs(center.astype(int) - COLORS[index].astype(int)).max(), 8)

    def test_tilted_manual_row_restores_landmarks_and_keeps_context(self):
        corners = [[60, 45], [345, 85], [325, 150], [50, 110]]
        source = landmark_frame(corners)
        before = source.copy()
        result = yolo.rectify_manual(Image.fromarray(source), {"corners": corners}, 4)
        self.assert_cell_colors(result)
        left, top, right, bottom = result["row_box"]
        self.assertEqual(left, math.ceil((right - left) / 8))
        self.assertGreater(top, 0)
        self.assertEqual(result["image"].width, right + left)
        self.assertEqual(result["geometry"]["source_corners"], corners)
        self.assertFalse(result["geometry"]["orientation_ambiguous_by_half_turn"])
        np.testing.assert_array_equal(source, before)

    def test_reversed_reading_order_is_preserved_from_annotation(self):
        # An independently annotated 180-degree row: reading-left lies image-right.
        corners = [[345, 150], [55, 110], [65, 45], [355, 85]]
        result = yolo.rectify_manual(landmark_frame(corners), {"corners": corners}, 4)
        self.assert_cell_colors(result)
        self.assertEqual(result["geometry"]["source_corners"], corners)

    def test_weathered_vertical_annotation_preserves_reading_order(self):
        manifest_path = ROOT / "docs/test/fixtures/visionstate-yolo-samples.json"
        import json

        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        sample = next(item for item in manifest["samples"] if item["id"] == "water-weathered")
        corners = sample["manualRegion"]["corners"]
        size = sample["sourceSize"]
        source = landmark_frame(corners, width=size["width"], height=size["height"], count=5)
        result = yolo.rectify_manual(source, sample["manualRegion"], 5)
        self.assert_cell_colors(result, count=5)
        self.assertEqual(result["geometry"]["source_corners"], corners)
        self.assertGreater(result["geometry"]["row_width"], result["geometry"]["row_height"] * 3)

    def test_half_turn_is_explicit_and_flips_real_pixels_with_row_bounds(self):
        corners = [[60, 45], [345, 85], [325, 150], [50, 110]]
        source = landmark_frame(corners)
        normal = yolo.rectify_manual(source, {"corners": corners}, 4)
        flipped = yolo.rectify_manual(source, {"corners": corners}, 4, half_turn=True)
        np.testing.assert_array_equal(np.asarray(flipped["image"]), np.asarray(normal["image"])[::-1, ::-1])
        width, height = normal["image"].size
        left, top, right, bottom = normal["row_box"]
        self.assertEqual(flipped["row_box"], (width - right, height - bottom, width - left, height - top))
        self.assertTrue(flipped["geometry"]["half_turn"])

    def test_obb_order_is_geometric_and_half_turn_stays_ambiguous(self):
        corners = [[60, 45], [345, 85], [325, 150], [50, 110]]
        source = landmark_frame(corners)
        result = yolo.rectify_window(source, {"corners": list(reversed(corners))}, 4)
        self.assert_cell_colors(result)
        self.assertTrue(result["geometry"]["orientation_ambiguous_by_half_turn"])
        self.assertFalse(result["geometry"]["perspective_observed"])

    def test_source_boundary_context_is_reported_without_faking_a_full_row(self):
        source = np.full((80, 240, 3), 180, dtype=np.uint8)
        result = yolo.rectify_manual(source, [0, 10, 220, 60], 4)
        self.assertTrue(result["geometry"]["context_crosses_source_boundary"])
        with self.assertRaisesRegex(ValueError, "outside"):
            yolo.rectify_manual(source, [-10, 10, 220, 60], 4)

    def test_invalid_geometry_and_invalid_grid_are_rejected(self):
        source = np.zeros((240, 400, 3), dtype=np.uint8)
        invalid = [
            {"corners": [[20, 20], [200, 20], [20, 80], [200, 80]]},  # crossing order
            {"corners": [[20, 20], [200, 20], [200, 20], [20, 80]]},  # repeated corner
            {"corners": [[20, 20], [200, 20], [50, 40], [20, 80]]},  # concave
            [20, 20, 25, 100],
            [20, 20, float("nan"), 80],
        ]
        for region in invalid:
            with self.subTest(region=region), self.assertRaises(ValueError):
                yolo.rectify_manual(source, region, 4)
        for count in (0, 17, True, 2.5):
            with self.subTest(count=count), self.assertRaises(ValueError):
                yolo.rectify_manual(source, [20, 20, 200, 80], count)


class ArrayTensor:
    def __init__(self, values):
        self.values = np.asarray(values)

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.values


def fake_detector(windows):
    obb = None
    if windows:
        obb = SimpleNamespace(
            xyxyxyxy=ArrayTensor(windows), xywhr=ArrayTensor([[0, 0, 100, 20, 0]] * len(windows)),
            conf=ArrayTensor([0.92] * len(windows)), cls=ArrayTensor([1] * len(windows)),
        )
    received = []

    def predict(**kwargs):
        received.append(kwargs)
        return [SimpleNamespace(obb=obb, names={1: "window"})]

    detector = object.__new__(yolo.YoloWindowDetector)
    detector.model = SimpleNamespace(predict=predict)
    detector.image_size, detector.confidence, detector.iou = 640, 0.25, 0.45
    return detector, received


class SelectionTests(unittest.TestCase):
    def test_two_windows_stay_ambiguous_instead_of_choosing_largest(self):
        detector, _ = fake_detector([
            [[20, 20], [130, 20], [130, 50], [20, 50]],
            [[150, 90], [350, 90], [350, 150], [150, 150]],
        ])
        result = detector.detect(np.zeros((240, 400, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "ambiguous_window")
        self.assertIsNone(result["selected"])
        self.assertEqual(len(result["windows"]), 2)

    def test_single_window_uses_rgb_reference_runtime_without_saving(self):
        detector, received = fake_detector([[[20, 20], [200, 20], [200, 65], [20, 65]]])
        rgb = np.zeros((100, 240, 3), dtype=np.uint8)
        rgb[:, :] = COLORS[0]
        result = detector.detect(rgb)
        self.assertEqual(result["status"], "selected")
        np.testing.assert_array_equal(np.asarray(received[0]["source"]), rgb)
        self.assertEqual(received[0]["source"].mode, "RGB")
        self.assertFalse(received[0]["save"])
        self.assertFalse(received[0]["rect"])
        self.assertEqual(received[0]["device"], "cpu")

    def test_no_window_and_clipped_window_are_not_selected(self):
        source = np.zeros((100, 240, 3), dtype=np.uint8)
        empty, _ = fake_detector([])
        self.assertEqual(empty.detect(source)["status"], "no_window")
        clipped, _ = fake_detector([[[-10, 20], [200, 20], [200, 65], [-10, 65]]])
        result = clipped.detect(source)
        self.assertEqual(result["status"], "invalid_window")
        self.assertIsNone(result["selected"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
