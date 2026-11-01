"""Bounded local meter inference worker. Reads one JSON request and exits.

The application authorizes evidence before invoking this process. No downloads,
database access or invoice/reading writes exist here. Automatic inference uses
a confirmed meter configuration and rejects ambiguous geometry or direction.
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

Image.MAX_IMAGE_PIXELS = 12_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
YOLO_HASH = 'f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9'


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
    path = RUNTIME / 'models/stage1_meter_window_digits.pt'
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != YOLO_HASH:
        raise RuntimeError('Model tìm vùng số chưa sẵn sàng.')
    return YoloWindowDetector(path).detect(frame)


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
    reader = reader or WheelReader(RUNTIME / 'models/wheels-v2.onnx')
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


def automatic(request, frame):
    """Locate a fresh row for this photo; profiles contain no reusable crop.

    Stage-1 digit values are discarded. Every configured wheel needs a detected
    box in one unique equal-pitch grid. A broad window alone is insufficient.
    """
    utility, profile = request.get('utility'), request.get('profile')
    if utility not in ('electric', 'water'):
        raise ValueError('Loại công tơ không hợp lệ.')
    result = {'width': frame.width, 'height': frame.height, 'status': 'needs_setup',
              'reading': None, 'confidence': 0, 'quality': None, 'cells': [],
              'warnings': ['Thiết lập số bánh và phần lẻ của công tơ một lần để đọc tự động.'],
              'model': 'wheels-v2', 'modelDigest': MODEL_SHA256,
              'config': None, 'profileSource': None, 'configNeedsConfirmation': False,
              'automation': {'locatorStatus': 'not_run', 'geometryStatus': 'not_run', 'orientation': None}}
    if profile is None:
        return result
    if not isinstance(profile, dict) or set(profile) != {'digits', 'decimals'}:
        raise ValueError('Cấu hình tự động không hợp lệ.')
    digits, decimals = profile.get('digits'), profile.get('decimals')
    validate_config(digits, decimals, utility)
    result['profileSource'] = 'confirmed'
    result['status'] = 'needs_review'
    result['warnings'] = ['Chưa xác định chắc chắn toàn bộ hàng số. Hãy chọn vùng thủ công hoặc chụp rõ hơn.']
    located = detect(frame)
    result['automation']['locatorStatus'] = located['status']
    if located['status'] != 'selected':
        return result
    refined = refine_row(located['selected'], located['detections'], digits, [frame.width, frame.height])
    result['automation']['geometryStatus'] = refined['status']
    if refined['status'] != 'selected':
        return result
    corners = np.asarray(refined['corners'], dtype=np.float64)
    configurations = [corners, np.roll(corners, -2, axis=0)]
    normalized = [(points / [frame.width, frame.height]).tolist() for points in configurations]
    # Validate the same normalized geometry used by the API and manual reader.
    for points in normalized:
        normalized_corners(points, frame)
    reader = WheelReader(RUNTIME / 'models/wheels-v2.onnx')
    reads = [read_prepared({'digits': digits, 'decimals': decimals, 'utility': utility}, frame,
                          rectify_manual(frame, {'corners': points}, digits), reader)
             for points in configurations]
    direction = select_direction(reads)
    if direction is None:
        result['quality'] = reads[0]['quality']
        if all(item['status'] == 'retake' for item in reads):
            result.update(status='retake', warnings=reads[0]['warnings'])
        else:
            result['warnings'] = ['Vùng số hoặc chiều đọc chưa đủ chắc chắn. Hãy chọn vùng theo chiều đọc trên ảnh hoặc nhập tay.']
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
