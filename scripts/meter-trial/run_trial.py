"""Offline exploratory YOLO + VisionState benchmark. Never imports the app or DB."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import html
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / '.runtime/meter-digits/visionstate-yolo'
for key, folder in {'YOLO_CONFIG_DIR': 'ultralytics-config', 'MPLCONFIGDIR': 'matplotlib',
                    'TORCH_HOME': 'torch-cache', 'HF_HOME': 'huggingface-cache',
                    'XDG_CACHE_HOME': 'cache'}.items():
    os.environ[key] = str(RUNTIME / folder)
os.environ.update({'YOLO_AUTOINSTALL': 'false', 'YOLO_OFFLINE': 'true',
                   'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONNOUSERSITE': '1'})
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from wheel_reader import WheelReader
from yolo_detector import YoloWindowDetector, rectify_manual, rectify_window

YOLO_HASH = 'f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9'


def sha(path):
    return hashlib.file_digest(Path(path).open('rb'), 'sha256').hexdigest()


def project_path(value):
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Trial paths must remain inside the project')
    return path


def compare(observation, sample):
    reference = sample['reference']
    exact = reference['exactDigits']
    prefix = reference['integerDigits']
    return {
        'reference': reference['visibleDigits'], 'referenceUserVerified': False,
        'exactRowScorable': exact is not None,
        'upstreamRoundedExact': observation['upstreamRoundedDigits'] == exact if exact else None,
        'unroundedFloorExact': observation['unroundedDigits'] == exact if exact else None,
        'upstreamRoundedIntegerPrefix': observation['upstreamRoundedDigits'][:len(prefix)] == prefix,
        'unroundedFloorIntegerPrefix': observation['unroundedDigits'][:len(prefix)] == prefix,
    }


def read_path(reader, frame, sample, name, output, geometry, method):
    started = time.perf_counter()
    prepared = method(frame)
    observation = reader.read(prepared['image'], tuple(prepared['row_box']), sample['digits'])
    image_name, cells_name = name + '-row.png', name + '-cells.png'
    prepared['image'].crop(prepared['row_box']).save(output / image_name)
    reader.cells_image(prepared['image'], tuple(prepared['row_box']), sample['digits']).save(output / cells_name)
    return {'status': 'read', 'geometrySource': geometry,
            'configuredDigits': sample['digits'], 'configuredDecimals': sample['decimals'],
            'configuredUnit': sample['unit'], 'geometry': prepared['geometry'],
            'observation': observation, 'comparison': compare(observation, sample),
            'aboveUpstreamConfidenceThreshold': observation['confidence'] >= .7,
            'confidenceThreshold': .7, 'confidenceIsCalibratedCorrectness': False,
            'rowImage': image_name, 'cellsImage': cells_name,
            'elapsedMs': round((time.perf_counter() - started) * 1000, 2),
            'businessProposal': None, 'requiresHumanReview': True}


def summarize(cases, field):
    eligible = [c for c in cases if not c.get('derivedControl') and c['reference']['exactDigits'] is not None]
    read = [c[field] for c in eligible if c.get(field, {}).get('status') == 'read']
    return {'fullyLabelledOriginals': len(eligible), 'rowsRead': len(read),
            'upstreamRoundedExact': sum(row['comparison']['upstreamRoundedExact'] is True for row in read),
            'unroundedFloorExact': sum(row['comparison']['unroundedFloorExact'] is True for row in read),
            'aboveThreshold': sum(row['aboveUpstreamConfidenceThreshold'] for row in read),
            'wrongAboveThreshold': sum(row['aboveUpstreamConfidenceThreshold'] and not row['comparison']['upstreamRoundedExact'] for row in read),
            'missingOrFailed': len(eligible) - len(read)}


def write_html(report, output):
    escape = lambda value: html.escape(str(value))
    sections = []
    for case in report['cases']:
        parts = []
        for field, label in [('manual', 'Crop tay đã khóa'), ('automatic', 'Crop YOLO'), ('halfTurnDiagnostic', 'Chẩn đoán xoay thêm 180°')]:
            row = case.get(field)
            if not row:
                continue
            if row['status'] != 'read':
                parts.append(f'<article><h3>{label}</h3><p>{escape(row)}</p></article>')
                continue
            observed = row['observation']
            parts.append(f'<article><h3>{label}</h3><img class="row" src="{escape(row["rowImage"])}">'
                         f'<img class="cells" src="{escape(row["cellsImage"])}">'
                         f'<p>Chuỗi upstream làm tròn: <b>{escape(observed["upstreamRoundedDigits"])}</b><br>'
                         f'Chuỗi lấy sàn để chẩn đoán: {escape(observed["unroundedDigits"])}<br>'
                         f'Giá trị bánh cuối chưa làm tròn: {escape(observed["rawValueLastWheelUnits"])}<br>'
                         f'Confidence ô yếu nhất: {observed["confidence"]:.3f}</p>'
                         f'<p>Khớp toàn chuỗi upstream: {escape(row["comparison"]["upstreamRoundedExact"])}; '
                         f'khớp phần nguyên: {escape(row["comparison"]["upstreamRoundedIntegerPrefix"])}</p></article>')
        source = os.path.relpath(ROOT / case['file'], output).replace('\\', '/')
        sections.append(f'<section><h2>{escape(case["id"])}</h2><p>Đối chiếu tạm: '
                        f'<b>{escape(case["reference"]["visibleDigits"])}</b>; '
                        f'{escape(case["digits"])} bánh; {escape(case["decimals"])} số lẻ.</p>'
                        f'<a href="{escape(source)}"><img class="source" src="{escape(source)}"></a>'
                        f'<div class="paths">{"".join(parts)}</div></section>')
    content = '<!doctype html><html lang="vi"><meta charset="utf-8"><title>YOLO + Wheel Reader — thử ngoại tuyến</title>'
    content += '<style>body{font:16px system-ui;max-width:1200px;margin:30px auto;padding:16px;background:#f5f7fb;color:#182437}section,article{background:white;border:1px solid #dce2eb;border-radius:10px;padding:18px;margin:16px 0}.paths{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}.source{max-width:100%;max-height:240px}.row,.cells{display:block;max-width:100%;max-height:130px;image-rendering:auto;margin:12px 0}pre{white-space:pre-wrap}b{font-family:monospace}</style>'
    content += '<h1>YOLO + VisionState: phép thử ngoại tuyến</h1><p>5 ảnh tái sử dụng; nhãn do tác nhân xem ảnh, chưa được người dùng xác nhận. Số bánh và phần lẻ là cấu hình thủ công. Không ghi dữ liệu ứng dụng. Hai chuỗi làm tròn/lấy sàn là chẩn đoán riêng; không phải chỉ số được duyệt.</p>'
    content += '<pre>' + escape(json.dumps(report['summary'], indent=2, ensure_ascii=False)) + '</pre>'
    content += ''.join(sections) + '</html>'
    (output / 'report.html').write_text(content, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', default='docs/test/fixtures/visionstate-yolo-samples.json')
    parser.add_argument('--output', required=True)
    parser.add_argument('--orientation-diagnostics', action='store_true')
    parser.add_argument('--controls', action='store_true')
    args = parser.parse_args()
    output = project_path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new output directory to preserve earlier trials')
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = project_path(args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    model = RUNTIME / 'models/stage1_meter_window_digits.pt'
    if sha(model) != YOLO_HASH:
        raise ValueError('YOLO model SHA-256 differs from pinned revision')
    reader = WheelReader(RUNTIME / 'models/wheels-v2.onnx')
    detector = YoloWindowDetector(model)
    cases = []
    for sample in manifest['samples']:
        path = project_path(sample['file'])
        if sha(path) != sample['sha256']:
            raise ValueError('Photo changed: ' + sample['id'])
        with Image.open(path) as opened:
            frame = ImageOps.exif_transpose(opened).convert('RGB')
        variants = [(sample['id'], frame, False)]
        if args.controls and sample['id'] in ('electric-clear', 'water-blue'):
            variants += [(sample['id'] + '-blur-control', frame.filter(ImageFilter.GaussianBlur(12)), True),
                         (sample['id'] + '-blank-control', Image.new('RGB', frame.size, '#888888'), True)]
        for name, current, control in variants:
            case = {**sample, 'id': name, 'derivedControl': control}
            for field, method in [('manual', lambda image: rectify_manual(image, sample['manualRegion'], sample['digits']))]:
                try:
                    case[field] = read_path(reader, current, sample, name + '-' + field, output, 'locked_manual_polygon', method)
                except Exception as error:
                    case[field] = {'status': 'error', 'error': str(error)}
            try:
                detection = detector.detect(current)
                case['detection'] = detection
                selected = detection.get('selected')
                if selected:
                    case['automatic'] = read_path(reader, current, sample, name + '-yolo', output, 'yolo_window',
                        lambda image: rectify_window(image, selected, sample['digits']))
                    if args.orientation_diagnostics and not control:
                        case['halfTurnDiagnostic'] = read_path(reader, current, sample, name + '-yolo180', output,
                            'yolo_window_180_diagnostic_only', lambda image: rectify_window(image, selected, sample['digits'], half_turn=True))
                else:
                    case['automatic'] = {'status': detection['status'], 'businessProposal': None}
            except Exception as error:
                case['automatic'] = {'status': 'error', 'error': str(error)}
            cases.append(case)
            print(json.dumps({'sample': name, 'detection': case.get('detection', {}).get('status'),
                 'manual': case['manual'].get('observation', {}).get('upstreamRoundedDigits'),
                 'yolo': case['automatic'].get('observation', {}).get('upstreamRoundedDigits')}, ensure_ascii=True), flush=True)
    sources = ['scripts/meter-trial/run_trial.py', 'scripts/meter-trial/wheel_reader.py',
               'scripts/meter-trial/yolo_detector.py', args.manifest]
    report = {'schemaVersion': 1, 'createdUtc': datetime.now(timezone.utc).isoformat(),
              'scope': 'Exploratory offline trial only; no app/DB imports or business writes',
              'referencePolicy': manifest['referencePolicy'],
              'models': {'yoloSha256': YOLO_HASH, 'wheelSha256': sha(RUNTIME / 'models/wheels-v2.onnx')},
              'runtime': {key: importlib.metadata.version(key) for key in ['torch', 'ultralytics', 'onnxruntime', 'numpy', 'Pillow']},
              'sourceSha256': {path: sha(project_path(path)) for path in sources},
              'summary': {'manual': summarize(cases, 'manual'), 'automatic': summarize(cases, 'automatic'),
                          'originals': len(manifest['samples']), 'derivedControls': sum(c['derivedControl'] for c in cases),
                          'note': 'Counts on provisional labels only; no accuracy estimate. Orientation diagnostics excluded.'},
              'cases': cases}
    (output / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    write_html(report, output)
    print(json.dumps(report['summary'], indent=2), flush=True)


if __name__ == '__main__':
    main()
