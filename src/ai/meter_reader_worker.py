"""Bounded local meter inference worker. Reads one JSON request and exits.

The application authorizes evidence before invoking this process. No downloads,
database access or invoice/reading writes exist here. Automatic inference uses
image-derived layout evidence or an existing confirmed meter configuration,
and rejects ambiguous geometry or direction.
"""
from __future__ import annotations

import base64
import contextlib
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import warnings

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / '.runtime/meter-digits/visionstate-yolo'
sys.path.insert(0, str(Path(__file__).resolve().parent))
if os.environ.get('TROZY_METER_ENGINE') == 'paddleocr':
    packages = (ROOT / '.runtime/paddleocr/site-packages').resolve()
    if not packages.is_relative_to(ROOT):
        raise RuntimeError('PaddleOCR dependencies must stay inside the project.')
    sys.path.insert(0, str(packages))
os.environ.update({'YOLO_AUTOINSTALL': 'false', 'YOLO_OFFLINE': 'true',
                   'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1'})

import numpy as np
from PIL import Image, ImageOps
from meter_wheels import WheelReader, MODEL_SHA256
from meter_geometry import rectify_manual, YoloWindowDetector, _ordered_corners
from meter_row_geometry import refine_row
from meter_layout import detected_grid, red_suffix

Image.MAX_IMAGE_PIXELS = 12_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
YOLO_HASH = 'e02e60b02f4f24321390782de099079cbc3b060b4a8894adb00794126470ef16'
_DETECTOR = None
_WHEEL_READER = None


def _get_detector():
    global _DETECTOR
    if _DETECTOR is None:
        path = RUNTIME / 'models/water/trozy_water_yolov8_obb.pt'
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != YOLO_HASH:
            raise RuntimeError('Model tìm vùng số chưa sẵn sàng.')
        _DETECTOR = YoloWindowDetector(path)
    return _DETECTOR


def _get_wheel_reader():
    global _WHEEL_READER
    if _WHEEL_READER is None or type(_WHEEL_READER) is not WheelReader:
        _WHEEL_READER = WheelReader(RUNTIME / 'models/water/wheels-v2.onnx')
    return _WHEEL_READER


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def read_image(request):
    encoded = request.get('image')
    if not isinstance(encoded, str) or len(encoded) > 56_000_000:
        raise ValueError('Ảnh vượt giới hạn xử lý.')
    data = base64.b64decode(encoded, validate=True)
    if not 0 < len(data) <= 40 * 1024 * 1024:
        raise ValueError('Ảnh vượt giới hạn xử lý.')
    with Image.open(io.BytesIO(data)) as source:
        if source.format != 'PNG' or getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Bộ đọc chỉ nhận ảnh PNG đã chuẩn hóa từ máy chủ.')
        if not (1 <= source.width <= 8000 and 1 <= source.height <= 8000 and source.width * source.height <= 12_000_000):
            raise ValueError('Kích thước ảnh không được hỗ trợ.')
        source.load()
        return ImageOps.exif_transpose(source).convert('RGB')


def normalized_corners(value, frame):
    if not isinstance(value, list) or len(value) != 4:
        raise ValueError('Chọn đủ bốn góc vùng hàng số.')
    for point in value:
        if not isinstance(point, list) or len(point) != 2 or any(type(x) not in (int, float) or not math.isfinite(x) or not 0 <= x <= 1 for x in point):
            raise ValueError('Vùng hàng số không hợp lệ.')
    points = np.asarray(value, dtype=np.float64)
    edges = np.roll(points, -1, axis=0) - points
    cross = edges[:, 0] * np.roll(edges, -1, axis=0)[:, 1] - edges[:, 1] * np.roll(edges, -1, axis=0)[:, 0]
    if not np.all(cross > 1e-8):
        raise ValueError('Bốn góc phải đi quanh hàng số đúng thứ tự, không chéo hoặc lật gương.')
    return (points * [frame.width, frame.height]).tolist()


def quality_for(prepared, digits):
    row = prepared['image'].crop(prepared['row_box'])
    gray = row.convert('L')
    values = np.asarray(gray, dtype=np.float64)
    mean, contrast = float(values.mean()), float(values.std())
    # Evaluate edges at at most the reader's 32x48 per-wheel scale. Otherwise
    # a larger, usable photo has lower Laplacian energy merely because the same
    # stroke spans more source pixels. Never upscale a small/blurred source.
    scale = min(1.0, 32 * digits / row.width, 48 / row.height)
    edge_gray = gray.resize((max(1, round(row.width * scale)), max(1, round(row.height * scale))), Image.Resampling.LANCZOS) if scale < 1 else gray
    edges = np.asarray(edge_gray, dtype=np.float64)
    if min(edges.shape) >= 3:
        lap = 4 * edges[1:-1, 1:-1] - edges[1:-1, :-2] - edges[1:-1, 2:] - edges[:-2, 1:-1] - edges[2:, 1:-1]
        energy = float(lap.var())
    else:
        energy = 0.0
    checks = {'resolution': row.width / digits >= 12 and row.height >= 24,
              'exposure': 20 <= mean <= 245 and float((values < 18).mean()) < .94 and float((values > 245).mean()) < .94,
              'contrast': contrast >= 20, 'sharpness': energy >= 45}
    messages = {'resolution': 'Vùng số quá nhỏ. Chụp gần hơn và giữ đủ các bánh số.',
                'exposure': 'Vùng số quá tối hoặc quá sáng. Điều chỉnh ánh sáng rồi chụp lại.',
                'contrast': 'Các nét số chưa tách rõ khỏi nền. Chọn lại vùng hoặc chụp rõ hơn.',
                'sharpness': 'Vùng số chưa đủ nét. Giữ máy yên và chụp lại.'}
    quality = {'canRead': all(checks.values()), 'checks': checks,
               'metrics': {'width': row.width, 'height': row.height, 'cellWidth': row.width / digits,
                           'meanLuma': mean, 'contrast': contrast, 'edgeEnergy': energy}}
    return quality, [messages[key] for key, passed in checks.items() if not passed]


def locate(frame):
    result = detect(frame)
    candidates = []
    for item in result['windows'][:8]:
        corners = _ordered_corners(item['corners']) / [frame.width, frame.height]
        if np.isfinite(corners).all() and (corners >= 0).all() and (corners <= 1).all():
            candidates.append({'corners': corners.tolist(), 'confidence': item['confidence']})
    return {'width': frame.width, 'height': frame.height, 'status': result['status'],
            'candidates': candidates, 'warnings': ['Kiểm tra đủ bánh số, chiều đọc và phần lẻ trước khi xác nhận vùng.'],
            'model': 'watermeter-yolov8-obb', 'modelDigest': YOLO_HASH}


def detect(frame):
    return _get_detector().detect(frame)


def validate_config(digits, decimals, utility):
    if not integer(digits, 1, 12) or not integer(decimals, 0, 4) or decimals >= digits or digits - decimals > 9:
        raise ValueError('Cấu hình số bánh hoặc số chữ số phần lẻ không hợp lệ.')
    if utility not in ('electric', 'water'):
        raise ValueError('Loại công tơ không hợp lệ.')


def read_region(request, frame):
    digits, decimals = request.get('digits'), request.get('decimals')
    validate_config(digits, decimals, request.get('utility'))
    corners = normalized_corners(request.get('corners'), frame)
    prepared = rectify_manual(frame, {'corners': corners}, digits)
    return read_prepared(request, frame, prepared)


def read_prepared(request, frame, prepared, reader=None):
    digits, decimals = request['digits'], request['decimals']
    quality, messages = quality_for(prepared, digits)
    result = {'width': frame.width, 'height': frame.height, 'status': 'retake', 'reading': None,
              'confidence': 0, 'warnings': messages, 'quality': quality, 'cells': [],
              'model': 'wheels-v2', 'modelDigest': MODEL_SHA256}
    if not quality['canRead']:
        return result
    reader = reader or WheelReader(RUNTIME / 'models/water/wheels-v2.onnx')
    observation = reader.read(prepared['image'], tuple(prepared['row_box']), digits)
    result['confidence'] = observation['confidence']
    result['cells'] = [{'index': item['index'], 'position': item['position'], 'confidence': item['probability'],
                        'alternatives': [{'position': pair[0], 'confidence': pair[1]} for pair in item['top']]}
                       for item in observation['perWheel']]
    result['status'] = 'needs_review'
    if observation['confidence'] < .7:
        result['warnings'] = ['Có bánh số chưa rõ. Chọn lại vùng hoặc nhập tay sau khi xem ảnh gốc.']
        return result
    if observation['upstreamRoundingWrapped'] or prepared['geometry']['context_crosses_source_boundary']:
        result['warnings'] = ['Cần kiểm tra trực tiếp vùng số hoặc hiện tượng chuyển vòng; chưa có đề xuất.']
        return result
    text = observation['upstreamRoundedDigits']
    integer_digits = text[:-decimals] if decimals else text
    fractional_digits = text[-decimals:] if decimals else ''
    result['reading'] = {'digits': text, 'displayText': integer_digits + ('.' + fractional_digits if decimals else ''),
                         'integerDigits': integer_digits, 'fractionalDigits': fractional_digits,
                         'integerValue': int(integer_digits), 'unit': 'kWh' if request['utility'] == 'electric' else 'm3'}
    result['status'] = 'ready'
    result['warnings'] = ['Đây là đề xuất từ ảnh. Chủ nhà phải đối chiếu từng ô và phần lẻ trước khi lưu.']
    return result


def select_direction(results):
    """Require a unique strong direction or identical readings in both directions.

    The 0.15 separation is a conservative ambiguity guard, not a calibrated
    accuracy claim. No expected reading or previous period enters this choice.
    """
    ready = [index for index, result in enumerate(results) if result['status'] == 'ready']
    if len(ready) == 2 and results[0]['reading'] == results[1]['reading']:
        return 0
    if len(ready) != 1:
        return None
    index = ready[0]
    if results[index]['confidence'] - results[1 - index]['confidence'] < .15:
        return None
    return index


def _map_rotated_crop(located, left, top, crop_size, angle):
    cw, ch = crop_size
    def map_corners(corners):
        arr = np.asarray(corners, dtype=np.float64)
        if angle == 0:
            mapped = arr
        elif angle == 90:
            mapped = np.column_stack([cw - arr[:, 1], arr[:, 0]])
        elif angle == 180:
            mapped = np.column_stack([cw - arr[:, 0], ch - arr[:, 1]])
        elif angle == 270:
            mapped = np.column_stack([arr[:, 1], ch - arr[:, 0]])
        else:
            raise ValueError('Unsupported rotation angle')
        return (mapped + [left, top]).tolist()
    return {
        **located,
        'selected': {**located['selected'], 'corners': map_corners(located['selected']['corners'])},
        'detections': [{**item, 'corners': map_corners(item['corners'])} for item in located['detections']],
    }


def _iter_detect_in_crop(frame, box, vertical=False, angles=None):
    left, top, right, bottom = box
    if right - left < 24 or bottom - top < 24:
        return
    crop = frame.crop((left, top, right, bottom))
    for angle in (angles if angles is not None else ((90, 270, 0) if vertical else (0,))):
        view = crop if angle == 0 else crop.transpose(
            Image.Transpose.ROTATE_90 if angle == 90 else Image.Transpose.ROTATE_270
        )
        zoomed = detect(view)
        if zoomed['status'] == 'selected':
            yield angle, _map_rotated_crop(zoomed, left, top, crop.size, angle)


def _detect_in_crop(frame, box, vertical=False):
    for _, mapped in _iter_detect_in_crop(frame, box, vertical=vertical):
        return mapped
    return None


def _window_zoom_box(frame, located):
    points = np.asarray(located['selected'].get('corners', []), dtype=np.float64)
    if points.ndim != 2 or points.shape[0] < 4:
        return None, False
    low, high = points.min(axis=0), points.max(axis=0)
    bw, bh = high - low
    vertical = bool(bh > bw * 1.15)
    margin = (high - low) * ([.45, .20] if vertical else [.20, .45])
    left, top = np.maximum(0, np.floor(low - margin)).astype(int)
    right, bottom = np.minimum(frame.size, np.ceil(high + margin)).astype(int)
    if right <= left or bottom <= top:
        return None, vertical
    return (int(left), int(top), int(right), int(bottom)), vertical


def zoomed_detection(frame, located):
    """A second original-resolution locator view can recover a faint end wheel."""
    box, vertical = _window_zoom_box(frame, located)
    return _detect_in_crop(frame, box, vertical=vertical) if box is not None else None


def zoomed_candidates(frame, located):
    """Try aspect-aware window zoom (all upright angles) then full-meter crop zoom."""
    first = zoomed_detection(frame, located)
    if first is not None:
        yield first
        box, vertical = _window_zoom_box(frame, located)
        if vertical and box is not None:
            for _, mapped in _iter_detect_in_crop(frame, box, vertical=True, angles=(270, 0)):
                yield mapped
    meters = [item for item in located.get('detections', []) if str(item.get('class_name', '')).lower() == 'meter']
    if not meters:
        return
    best_meter = max(meters, key=lambda item: float(item.get('confidence', 0.0)))
    m_pts = np.asarray(best_meter['corners'], dtype=np.float64)
    win_pts = np.asarray(located['selected'].get('corners', []), dtype=np.float64)
    bw, bh = np.ptp(win_pts, axis=0) if win_pts.ndim == 2 and win_pts.shape[0] >= 4 else (1.0, 0.0)
    vertical = bool(bh > bw * 1.15)
    ml, mt = np.maximum(0, np.floor(m_pts.min(axis=0) - 20)).astype(int)
    mr, mb = np.minimum(frame.size, np.ceil(m_pts.max(axis=0) + 20)).astype(int)
    if mr > ml and mb > mt:
        for _, mapped in _iter_detect_in_crop(frame, (int(ml), int(mt), int(mr), int(mb)), vertical=vertical):
            yield mapped


def parse_guide_box(guide, frame):
    """Validate optional normalized camera guide rectangle {left,top,width,height}."""
    if not isinstance(guide, dict):
        return None
    try:
        gx = float(guide['left'])
        gy = float(guide['top'])
        gw = float(guide['width'])
        gh = float(guide['height'])
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(v) for v in (gx, gy, gw, gh)):
        return None
    if not (0 <= gx < 1 and 0 <= gy < 1 and .08 <= gw <= 1 and .04 <= gh <= 1 and gx + gw <= 1.001 and gy + gh <= 1.001):
        return None
    pad_x, pad_y = gw * .35, gh * .50
    left = max(0, int(math.floor((gx - pad_x) * frame.width)))
    top = max(0, int(math.floor((gy - pad_y) * frame.height)))
    right = min(frame.width, int(math.ceil((gx + gw + pad_x) * frame.width)))
    bottom = min(frame.height, int(math.ceil((gy + gh + pad_y) * frame.height)))
    return (left, top, right, bottom) if right - left >= 48 and bottom - top >= 24 else None


def visible_row_ends(prepared, digits, allow_dark_margin=False):
    """Reject a shortened dark register or an unfinished red-wheel suffix.

    The left half-cell must reach the lighter faceplate. At the right edge an
    adjacent black unit label is allowed, but another red wheel is not.
    """
    import cv2
    pixels = np.asarray(prepared['image'].convert('L'), dtype=np.float64)
    left, top, right, bottom = prepared['row_box']
    height = bottom - top
    y0, y1 = round(top + height * .25), round(bottom - height * .25)
    cell = (right - left) / digits
    row = pixels[y0:y1, left:right]
    if not row.size:
        return False
    a = pixels[y0:y1, max(0, round(left - .48 * cell)):max(1, round(left - .20 * cell))]
    b = pixels[y0:y1, round(right + .20 * cell):min(pixels.shape[1], round(right + .48 * cell))]
    rgb = np.asarray(prepared['image'].convert('RGB'))
    outside = rgb[y0:y1, round(right + .20 * cell):min(pixels.shape[1], round(right + .48 * cell))]
    if not (a.size and b.size and outside.size):
        return False
    hsv = cv2.cvtColor(np.ascontiguousarray(outside), cv2.COLOR_RGB2HSV)
    red = ((hsv[:, :, 0] <= 12) | (hsv[:, :, 0] >= 170)) & (hsv[:, :, 1] >= 70) & (hsv[:, :, 2] >= 55)
    if red.mean() > .008:
        return False
    if a.mean() >= max(110, row.mean() + 25) and a.std() <= 30:
        return True
    if not allow_dark_margin:
        return False
    # Electric counters often have a wide empty black margin before wheel 1.
    # Accept an empty margin, but reject a partial tall bright glyph that would
    # indicate OCR cropped an earlier wheel out of both agreeing observations.
    bright = (a >= max(110, float(np.median(row)) + 25)).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(bright)
    for x, y, width, component_height, area in stats[1:]:
        if component_height >= .60 * a.shape[0] and area >= max(3, .015 * cell * height):
            return False
    return True


def automatic(request, frame):
    """Locate a fresh row for this photo; profiles contain no reusable crop.

    Stage-1 digit values are discarded. Every configured wheel needs a detected
    box in one unique equal-pitch grid. A broad window alone is insufficient.
    """
    utility, profile = request.get('utility'), request.get('profile')
    if utility not in ('electric', 'water'):
        raise ValueError('Loại công tơ không hợp lệ.')
    result = {'width': frame.width, 'height': frame.height, 'status': 'needs_review',
              'reading': None, 'confidence': 0, 'quality': None, 'cells': [],
              'warnings': ['Chưa đọc rõ toàn bộ hàng số và vị trí phần lẻ từ ảnh.'],
              'model': 'wheels-v2', 'modelDigest': MODEL_SHA256,
              'config': None, 'profileSource': None, 'configNeedsConfirmation': False,
              'automation': {'locatorStatus': 'not_run', 'geometryStatus': 'not_run', 'orientation': None}}
    if profile is not None:
        if not isinstance(profile, dict) or set(profile) != {'digits', 'decimals'}:
            raise ValueError('Cấu hình tự động không hợp lệ.')
        digits, decimals = profile.get('digits'), profile.get('decimals')
        validate_config(digits, decimals, utility)
        result['profileSource'] = 'confirmed'
    result['status'] = 'needs_review'
    result['warnings'] = ['Chưa xác định chắc chắn toàn bộ hàng số. Hãy chọn vùng thủ công hoặc chụp rõ hơn.']
    located = detect(frame)
    guide_box = parse_guide_box(request.get('guideBox'), frame)
    if located['status'] != 'selected' and guide_box is not None:
        guided = _detect_in_crop(frame, guide_box, vertical=False)
        if guided is not None:
            located = guided
    result['automation']['locatorStatus'] = located['status']
    if located['status'] != 'selected':
        return result
    if profile is None:
        inferred = None
        for zoomed in zoomed_candidates(frame, located):
            inferred = detected_grid(zoomed['selected'], zoomed['detections'], [frame.width, frame.height], refine_row)
            if inferred is not None:
                break
        if inferred is None:
            result['automation']['geometryStatus'] = 'rejected'
            return result
        digits, refined = inferred
        # Temporary zero affects display only; no value is exposed until image
        # evidence establishes the actual decimal boundary below.
        decimals = 0
    else:
        refined = refine_row(located['selected'], located['detections'], digits, [frame.width, frame.height])
        if refined['status'] != 'selected':
            for zoomed in zoomed_candidates(frame, located):
                candidate_ref = refine_row(zoomed['selected'], zoomed['detections'], digits, [frame.width, frame.height])
                if candidate_ref['status'] == 'selected':
                    refined = candidate_ref
                    break
        if refined['status'] != 'selected' and guide_box is not None:
            guided = _detect_in_crop(frame, guide_box, vertical=False)
            if guided is not None:
                candidate_ref = refine_row(guided['selected'], guided['detections'], digits, [frame.width, frame.height])
                if candidate_ref['status'] == 'selected':
                    refined = candidate_ref
    result['automation']['geometryStatus'] = refined['status']
    if refined['status'] != 'selected':
        return result
    corners = np.asarray(refined['corners'], dtype=np.float64)
    configurations = [corners, np.roll(corners, -2, axis=0)]
    normalized = [(points / [frame.width, frame.height]).tolist() for points in configurations]
    # Validate the same normalized geometry used by the API and manual reader.
    for points in normalized:
        normalized_corners(points, frame)
    reader = _get_wheel_reader()
    prepared_views = [rectify_manual(frame, {'corners': points}, digits) for points in configurations]
    reads = [read_prepared({'digits': digits, 'decimals': decimals, 'utility': utility}, frame, prepared, reader)
             for prepared in prepared_views]
    direction = select_direction(reads)
    if direction is None:
        result['quality'] = reads[0]['quality']
        if all(item['status'] == 'retake' for item in reads):
            result.update(status='retake', warnings=reads[0]['warnings'])
        else:
            result['warnings'] = ['Vùng số hoặc chiều đọc chưa đủ chắc chắn. Hãy chọn vùng theo chiều đọc trên ảnh hoặc nhập tay.']
        return result
    evidence = red_suffix(prepared_views[direction], digits, 'detected-wheel-grid')
    if profile is None:
        if evidence is None or not visible_row_ends(prepared_views[direction], digits):
            result['warnings'] = ['Đã tìm thấy hàng số nhưng chưa xác định rõ phần lẻ từ ảnh. Hãy kiểm tra ảnh gốc hoặc chọn vùng thủ công.']
            return result
        decimals = evidence['decimals']
        validate_config(digits, decimals, utility)
        # Verify the chosen grid on a second original-pixel vertical crop.
        # Horizontal cell boundaries and complete wheel count stay unchanged.
        second_corners = configurations[direction].copy()
        top, bottom = second_corners[:2].copy(), second_corners[[3, 2]].copy()
        second_corners[:2] = top + .04 * (bottom - top)
        second_corners[[3, 2]] = bottom + .04 * (top - bottom)
        second = read_prepared({'digits': digits, 'decimals': decimals, 'utility': utility}, frame,
                               rectify_manual(frame, {'corners': second_corners}, digits), reader)
        if second['status'] != 'ready' or second['reading']['digits'] != reads[direction]['reading']['digits']:
            result['warnings'] = ['Hai vùng đọc từ ảnh chưa khớp toàn bộ dãy số. Hãy đối chiếu ảnh hoặc chụp rõ hơn.']
            return result
        chosen = reads[direction]
        text = chosen['reading']['digits']
        chosen['reading'].update(integerDigits=text[:-decimals], fractionalDigits=text[-decimals:],
                                 displayText=text[:-decimals] + '.' + text[-decimals:], integerValue=int(text[:-decimals]))
        result['profileSource'] = 'image'
        result['layoutEvidence'] = evidence
        result['automation']['agreement'] = True
        result['waterEvidence'] = {'agreement': True, 'observations': [
            {'digits': text, 'corners': normalized[direction], 'confidence': chosen['confidence']},
            {'digits': second['reading']['digits'], 'corners': (second_corners / [frame.width, frame.height]).tolist(),
             'confidence': second['confidence']}]}
    elif evidence is not None and evidence['decimals'] != decimals:
        result['warnings'] = ['Phần lẻ trên ảnh khác thiết lập công tơ đã lưu. Hãy kiểm tra đúng công tơ trước khi xác minh.']
        return result
    result.update(reads[direction])
    result['config'] = {'digits': digits, 'decimals': decimals, 'corners': normalized[direction]}
    result['automation']['orientation'] = 180 * direction
    return result


def process_request(request):
    if not isinstance(request, dict) or request.get('protocol') != 1 or request.get('mode') not in ('locate', 'read', 'auto'):
        raise ValueError('Yêu cầu bộ đọc không hợp lệ.')
    frame = read_image(request)
    if request.get('utility') == 'electric':
        # Electric photos never load YOLO or the wheel reader. The runtime and
        # models are local, explicitly prepared, and shared with no DB access.
        from meter_paddle import electric_request
        return electric_request(request, frame)
    if request.get('utility', 'water') != 'water':
        raise ValueError('Loại công tơ không hợp lệ.')
    if request['mode'] == 'locate':
        return locate(frame)
    result = automatic(request, frame) if request['mode'] == 'auto' else read_region(request, frame)
    result['engine'] = 'visionstate'
    return result


def main():
    try:
        raw = sys.stdin.buffer.read(56_000_001)
        if len(raw) > 56_000_000:
            raise ValueError('Yêu cầu bộ đọc vượt giới hạn.')
        request = json.loads(raw)
        # Ultralytics can announce its settings; stdout is a bounded JSON protocol.
        with contextlib.redirect_stdout(sys.stderr):
            result = process_request(request)
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=True, allow_nan=False), flush=True)
    except (ValueError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        print(json.dumps({'ok': False, 'code': 'invalid_image', 'message': 'Ảnh, vùng số hoặc cấu hình không được hỗ trợ.'}), flush=True)
    except Exception:
        print(json.dumps({'ok': False, 'code': 'unavailable', 'message': 'Bộ đọc cục bộ chưa xử lý được ảnh. Bạn vẫn có thể nhập tay.'}), flush=True)


if __name__ == '__main__':
    main()
