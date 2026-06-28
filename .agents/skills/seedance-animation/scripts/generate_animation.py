#!/usr/bin/env python3
"""
Seedance 2.0 animation generator via KIE.AI API.
Submits a video generation task and polls until complete, then downloads the result.
"""

import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


# ── Configuration ─────────────────────────────────────────────────────────────

API_BASE = "https://api.kie.ai/api/v1"
CREATE_URL = f"{API_BASE}/jobs/createTask"
STATUS_URL = f"{API_BASE}/jobs/recordInfo"

POLL_INTERVAL_INITIAL = 8    # seconds between first polls
POLL_INTERVAL_MAX = 20       # cap on backoff
TIMEOUT_SECONDS = 600        # 10-minute hard timeout


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_api_key() -> str:
    """Load KIE_API_KEY from environment or .env file in cwd."""
    key = os.environ.get("KIE_API_KEY", "")
    if not key:
        env_path = Path.cwd() / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("KIE_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        sys.exit("ERROR: KIE_API_KEY not found. Set it in the environment or in a .env file.")
    return key


def api_request(method: str, url: str, *, headers: dict, body: bytes | None = None) -> dict:
    """Make an HTTP request and return parsed JSON. Raises on HTTP errors."""
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        sys.exit(f"HTTP {e.code} from {url}:\n{body_text}")
    except urllib.error.URLError as e:
        sys.exit(f"Network error contacting {url}: {e.reason}")


def upload_image(image_path: str, api_key: str) -> str:
    """
    Upload a local image to KIE.AI and return asset:// URL.
    KIE.AI accepts multipart/form-data uploads via /api/v1/assets/upload.
    """
    upload_url = f"{API_BASE}/assets/upload"
    path = Path(image_path)
    if not path.exists():
        sys.exit(f"ERROR: Image file not found: {image_path}")

    mime_type, _ = mimetypes.guess_type(str(path))
    if not mime_type:
        mime_type = "image/jpeg"

    # Build multipart body manually (no external deps)
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    file_bytes = path.read_bytes()
    filename = path.name

    parts = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    )
    parts.append(f"Content-Type: {mime_type}\r\n\r\n".encode())
    parts.append(file_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }

    print(f"  Uploading image: {filename} ({len(file_bytes):,} bytes)...")
    resp = api_request("POST", upload_url, headers=headers, body=body)

    if resp.get("code") != 200:
        sys.exit(f"Upload failed: {resp}")

    asset_id = resp["data"]["assetId"]
    print(f"  Upload complete. Asset ID: {asset_id}")
    return f"asset://{asset_id}"


def resolve_image(image_input: str, api_key: str) -> str:
    """
    Return a URL suitable for first_frame_url.
    - If it's already an http/https URL, use it directly.
    - If it's a local path, upload it and return asset:// reference.
    """
    if image_input.startswith("http://") or image_input.startswith("https://"):
        return image_input
    return upload_image(image_input, api_key)


def create_task(prompt: str, image_url: str, aspect_ratio: str, resolution: str, api_key: str) -> str:
    """Submit a generation task and return the taskId."""
    payload = {
        "model": "bytedance/seedance-2",
        "input": {
            "prompt": prompt,
            "first_frame_url": image_url,
            "duration": 5,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "generate_audio": False,
            "web_search": False,
        },
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = json.dumps(payload).encode("utf-8")

    print("  Submitting generation task to Seedance 2.0...")
    resp = api_request("POST", CREATE_URL, headers=headers, body=body)

    if resp.get("code") != 200:
        sys.exit(f"Task creation failed: {resp}")

    task_id = resp["data"]["taskId"]
    print(f"  Task created: {task_id}")
    return task_id


def poll_task(task_id: str, api_key: str) -> dict:
    """Poll until the task reaches a terminal state. Returns the task data dict."""
    headers = {"Authorization": f"Bearer {api_key}"}
    url = f"{STATUS_URL}?taskId={task_id}"

    interval = POLL_INTERVAL_INITIAL
    deadline = time.time() + TIMEOUT_SECONDS
    last_state = None

    print("  Waiting for generation to complete...")
    while time.time() < deadline:
        time.sleep(interval)
        resp = api_request("GET", url, headers=headers)

        if resp.get("code") != 200:
            sys.exit(f"Status check failed: {resp}")

        data = resp["data"]
        state = data.get("state", "unknown")

        if state != last_state:
            progress = data.get("progress")
            progress_str = f" ({progress}%)" if progress is not None else ""
            print(f"  Status: {state}{progress_str}")
            last_state = state

        if state == "success":
            return data
        if state == "fail":
            fail_msg = data.get("failMsg", "No details provided")
            fail_code = data.get("failCode", "")
            sys.exit(f"Generation failed (code {fail_code}): {fail_msg}")

        # Backoff: increase interval up to max
        interval = min(interval + 4, POLL_INTERVAL_MAX)

    sys.exit(f"Timed out after {TIMEOUT_SECONDS}s waiting for task {task_id}")


def download_video(task_data: dict, output_dir: str, task_id: str) -> str:
    """Parse resultJson and download the video. Returns the local file path."""
    result_json_str = task_data.get("resultJson", "{}")
    try:
        result = json.loads(result_json_str)
    except json.JSONDecodeError:
        sys.exit(f"Could not parse resultJson: {result_json_str!r}")

    urls = result.get("resultUrls", [])
    if not urls:
        sys.exit(f"No result URLs in response: {result}")

    video_url = urls[0]
    print(f"  Downloading from: {video_url}")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    out_file = output_path / f"{task_id}.mp4"

    try:
        req = urllib.request.Request(
            video_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://kie.ai/",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            out_file.write_bytes(resp.read())
    except urllib.error.URLError as e:
        sys.exit(f"Failed to download video: {e}")

    return str(out_file)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate a 5-second loop animation with Seedance 2.0 via KIE.AI"
    )
    parser.add_argument(
        "--image", required=True,
        help="Reference image: local file path or https:// URL (used as first frame)"
    )
    parser.add_argument(
        "--prompt", required=True,
        help="Text prompt describing the animation motion"
    )
    parser.add_argument(
        "--aspect-ratio", default="16:9",
        choices=["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
        help="Output aspect ratio (default: 16:9)"
    )
    parser.add_argument(
        "--resolution", default="720p",
        choices=["480p", "720p"],
        help="Output resolution (default: 720p)"
    )
    parser.add_argument(
        "--output-dir", default=".",
        help="Directory to save the downloaded video (default: current directory)"
    )
    args = parser.parse_args()

    print("\n=== Seedance 2.0 Animation Generator ===\n")

    # 1. Load API key
    api_key = load_api_key()

    # 2. Resolve image (upload if local file)
    print("[1/4] Resolving image reference...")
    image_url = resolve_image(args.image, api_key)

    # 3. Submit task
    print("[2/4] Creating generation task...")
    task_id = create_task(
        prompt=args.prompt,
        image_url=image_url,
        aspect_ratio=args.aspect_ratio,
        resolution=args.resolution,
        api_key=api_key,
    )

    # 4. Poll until done
    print("[3/4] Monitoring generation progress...")
    task_data = poll_task(task_id, api_key)

    cost_ms = task_data.get("costTime")
    if cost_ms:
        print(f"  Generation completed in {cost_ms / 1000:.1f}s")

    # 5. Download
    print("[4/4] Downloading video...")
    output_file = download_video(task_data, args.output_dir, task_id)

    print(f"\n=== Done ===")
    print(f"Video saved to: {output_file}")
    print()
    print("Embed on your web page with:")
    print('<video autoplay loop muted playsinline>')
    print(f'  <source src="{Path(output_file).name}" type="video/mp4">')
    print('</video>')
    print()


if __name__ == "__main__":
    main()
