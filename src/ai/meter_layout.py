"""Image-only meter layout evidence; never receives readings or reference values.

The colour rule deliberately supports a clear red fractional suffix only. An
unmarked or faded decimal boundary remains unknown instead of becoming zero.
"""
from __future__ import annotations

import re
import cv2
import numpy as np

RED_MIN = .015
RED_MAX_INTEGER = .008
NEUTRAL_MIN = .15


def red_suffix(prepared, digits, count_source):
    """Measure central cell pixels before wheel-reader colour removal."""
    row = np.asarray(prepared['image'].crop(prepared['row_box']).convert('RGB'))
    cells = []
    for index in range(digits):
        left, right = round((index + .12) * row.shape[1] / digits), round((index + .88) * row.shape[1] / digits)
        top, bottom = round(row.shape[0] * .12), round(row.shape[0] * .88)
        part = row[top:max(top + 1, bottom), left:max(left + 1, right)]
        if not part.size:
            return None
        hsv = cv2.cvtColor(np.ascontiguousarray(part), cv2.COLOR_RGB2HSV)
        red = ((hsv[:, :, 0] <= 12) | (hsv[:, :, 0] >= 170)) & (hsv[:, :, 1] >= 70) & (hsv[:, :, 2] >= 55)
        # A clear black/white wheel provides neutral pixels even with glare.
        neutral = hsv[:, :, 1] <= 65
        cells.append({'index': index, 'redShare': float(red.mean()), 'neutralShare': float(neutral.mean())})
    states = [1 if cell['redShare'] >= RED_MIN else 0 if cell['redShare'] <= RED_MAX_INTEGER and cell['neutralShare'] >= NEUTRAL_MIN else -1 for cell in cells]
    if -1 in states or 1 not in states or states[0] != 0:
        return None
    first = states.index(1)
    if any(value != 1 for value in states[first:]):
        return None
    decimals = digits - first
    if decimals > 4 or first > 9:
        return None
    return {'version': 1, 'source': 'image', 'method': 'red-suffix', 'digits': digits,
            'decimals': decimals, 'cells': cells, 'separatorTexts': [],
            'countSource': count_source, 'complete': True}


def printed_decimal(texts, count_source='ocr-line'):
    if len(texts) != 2:
        return None
    compact = [re.sub(r'\s', '', text) for text in texts]
    if compact[0] != compact[1] or not re.fullmatch(r'[0-9]{1,9}\.[0-9]{1,4}', compact[0]):
        return None
    integer, fraction = compact[0].split('.')
    digits = len(integer) + len(fraction)
    if not 3 <= digits <= 12:
        return None
    return {'version': 1, 'source': 'image', 'method': 'printed-decimal', 'digits': digits,
            'decimals': len(fraction), 'cells': [], 'separatorTexts': compact,
            'countSource': count_source, 'complete': True}


def detected_grid(window, detections, frame_size, refine):
    """Count all distinct digit boxes in one window, never search for an answer.

    Asking the geometry routine for two cells exposes its deduplicated boxes.
    The final call must consume every one, so a shorter subsequence cannot win.
    """
    probe = refine(window, detections, 2, frame_size)
    boxes = probe.get('evidence', {}).get('eligible_boxes', [])
    digits = len(boxes)
    if not 3 <= digits <= 12:
        return None
    refined = refine(window, detections, digits, frame_size)
    if refined.get('status') != 'selected':
        return None
    selected = refined.get('evidence', {}).get('selected_grid', {}).get('source_indices', [])
    if len(selected) != digits:
        return None
    # Missing first/last boxes must not silently shorten a wide detector window.
    points = np.asarray(window['corners'], dtype=np.float64)
    edges = np.roll(points, -1, axis=0) - points
    along = edges[np.linalg.norm(edges, axis=1).argmax()]
    along /= np.linalg.norm(along)
    source = points @ along
    fitted = np.asarray(refined['corners']) @ along
    pitch = refined['evidence']['selected_grid']['pitch']
    if fitted.min() - source.min() > .75 * pitch or source.max() - fitted.max() > .75 * pitch:
        return None
    return digits, refined
