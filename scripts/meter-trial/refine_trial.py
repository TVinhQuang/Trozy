"""One declared post-baseline geometry experiment; labels never enter refinement."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import html
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_trial import ROOT, RUNTIME, project_path, sha, read_path
from wheel_reader import WheelReader
from yolo_detector import rectify_manual
from row_geometry import refine_row
from PIL import Image, ImageFilter, ImageOps


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', default='docs/test/visionstate-yolo-20261031/baseline/results.json')
    parser.add_argument('--output', default='docs/test/visionstate-yolo-20261031/geometry-refinement')
    args = parser.parse_args()
    baseline_path = project_path(args.baseline)
    baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
    for filename, expected in baseline['sourceSha256'].items():
        if sha(project_path(filename)) != expected:
            raise ValueError('Baseline source or locked labels changed: ' + filename)
    output = project_path(args.output)
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new output directory; never overwrite prior evidence')
    output.mkdir(parents=True, exist_ok=True)
    reader = WheelReader(RUNTIME / 'models/wheels-v2.onnx')
    cases = []
    for case in baseline['cases']:
        sample = {**case}
        path = project_path(case['file'])
        if sha(path) != case['sha256']:
            raise ValueError('Photo differs from locked source')
        with Image.open(path) as opened:
            frame = ImageOps.exif_transpose(opened).convert('RGB')
        if case['id'].endswith('-blur-control'):
            frame = frame.filter(ImageFilter.GaussianBlur(12))
        elif case['id'].endswith('-blank-control'):
            frame = Image.new('RGB', frame.size, '#888888')
        detection = case.get('detection', {})
        if detection.get('selected'):
            # Only geometry/class eligibility/confidence/count enters this call.
            # No reference characters, model read string or previous meter value.
            refinement = refine_row(detection['selected'], detection['detections'], case['digits'], image_size=frame.size)
            if refinement['status'] == 'selected':
                result = read_path(reader, frame, sample, case['id'] + '-refined', output,
                    'post_baseline_stage1_digit_geometry',
                    lambda image: rectify_manual(image, {'corners': refinement['corners']}, case['digits']))
            else:
                result = {'status': refinement['status'], 'reason': refinement.get('reason'), 'businessProposal': None}
        else:
            refinement = {'status': 'not_attempted', 'reason': 'Initial window missing or ambiguous; no manual fallback'}
            result = {'status': detection.get('status', 'error'), 'businessProposal': None}
        row = {'id': case['id'], 'derivedControl': case['derivedControl'], 'reference': case['reference'],
               'baselineAutomatic': case['automatic'], 'refinement': refinement, 'refined': result}
        cases.append(row)
        print(json.dumps({'sample': case['id'], 'geometry': refinement['status'],
             'refined': result.get('observation', {}).get('upstreamRoundedDigits'),
             'confidence': result.get('observation', {}).get('confidence')}, ensure_ascii=True), flush=True)
    labelled = [c for c in cases if not c['derivedControl'] and c['reference']['exactDigits'] is not None]
    read = [c['refined'] for c in labelled if c['refined']['status'] == 'read']
    summary = {'fullyLabelledOriginals': len(labelled), 'rowsRead': len(read),
               'upstreamRoundedExact': sum(r['comparison']['upstreamRoundedExact'] is True for r in read),
               'wrongAboveThreshold': sum(r['aboveUpstreamConfidenceThreshold'] and not r['comparison']['upstreamRoundedExact'] for r in read),
               'aboveThreshold': sum(r['aboveUpstreamConfidenceThreshold'] for r in read),
               'note': 'Post-baseline exploratory geometry change, evaluated on reused images; not a held-out benchmark.'}
    report = {'schemaVersion': 1, 'createdUtc': datetime.now(timezone.utc).isoformat(),
              'baselineSha256': sha(baseline_path), 'baseline': args.baseline,
              'sourceSha256': {p: sha(project_path(p)) for p in ['scripts/meter-trial/refine_trial.py', 'scripts/meter-trial/row_geometry.py']},
              'summary': summary, 'cases': cases}
    (output / 'results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    escape = lambda value: html.escape(str(value))
    body = '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Thử căn hàng số bằng hình học</title><style>body{font:16px system-ui;max-width:1000px;margin:30px auto;padding:20px;background:#f5f7fb}section{background:#fff;border:1px solid #ddd;padding:16px;margin:16px 0;border-radius:10px}img{max-width:100%;display:block;margin:10px 0;max-height:140px}pre{white-space:pre-wrap}</style><h1>Căn hàng số bằng hình học — thử sau baseline</h1><p>Thuật toán chỉ dùng hình học ô YOLO, số bánh đã cấu hình. Không nhận chữ số tham khảo hoặc kết quả đọc; không giải cứu trường hợp thiếu/đa nghĩa window. Đây là thử nghiệm trên cùng ảnh đã xem, không phải phép đo độ chính xác độc lập.</p>'
    body += '<p><a href="../baseline/report.html">Xem baseline gốc</a></p><pre>' + escape(json.dumps(summary, indent=2, ensure_ascii=False)) + '</pre>'
    for case in cases:
        result = case['refined']
        body += '<section><h2>' + escape(case['id']) + '</h2><p>Đối chiếu tạm: ' + escape(case['reference']['visibleDigits']) + '</p>'
        if result['status'] == 'read':
            observation = result['observation']
            body += '<img src="' + escape(result['rowImage']) + '"><img src="' + escape(result['cellsImage']) + '">'
            body += '<p>Upstream làm tròn: <b>' + escape(observation['upstreamRoundedDigits']) + '</b>; confidence ô yếu nhất: ' + f'{observation["confidence"]:.3f}' + '</p>'
        else:
            body += '<p>' + escape(result) + '</p>'
        body += '</section>'
    (output / 'report.html').write_text(body + '</html>', encoding='utf-8')
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == '__main__':
    main()
