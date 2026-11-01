"""Production row refinement from detection geometry alone.

Ported from the frozen offline experiment. Its conservative geometry limits
are retained; the experiment and reports remain unchanged.

This fixed, bounded heuristic never receives reference digits, previous readings,
or WheelReader predictions. Numeric class names and ``u`` are used only as an
eligibility mask; their numeric values are discarded. Every configured wheel
must have a distinct detected box. There is no missing-box interpolation,
target-driven crop search, or best-answer candidate selection.
"""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np


METHOD = "stage1-digit-geometry-equal-grid-v1"
LIMITS = {
    "duplicate_iou": 0.40,
    "duplicate_center_share": 0.35,
    "seed_row_height_share": 0.45,
    "height_min_ratio": 0.65,
    "height_max_ratio": 1.55,
    "max_row_angle_degrees": 15.0,
    "max_vertical_residual_height_share": 0.25,
    "max_pitch_residual_share": 0.18,
    "min_adjacent_pitch_share": 0.65,
    "max_adjacent_pitch_share": 1.35,
    "max_digit_width_pitch_ratio": 1.40,
    "min_height_pitch_ratio": 0.60,
    "max_height_pitch_ratio": 3.50,
    "vertical_expansion": 1.15,
    "window_margin_height_share": 0.15,
    "max_input_detections": 100,
}


def _corners(value: Any) -> np.ndarray:
    points = np.asarray(value, dtype=np.float64)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise ValueError("Expected a finite four-corner box")
    hull = cv2.convexHull(points.astype(np.float32)).reshape(-1, 2)
    if len(hull) != 4 or cv2.contourArea(hull) <= 1:
        raise ValueError("Degenerate detection box")
    return hull.astype(np.float64)


def _window_axes(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    center = points.mean(axis=0)
    edges = np.roll(points, -1, axis=0) - points
    along = edges[int(np.linalg.norm(edges, axis=1).argmax())]
    along /= np.linalg.norm(along)
    if along[0] < -1e-8 or (abs(along[0]) <= 1e-8 and along[1] < 0):
        along *= -1
    down = np.array([-along[1], along[0]])
    return center, along, down


def _project(points: np.ndarray, origin: np.ndarray, along: np.ndarray, down: np.ndarray) -> np.ndarray:
    relative = points - origin
    return np.column_stack((relative @ along, relative @ down))


def _aabb_iou(first: dict, second: dict) -> float:
    a, b = first["bounds"], second["bounds"]
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    intersection = width * height
    return intersection / max(first["width"] * first["height"] + second["width"] * second["height"] - intersection, 1e-9)


def _same_box(first: dict, second: dict) -> bool:
    share = LIMITS["duplicate_center_share"]
    return (
        abs(first["x"] - second["x"]) <= share * min(first["width"], second["width"])
        and abs(first["y"] - second["y"]) <= share * min(first["height"], second["height"])
        and _aabb_iou(first, second) >= LIMITS["duplicate_iou"]
    )


def refine_row(
    window: dict | None,
    detections: list[dict],
    digits: int,
    image_size: tuple[int, int] | list[int] | None = None,
) -> dict[str, Any]:
    """Return one unambiguous contiguous equal-pitch row, or a refusal.

    ``window`` must already be the unambiguous selected window from the frozen
    detector output. ``digits`` is independent meter configuration. ``image_size``
    is (width, height). Returned corners retain the automatic window's geometric
    orientation, which is still ambiguous by 180 degrees. The caller must retain
    half-cell context by using ``rectify_window``, not cropping tightly to glyphs.
    """
    evidence: dict[str, Any] = {
        "configured_wheels": digits,
        "limits": LIMITS.copy(),
        "eligible_boxes": [],
        "excluded_box_count": 0,
        "deduplicated_box_count": 0,
        "accepted_grid_count": 0,
        "reference_digits_used": False,
        "predicted_digit_values_used": False,
        "missing_boxes_invented": False,
        "post_baseline_exploratory": True,
    }

    def reject(reason: str) -> dict[str, Any]:
        return {"status": "rejected", "corners": None, "reason": reason, "method": METHOD, "evidence": evidence}

    if isinstance(digits, bool) or not isinstance(digits, int) or not 2 <= digits <= 16:
        return reject("An independently configured wheel count from 2 to 16 is required")
    if not isinstance(window, dict):
        return reject("No unambiguous selected window was supplied")
    if not isinstance(detections, list) or len(detections) > LIMITS["max_input_detections"]:
        return reject("Detection count is outside the fixed trial limit")
    try:
        window_points = _corners(window["corners"])
        origin, along, down = _window_axes(window_points)
    except (KeyError, TypeError, ValueError):
        return reject("Selected window geometry is invalid")
    window_local = _project(window_points, origin, along, down)
    min_window, max_window = window_local.min(axis=0), window_local.max(axis=0)
    boxes = []
    for index, row in enumerate(detections):
        # The actual 0..9 class value never participates in any geometry score.
        name = str(row.get("class_name", "")).lower()
        if name != "u" and name not in {str(number) for number in range(10)}:
            evidence["excluded_box_count"] += 1
            continue
        try:
            points = _corners(row["corners"])
            center = points.mean(axis=0)
            if cv2.pointPolygonTest(window_points.astype(np.float32), tuple(center), False) < 0:
                evidence["excluded_box_count"] += 1
                continue
            local = _project(points, origin, along, down)
            low, high = local.min(axis=0), local.max(axis=0)
            width, height = high - low
            if width <= 1 or height <= 2:
                evidence["excluded_box_count"] += 1
                continue
            score = float(row.get("confidence", 0.0))
            if not math.isfinite(score):
                raise ValueError("Invalid detection confidence")
            box = {
                "source_indices": [index], "x": float((low[0] + high[0]) / 2),
                "y": float((low[1] + high[1]) / 2), "width": float(width), "height": float(height),
                "bounds": [float(low[0]), float(low[1]), float(high[0]), float(high[1])],
                "confidence": score,
            }
            boxes.append(box)
        except (KeyError, TypeError, ValueError):
            evidence["excluded_box_count"] += 1
    # Highest-confidence geometry represents overlapping alternative classes at
    # the same physical position. No numeric class voting is performed.
    kept = []
    for box in sorted(boxes, key=lambda row: (-row["confidence"], row["source_indices"][0])):
        duplicate = next((other for other in kept if _same_box(box, other)), None)
        if duplicate is None:
            kept.append(box)
        else:
            duplicate["source_indices"].extend(box["source_indices"])
            evidence["deduplicated_box_count"] += 1
    kept.sort(key=lambda row: row["x"])
    evidence["eligible_boxes"] = kept
    if len(kept) < digits:
        return reject("Fewer distinct detected digit boxes than configured wheels; missing boxes are not reconstructed")

    grids: dict[tuple[int, ...], dict] = {}
    index_axis = np.arange(digits, dtype=np.float64)
    for seed in kept:
        # Bounded row grouping, not arbitrary combinatorial subset searching.
        group = [row for row in kept if
                 LIMITS["height_min_ratio"] <= row["height"] / seed["height"] <= LIMITS["height_max_ratio"]
                 and abs(row["y"] - seed["y"]) <= LIMITS["seed_row_height_share"] * min(row["height"], seed["height"])]
        for start in range(max(0, len(group) - digits + 1)):
            candidate = group[start:start + digits]
            key = tuple(row["source_indices"][0] for row in candidate)
            if key in grids:
                continue
            xs = np.array([row["x"] for row in candidate])
            ys = np.array([row["y"] for row in candidate])
            heights = np.array([row["height"] for row in candidate])
            widths = np.array([row["width"] for row in candidate])
            median_height = float(np.median(heights))
            pitch, first = np.polyfit(index_axis, xs, 1)
            if pitch <= 1:
                continue
            pitch_error = float(np.max(np.abs(xs - (first + index_axis * pitch))) / pitch)
            gaps = np.diff(xs) / pitch
            if (pitch_error > LIMITS["max_pitch_residual_share"] or
                    gaps.min() < LIMITS["min_adjacent_pitch_share"] or gaps.max() > LIMITS["max_adjacent_pitch_share"]):
                continue
            if ((widths > pitch * LIMITS["max_digit_width_pitch_ratio"]).any() or
                    not LIMITS["min_height_pitch_ratio"] <= median_height / pitch <= LIMITS["max_height_pitch_ratio"] or
                    (heights < median_height * LIMITS["height_min_ratio"]).any() or
                    (heights > median_height * LIMITS["height_max_ratio"]).any()):
                continue
            slope, intercept = np.polyfit(xs, ys, 1)
            row_error = float(np.max(np.abs(ys - (slope * xs + intercept))) / median_height)
            if abs(math.degrees(math.atan(slope))) > LIMITS["max_row_angle_degrees"] or row_error > LIMITS["max_vertical_residual_height_share"]:
                continue
            left, right = float(first - pitch / 2), float(first + (digits - 0.5) * pitch)
            row_half_height = median_height * LIMITS["vertical_expansion"] / 2
            local_corners = np.array([
                [left, slope * left + intercept - row_half_height],
                [right, slope * right + intercept - row_half_height],
                [right, slope * right + intercept + row_half_height],
                [left, slope * left + intercept + row_half_height],
            ])
            tolerance = median_height * LIMITS["window_margin_height_share"]
            if (local_corners < min_window - tolerance).any() or (local_corners > max_window + tolerance).any():
                continue
            corners = origin + local_corners[:, :1] * along + local_corners[:, 1:] * down
            if image_size is not None:
                try:
                    width_image, height_image = image_size
                    if not math.isfinite(width_image) or not math.isfinite(height_image) or min(width_image, height_image) <= 0:
                        raise ValueError("Invalid image size")
                except (TypeError, ValueError):
                    return reject("Invalid source image size")
                if ((corners[:, 0] < 0).any() or (corners[:, 0] > width_image).any()
                        or (corners[:, 1] < 0).any() or (corners[:, 1] > height_image).any()):
                    continue
            grids[key] = {
                "corners": corners.tolist(), "source_indices": [row["source_indices"] for row in candidate],
                "pitch": float(pitch), "median_digit_height": median_height,
                "pitch_residual_share": pitch_error, "vertical_residual_height_share": row_error,
                "row_angle_relative_window_degrees": float(math.degrees(math.atan(slope))),
            }
    evidence["accepted_grid_count"] = len(grids)
    if not grids:
        return reject("No complete contiguous equal-pitch row satisfies the fixed geometry limits")
    if len(grids) > 1:
        evidence["candidate_source_indices"] = [row["source_indices"] for row in grids.values()]
        return reject("Multiple complete geometric grids remain; no best-answer or confidence tie-break selection")
    selected = next(iter(grids.values()))
    evidence["selected_grid"] = {key: value for key, value in selected.items() if key != "corners"}
    return {
        "status": "selected", "corners": selected["corners"], "reason": None, "method": METHOD,
        "evidence": evidence, "orientation_ambiguous_by_half_turn": True,
    }
