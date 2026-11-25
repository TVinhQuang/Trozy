"""Fetch public meter datasets into .runtime/datasets/raw/.

All downloads stay inside the project repository (.runtime/datasets/raw).
Requires internet access (run with BypassSandbox: true).
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault('HF_HOME', str(ROOT / '.cache/huggingface'))
os.environ.setdefault('XDG_CACHE_HOME', str(ROOT / '.cache'))
RUNTIME_SITE = ROOT / '.runtime/paddleocr/site-packages'
if RUNTIME_SITE.exists():
    sys.path.insert(0, str(RUNTIME_SITE))

RAW_DIR = ROOT / '.runtime/datasets/raw'
SOURCES_FILE = Path(__file__).parent / 'sources.json'


def log(msg):
    print(f"[fetch] {msg}", flush=True)


def fetch_hf(source):
    import huggingface_hub
    source_id = source['id']
    hf_id = source.get('hf_id')
    dest = RAW_DIR / source_id
    dest.mkdir(parents=True, exist_ok=True)
    log(f"Downloading HF dataset {hf_id} into {dest}...")
    try:
        local_path = huggingface_hub.snapshot_download(
            repo_id=hf_id,
            repo_type="dataset",
            local_dir=str(dest),
            resume_download=True,
            max_workers=4
        )
        log(f"Successfully downloaded {hf_id} to {local_path}")
    except Exception as e:
        log(f"Error downloading {hf_id}: {e}")
        # Save error report in dest
        (dest / "FETCH_ERROR.txt").write_text(str(e), encoding="utf-8")


def fetch_github(source):
    source_id = source['id']
    repo_url = source['repo_url']
    dest = RAW_DIR / source_id
    if dest.exists() and any(dest.iterdir()):
        log(f"Source {source_id} already exists in {dest}. Skipping git clone.")
        return
    dest.mkdir(parents=True, exist_ok=True)
    log(f"Cloning shallow repo {repo_url} into {dest}...")
    try:
        cmd = ["git", "clone", "--depth", "1", repo_url, str(dest)]
        subprocess.run(cmd, check=True, cwd=str(ROOT))
        log(f"Successfully cloned {source_id}")
    except Exception as e:
        log(f"Error cloning {repo_url}: {e}")
        (dest / "FETCH_ERROR.txt").write_text(str(e), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Fetch meter datasets")
    parser.add_argument("--source", type=str, default="all", help="Source ID or 'all'")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    sources = data.get("sources", [])
    if args.source != "all":
        sources = [s for s in sources if s["id"] == args.source]

    log(f"Found {len(sources)} source(s) to process.")
    for s in sources:
        log(f"Processing source: {s['id']} ({s['name']})")
        stype = s.get("type")
        if stype == "huggingface":
            fetch_hf(s)
        elif stype == "github_direct":
            fetch_github(s)
        else:
            log(f"Unknown source type: {stype}")

    log("Fetch completed.")


if __name__ == '__main__':
    main()
