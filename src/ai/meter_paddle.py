"""Project-local official PaddleOCR for electric mechanical meter proposals.

No model download, wheel decoding, database access or previous reading is used.
Raw OCR observations remain distinct; a full row and its crop must agree.
"""
from __future__ import annotations

import hashlib
import math
import os
from pathlib import Path
import re
import sys

import cv2
import numpy as np
from PIL import Image
from meter_layout import red_suffix, printed_decimal

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / '.runtime/paddleocr'
DET_HASH = '5269b6bf7ed33c30591a23a3bde495f3a71f25a6a725e48c5f65b85681be58e1'
REC_HASH = '97d8a25dfa5b2feff8ca23c87f05e41948bc04bedcdd97ac4634241a74f93036'
MODEL_DIGEST = hashlib.sha256((DET_HASH + ':' + REC_HASH).encode()).hexdigest()
MODEL = 'paddleocr-ppocrv6'
MIN_CONFIDENCE = .85
CONFIG_HASHES = {
    'electric/PP-OCRv6_small_det_trozy_onnx_infer/inference.yml': '193f435274bf9f0b5f71a929bbfbcf148282df7e633b34e7c373e8f44741b516',
    'electric/PP-OCRv6_small_det_trozy_onnx_infer/inference.json': '89240f689a4a77aad75ef55a8df0a15c8e1d4980a327d17e58f24bbadde5aeab',
    'electric/PP-OCRv6_small_rec_trozy_onnx_infer/inference.yml': 'ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1',
    'electric/PP-OCRv6_small_rec_trozy_onnx_infer/inference.json': 'f0bf53c853937a917affdd74467472167727f8ab0f0f7bded01c4a16c27e46e6',
}


def canonical_digits(text, digits, decimals):
    """Only whitespace or a correctly placed explicit dot may be removed."""
    if not isinstance(text, str):
        return None
    compact = re.sub(r'\s', '', text)
    if re.fullmatch(r'[0-9]{%d}' % digits, compact):
        return compact
    if decimals and re.fullmatch(r'[0-9]{%d}\.[0-9]{%d}' % (digits - decimals, decimals), compact):
        return compact.replace('.', '')
    return None


_OCR = None


def create_ocr():
    global _OCR
    if _OCR is not None:
        return _OCR
    for name, expected in [('PP-OCRv6_small_det', DET_HASH), ('PP-OCRv6_small_rec', REC_HASH)]:
        model = (RUNTIME / 'models' / 'electric' / (name + '_trozy_onnx_infer') / 'inference.onnx').resolve()
        if not model.is_relative_to(ROOT) or not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest() != expected:
            raise RuntimeError('PaddleOCR model chưa được chuẩn bị hoặc không khớp hash.')
    for name, expected in CONFIG_HASHES.items():
        configuration = (RUNTIME / 'models' / name).resolve()
        if not configuration.is_relative_to(ROOT) or not configuration.is_file() or hashlib.sha256(configuration.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Cấu hình hoặc bảng ký tự PaddleOCR không khớp hash.')
    packages = (RUNTIME / 'site-packages').resolve()
    if not packages.is_relative_to(ROOT):
        raise RuntimeError('PaddleOCR runtime phải nằm trong dự án.')
    sys.path.insert(0, str(packages))
    os.environ.update({'PADDLE_PDX_CACHE_HOME': str(RUNTIME / 'cache'),
                       'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK': 'True',
                       'PADDLEOCR_HOME': str(RUNTIME / 'cache')})
    from paddleocr import PaddleOCR
    _OCR = PaddleOCR(text_detection_model_name='PP-OCRv6_small_det',
                     text_detection_model_dir=str(RUNTIME / 'models/electric/PP-OCRv6_small_det_trozy_onnx_infer'),
                     text_recognition_model_name='PP-OCRv6_small_rec',
                     text_recognition_model_dir=str(RUNTIME / 'models/electric/PP-OCRv6_small_rec_trozy_onnx_infer'),
                     use_doc_orientation_classify=False, use_doc_unwarping=False,
                     use_textline_orientation=False, device='cpu', engine='onnxruntime',
                     engine_config={'providers': ['CPUExecutionProvider'], 'intra_op_num_threads': 2,
                                    'inter_op_num_threads': 1})
    return _OCR


def ordered(points):
    """Keep Paddle's reading order; enforce a non-mirrored convex quadrilateral."""
    points = np.asarray(points, dtype=np.float64)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise ValueError('Invalid OCR polygon')
    edges = np.roll(points, -1, axis=0) - points
    cross = edges[:, 0] * np.roll(edges, -1, axis=0)[:, 1] - edges[:, 1] * np.roll(edges, -1, axis=0)[:, 0]
    if not np.all(cross > 1e-7):
        raise ValueError('Invalid OCR reading order')
    return points


def observations(ocr, frame, pass_name, source_size=None, inverse=None):
    """Paddle's numpy input is OpenCV BGR; output coordinates map to original."""
    width, height = source_size or frame.size
    results = list(ocr.predict(input=np.ascontiguousarray(np.asarray(frame.convert('RGB'))[:, :, ::-1])))
    output = []
    for result in results[:1]:
        texts, scores = result.get('rec_texts', []), result.get('rec_scores', [])
        polygons = result.get('rec_polys', [])
        for text, score, polygon in list(zip(texts, scores, polygons))[:100]:
            if not isinstance(text, str) or not text.strip() or len(text) > 96 or not math.isfinite(float(score)) or not 0 <= float(score) <= 1:
                continue
            try:
                points = ordered(polygon)
                if inverse is not None:
                    points = cv2.perspectiveTransform(points[None, :, :], inverse)[0]
                if (points[:, 0] < -1).any() or (points[:, 0] > width + 1).any() or (points[:, 1] < -1).any() or (points[:, 1] > height + 1).any():
                    continue
                points = ordered(np.clip(points, [0, 0], [width, height]))
                normalized = points / [width, height]
                edges = np.roll(normalized, -1, axis=0) - normalized
                if not np.all(edges[:, 0] * np.roll(edges, -1, axis=0)[:, 1] - edges[:, 1] * np.roll(edges, -1, axis=0)[:, 0] > 1e-7):
                    continue
            except (ValueError, TypeError):
                continue
            output.append({'text': text, 'confidence': float(score),
                           'corners': (points / [width, height]).tolist(), 'pass': pass_name})
    return output


def box_geometry(observation, frame):
    points = ordered(observation['corners']) * [frame.width, frame.height]
    width = (np.linalg.norm(points[1] - points[0]) + np.linalg.norm(points[2] - points[3])) / 2
    height = (np.linalg.norm(points[3] - points[0]) + np.linalg.norm(points[2] - points[1])) / 2
    return points, float(width), float(height)


UNIT_RE = re.compile(r'k\s*w\s*[.·/]?\s*h', re.I)


def has_unit_context(row, rows, frame):
    points, width, height = box_geometry(row, frame)
    center = points.mean(axis=0)
    for item in rows:
        if not UNIT_RE.search(item['text']) or item['confidence'] < .5:
            continue
        unit_points = np.asarray(item['corners']) * [frame.width, frame.height]
        distance = np.abs(unit_points.mean(axis=0) - center)
        if distance[0] <= max(width * 1.5, height * 5) and distance[1] <= height * 9:
            return True
    return False


def _map_rotated_observations(rows, angle):
    """Map normalized polygon corners from a rotated view back to original 0-deg frame."""
    if angle == 0:
        return rows
    mapped = []
    for row in rows:
        pts = np.asarray(row['corners'], dtype=np.float64)
        if angle == 90:
            orig = np.column_stack([1.0 - pts[:, 1], pts[:, 0]])
        elif angle == 180:
            orig = np.column_stack([1.0 - pts[:, 0], 1.0 - pts[:, 1]])
        elif angle == 270:
            orig = np.column_stack([pts[:, 1], 1.0 - pts[:, 0]])
        else:
            continue
        orig = np.clip(orig, 0.0, 1.0)
        try:
            ordered(orig)
        except ValueError:
            continue
        mapped.append({**row, 'corners': orig.tolist()})
    return mapped


def numeric_candidates(rows, frame, digits=None, decimals=0, automatic=False):
    candidates = []
    for item in rows:
        if item['confidence'] < MIN_CONFIDENCE:
            continue
        text = canonical_digits(item['text'], digits, decimals) if digits else (re.sub(r'\s', '', item['text']) if re.fullmatch(r'[0-9\s]{3,12}(?:\.[0-9]{1,4})?', item['text']) else None)
        if not text or len(text) > 12:
            continue
        try:
            points, width, height = box_geometry(item, frame)
            if width < 20 or height < 8 or width / height < 1.2:
                continue
            if automatic:
                # A configured digit count alone cannot distinguish a serial
                # number. Require kWh context and a dark mechanical register.
                if not has_unit_context(item, rows, frame):
                    continue
                from meter_geometry import rectify_manual
                row = rectify_manual(frame, {'corners': points}, digits or len(text.replace('.', '')))['image']
                if np.asarray(row.convert('L'), dtype=np.float64).mean() > 170:
                    continue
        except (ValueError, TypeError):
            continue
        candidates.append(item)
    return candidates[:8]


def recovery_regions(rows, frame):
    """Find a complete mechanical row when OCR attached its adjacent kWh label
    or garbled a red-framed terminal wheel.

    Original colour pixels locate a red terminal wheel and separate bright
    digit-shaped components to its left. No OCR substring supplies the answer.
    The resulting crop still needs two complete agreeing recognition passes.
    """
    from meter_geometry import rectify_manual
    regions = []
    for row in rows:
        attached_kwh = row['confidence'] >= MIN_CONFIDENCE and bool(re.fullmatch(r'[0-9\s]{3,12}k\s*w\s*[.·/]?\s*h', row['text'], re.I))
        garbled_tail = (not attached_kwh and row['confidence'] >= .70
                        and bool(re.fullmatch(r'[0-9\s]{3,10}[^0-9\s]{1,3}', row['text']))
                        and has_unit_context(row, rows, frame))
        if not attached_kwh and not garbled_tail:
            continue
        try:
            points, width, height = box_geometry(row, frame)
            prefix = re.sub(r'\s', '', re.match(r'[0-9\s]+', row['text']).group())
            prepared = rectify_manual(frame, {'corners': points}, len(prefix))
            if garbled_tail and np.asarray(prepared['image'].convert('L'), dtype=np.float64).mean() > 170:
                continue
            raw = np.asarray(prepared['image'].crop(prepared['row_box']).convert('RGB'))
            hsv = cv2.cvtColor(np.ascontiguousarray(raw), cv2.COLOR_RGB2HSV)
            red = (((hsv[:, :, 0] <= 12) | (hsv[:, :, 0] >= 170)) & (hsv[:, :, 1] >= 70) & (hsv[:, :, 2] >= 55)).astype(np.uint8)
            count, labels, stats, centers = cv2.connectedComponentsWithStats(red)
            max_red_x = raw.shape[1] * (.96 if garbled_tail else .85)
            red_boxes = [stats[index] for index in range(1, count) if stats[index, 4] >= 5 and stats[index, 3] >= raw.shape[0] * .20 and raw.shape[1] * .35 < centers[index, 0] < max_red_x]
            if len(red_boxes) != 1:
                continue
            rx, ry, rw, rh, area = map(int, red_boxes[0])
            neutral = ((hsv[:, :, 1] <= 80) & (hsv[:, :, 2] >= 105)).astype(np.uint8)
            count, labels, stats, centers = cv2.connectedComponentsWithStats(neutral)
            boxes = [(int(x), int(y), int(w), int(h)) for x, y, w, h, area in stats[1:]
                     if area >= 5 and x + w <= rx and .4 * rh <= h <= 2 * rh and 2 <= w <= 1.8 * rh
                     and abs(y + h / 2 - (ry + rh / 2)) <= .6 * rh]
            boxes.sort()
            boxes.append((rx, ry, rw, rh))
            if not max(3, len(prefix)) <= len(boxes) <= 12:
                continue
            centers_x = np.array([x + w / 2 for x, y, w, h in boxes])
            pitch = float(np.median(np.diff(centers_x)))
            gaps = np.diff(centers_x) / pitch
            if pitch < 4 or gaps.min() < .65 or gaps.max() > 1.35:
                continue
            x0, x1 = centers_x[0] - pitch / 2, centers_x[-1] + pitch / 2
            y0 = min(y for x, y, w, h in boxes) - .10 * rh
            y1 = max(y + h for x, y, w, h in boxes) + .10 * rh
            if x0 < 0 or x1 > raw.shape[1] or y0 < 0 or y1 > raw.shape[0]:
                continue
            left, top, _, _ = prepared['row_box']
            local = np.array([[[x0 + left, y0 + top], [x1 + left, y0 + top], [x1 + left, y1 + top], [x0 + left, y1 + top]]], dtype=np.float64)
            inverse = np.linalg.inv(np.asarray(prepared['geometry']['homography_source_to_output']))
            corners = cv2.perspectiveTransform(local, inverse)[0]
            if (corners < 0).any() or (corners > frame.size).any():
                continue
            regions.append({'corners': corners, 'digits': len(boxes), 'prefix': prefix})
        except (ValueError, TypeError):
            continue
    return regions


def electric_request(request, frame):
    # Imported lazily to avoid a circular module during the worker entry point.
    from meter_reader_worker import normalized_corners, parse_guide_box, quality_for, validate_config, visible_row_ends
    from meter_geometry import rectify_manual

    mode, profile = request['mode'], request.get('profile')
    result = {'width': frame.width, 'height': frame.height, 'status': 'needs_review',
              'reading': None, 'confidence': 0., 'warnings': [], 'quality': None, 'cells': [],
              'engine': 'paddleocr', 'model': MODEL, 'modelDigest': MODEL_DIGEST,
              'ocrEvidence': {'observations': [], 'selectedObservationIndices': [], 'agreement': False,
                              'scope': 'owner-region' if mode == 'read' else 'automatic'},
              'config': None, 'profileSource': None, 'configNeedsConfirmation': False}
    if mode == 'read':
        digits, decimals = request.get('digits'), request.get('decimals')
        validate_config(digits, decimals, 'electric')
        chosen_corners = normalized_corners(request.get('corners'), frame)
        prepared = rectify_manual(frame, {'corners': chosen_corners}, digits)
        quality, messages = quality_for(prepared, digits)
        result.update(status='needs_review', quality=quality,
                      config={'digits': digits, 'decimals': decimals, 'corners': request['corners']})
        if not quality['canRead']:
            result.update(status='retake', warnings=messages)
            return result
    elif profile is not None:
        if not isinstance(profile, dict) or set(profile) != {'digits', 'decimals'}:
            raise ValueError('Cấu hình điện không hợp lệ.')
        digits, decimals = profile.get('digits'), profile.get('decimals')
        validate_config(digits, decimals, 'electric')
    else:
        digits, decimals = None, 0
    ocr = create_ocr()
    if mode == 'read':
        inverse = np.linalg.inv(np.asarray(prepared['geometry']['homography_source_to_output']))
        rows = observations(ocr, prepared['image'], 'region', frame.size, inverse)
    else:
        rows = observations(ocr, frame, 'full')
    candidates = numeric_candidates(rows, frame, digits, decimals, automatic=mode == 'auto')
    if mode == 'auto' and len(candidates) == 0 and not any(UNIT_RE.search(row['text']) and row['confidence'] >= .5 for row in rows):
        # Rotated photos (e.g. stripped EXIF from chat apps) lack upright kWh context.
        for angle, transpose in ((90, Image.Transpose.ROTATE_90), (270, Image.Transpose.ROTATE_270), (180, Image.Transpose.ROTATE_180)):
            rot_rows = _map_rotated_observations(observations(ocr, frame.transpose(transpose), 'full'), angle)
            if not rot_rows:
                continue
            rot_cands = numeric_candidates(rot_rows, frame, digits, decimals, automatic=True)
            if rot_cands or any(UNIT_RE.search(row['text']) and row['confidence'] >= .5 for row in rot_rows):
                rows, candidates = rot_rows, rot_cands
                break
    if mode == 'locate':
        # These are region hints, never inferred digit values: an unknown red
        # wheel or attached unit can still mark a useful candidate for an owner.
        for row in rows:
            compact = re.sub(r'\s', '', row['text'])
            if row not in candidates and row['confidence'] >= .5 and re.fullmatch(r'[0-9]{3,12}(?:kWh|[^0-9\s])?', compact, re.I):
                if digits is None or digits - 1 <= len(re.match(r'[0-9]+', compact).group()) <= digits:
                    candidates.append(row)
        candidates = candidates[:8]
        return {'width': frame.width, 'height': frame.height,
                'status': 'selected' if len(candidates) == 1 else 'ambiguous_window' if candidates else 'no_window',
                'candidates': [{'corners': row['corners'], 'confidence': row['confidence']} for row in candidates],
                'warnings': ['Kiểm tra đúng hàng chỉ số điện và phần lẻ trước khi chọn vùng.'],
                'engine': 'paddleocr', 'model': MODEL, 'modelDigest': MODEL_DIGEST}
    result.update(status='needs_review', profileSource='confirmed' if mode == 'auto' and profile is not None else None,
                  warnings=['PaddleOCR chưa đọc chắc toàn bộ hàng số điện. Hãy kiểm tra vùng hoặc ảnh gốc.'])
    result['ocrEvidence']['observations'] = rows[:32]
    if mode == 'auto':
        if len(candidates) == 0:
            regions = recovery_regions(rows, frame)
            if len(regions) == 1:
                recovered = regions[0]
                chosen_corners = recovered['corners']
                prepared = rectify_manual(frame, {'corners': chosen_corners}, recovered['digits'])
                inverse = np.linalg.inv(np.asarray(prepared['geometry']['homography_source_to_output']))
                region_rows = observations(ocr, prepared['image'], 'region', frame.size, inverse)
                candidates = numeric_candidates(region_rows, frame, digits, decimals)
                if len(candidates) == 1:
                    observed = re.sub(r'\s|\.', '', candidates[0]['text'])
                    if len(observed) != recovered['digits'] or not observed.startswith(recovered['prefix']):
                        candidates = []
        if len(candidates) == 0:
            guide_box = parse_guide_box(request.get('guideBox'), frame)
            if guide_box is not None and any(UNIT_RE.search(row['text']) and row['confidence'] >= .5 for row in rows):
                gl, gt, gr, gb = guide_box
                offset = np.array([[1., 0., float(gl)], [0., 1., float(gt)], [0., 0., 1.]])
                guide_rows = observations(ocr, frame.crop((gl, gt, gr, gb)), 'region', frame.size, offset)
                guide_cands = numeric_candidates(guide_rows, frame, digits, decimals)
                if len(guide_cands) == 1:
                    chosen_corners = np.asarray(guide_cands[0]['corners']) * [frame.width, frame.height]
                    candidates = guide_cands
        if len(candidates) != 1:
            return result
        selected = candidates[0]
        if selected['pass'] != 'region':
            chosen_corners = np.asarray(selected['corners']) * [frame.width, frame.height]
        if profile is None:
            compact = re.sub(r'\s', '', selected['text'])
            digits = len(compact.replace('.', ''))
            decimals = len(compact.split('.')[1]) if '.' in compact else 0
            if not 3 <= digits <= 12:
                return result
    else:
        # Only the owner's selected region may provide the full-photo match.
        polygon = np.asarray(chosen_corners, dtype=np.float32)
        candidates = [row for row in candidates if cv2.pointPolygonTest(polygon, tuple((np.asarray(row['corners']) * [frame.width, frame.height]).mean(axis=0)), False) >= 0]
        if len(candidates) != 1:
            return result
        selected = candidates[0]
    prepared = rectify_manual(frame, {'corners': chosen_corners}, digits)
    quality, messages = quality_for(prepared, digits)
    result['quality'] = quality
    result['config'] = {'digits': digits, 'decimals': decimals, 'corners': (np.asarray(chosen_corners) / [frame.width, frame.height]).tolist()}
    if not quality['canRead']:
        result.update(status='retake', warnings=messages)
        return result
    # Automatic: full photo plus context crop. Manual: expanded owner region
    # plus its tight row. The evidence labels distinguish those two policies.
    inverse = np.linalg.inv(np.asarray(prepared['geometry']['homography_source_to_output']))
    if mode == 'read' or selected['pass'] == 'region':
        left, top, right, bottom = prepared['row_box']
        offset = np.array([[1., 0., left], [0., 1., top], [0., 0., 1.]])
        cropped_rows = observations(ocr, prepared['image'].crop((left, top, right, bottom)), 'crop', frame.size, inverse @ offset)
    else:
        cropped_rows = observations(ocr, prepared['image'], 'crop', frame.size, inverse)
    text = canonical_digits(selected['text'], digits, decimals)
    matches = [row for row in cropped_rows if row['confidence'] >= MIN_CONFIDENCE and canonical_digits(row['text'], digits, decimals) == text]
    if len(matches) != 1:
        return result
    crop = matches[0]
    if mode == 'auto':
        printed = printed_decimal([selected['text'], crop['text']])
        colored = red_suffix(prepared, digits, 'ocr-line')
        if printed is not None and colored is not None and printed['decimals'] != colored['decimals']:
            result['warnings'] = ['Dấu thập phân và nhóm ô đỏ trên ảnh chưa thống nhất. Hãy đối chiếu ảnh gốc.']
            return result
        evidence = printed or colored
        if profile is None or selected['pass'] == 'region':
            if evidence is None:
                result['warnings'] = ['Đã đọc hàng số nhưng chưa xác định rõ phần lẻ từ ảnh. Hãy kiểm tra ảnh gốc hoặc chọn vùng thủ công.']
                return result
            if not visible_row_ends(prepared, digits, allow_dark_margin=True):
                result['warnings'] = ['Vùng đọc có thể chưa bao gồm đủ các ô số. Hãy kiểm tra ảnh gốc hoặc chụp rõ hơn.']
                return result
            if profile is not None and (profile['digits'] != evidence['digits'] or profile['decimals'] != evidence['decimals']):
                result['warnings'] = ['Phần lẻ trên ảnh khác thiết lập công tơ đã lưu. Hãy kiểm tra đúng công tơ trước khi xác minh.']
                return result
            decimals = evidence['decimals']
            validate_config(digits, decimals, 'electric')
            result['config']['decimals'] = decimals
            result['profileSource'] = 'image'
            result['layoutEvidence'] = evidence
        elif evidence is not None and evidence['decimals'] != decimals:
            result['warnings'] = ['Phần lẻ trên ảnh khác thiết lập công tơ đã lưu. Hãy kiểm tra đúng công tơ trước khi xác minh.']
            return result
    result['ocrEvidence'] = {'observations': [selected, crop], 'selectedObservationIndices': [0, 1], 'agreement': True,
                             'scope': 'owner-region' if mode == 'read' else 'automatic'}
    result['confidence'] = min(selected['confidence'], crop['confidence'])
    integer_digits = text[:-decimals] if decimals else text
    fractional_digits = text[-decimals:] if decimals else ''
    result.update(status='ready', reading={'digits': text, 'displayText': integer_digits + ('.' + fractional_digits if decimals else ''),
                  'integerDigits': integer_digits, 'fractionalDigits': fractional_digits,
                  'integerValue': int(integer_digits), 'unit': 'kWh'},
                  warnings=['Đây là đề xuất PaddleOCR từ ảnh điện; đối chiếu dãy số và phần lẻ trước khi lưu.'])
    return result
