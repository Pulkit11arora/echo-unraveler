import os
import shutil
import subprocess
import tempfile

import modal
from fastapi import Request

app = modal.App("echo-unraveler-separator")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("demucs", "pydub", "soundfile", "fastapi[standard]")
)

DEMUCS_MODEL = "htdemucs"


def _run_demucs(input_path: str, out_dir: str) -> str:
    cmd = [
        "python", "-m", "demucs",
        "-n", DEMUCS_MODEL,
        "-o", out_dir,
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed:\n{result.stdout}\n{result.stderr}")

    track_name = os.path.splitext(os.path.basename(input_path))[0]
    stems_dir = os.path.join(out_dir, DEMUCS_MODEL, track_name)
    if not os.path.isdir(stems_dir):
        raise RuntimeError(f"Expected stems directory not found: {stems_dir}")
    return stems_dir


def _combine_instrumental(stems_dir: str):
    from pydub import AudioSegment

    stem_files = ["drums.wav", "bass.wav", "other.wav"]
    combined = None
    for fname in stem_files:
        path = os.path.join(stems_dir, fname)
        if not os.path.isfile(path):
            continue
        seg = AudioSegment.from_wav(path)
        combined = seg if combined is None else combined.overlay(seg)
    if combined is None:
        raise RuntimeError("No instrumental stems found to combine.")
    return combined


@app.function(image=image, gpu="T4", timeout=300)
def separate(audio_bytes: bytes, filename: str) -> dict:
    from pydub import AudioSegment

    work_dir = tempfile.mkdtemp(prefix="demucs_")
    try:
        ext = os.path.splitext(filename)[1] or ".mp3"
        input_path = os.path.join(work_dir, f"input{ext}")
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        stems_dir = _run_demucs(input_path, work_dir)

        vocals_wav_path = os.path.join(stems_dir, "vocals.wav")
        if not os.path.isfile(vocals_wav_path):
            raise RuntimeError("Vocals stem not found after separation.")
        vocals_audio = AudioSegment.from_wav(vocals_wav_path)
        instrumental_audio = _combine_instrumental(stems_dir)

        output_dir = tempfile.mkdtemp(prefix="demucs_out_")
        vocals_mp3_path = os.path.join(output_dir, "vocals.mp3")
        instrumental_mp3_path = os.path.join(output_dir, "instrumental.mp3")

        vocals_audio.export(vocals_mp3_path, format="mp3", bitrate="320k")
        instrumental_audio.export(instrumental_mp3_path, format="mp3", bitrate="320k")

        with open(vocals_mp3_path, "rb") as f:
            vocals_bytes = f.read()
        with open(instrumental_mp3_path, "rb") as f:
            instrumental_bytes = f.read()

        return {"vocals": vocals_bytes, "instrumental": instrumental_bytes}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.function(image=image, timeout=300)
@modal.fastapi_endpoint(method="POST")
async def separate_endpoint(request: Request):
    import base64
    from fastapi.responses import JSONResponse

    form = await request.form()
    upload = form["audio_file"]
    audio_bytes = await upload.read()

    result = separate.remote(audio_bytes, upload.filename or "input.mp3")

    return JSONResponse({
        "vocals_b64": base64.b64encode(result["vocals"]).decode("ascii"),
        "instrumental_b64": base64.b64encode(result["instrumental"]).decode("ascii"),
    })
