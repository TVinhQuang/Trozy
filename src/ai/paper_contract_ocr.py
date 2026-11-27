"""Read a submitted paper contract in memory with project-local PaddleOCR."""
import contextlib
import io
import json
from pathlib import Path
import sys
import warnings

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / '.runtime/paddleocr/site-packages'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

def run():
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 16_000_000
    warnings.simplefilter('error', Image.DecompressionBombWarning)
    raw = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        return {'error': 'image'}
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ('JPEG', 'PNG', 'WEBP'):
                return {'error': 'image'}
            image = ImageOps.exif_transpose(source).convert('RGB')
    except (ValueError, OSError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        return {'error': 'image'}
    import numpy as np
    from meter_paddle import create_ocr
    with contextlib.redirect_stdout(sys.stderr):
        result = next(iter(create_ocr().predict(input=np.ascontiguousarray(np.asarray(image)[:, :, ::-1]))), {})
    return {'lines': [str(text)[:300] for text in result.get('rec_texts', [])[:300]]}

if __name__ == '__main__':
    try:
        output = run()
    except Exception:
        output = {'error': 'unavailable'}
    sys.stdout.buffer.write(json.dumps(output, ensure_ascii=False).encode('utf-8'))
