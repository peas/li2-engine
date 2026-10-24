#!/usr/bin/env python3
"""Render dialogue lines with Kokoro-82M (pt-BR) for scripts/gerar-vozes.mjs.

Reads a JSON list of jobs on stdin and writes one WAV (24 kHz, mono) per job:
    [{"texto": "Olá!", "voz": "pf_dora", "velocidade": 1.0, "saida": "/tmp/x.wav"}, ...]
The model is loaded once for the whole batch (loading it costs more than rendering a line).

Needs a venv (default <game>/local/kokoro-venv: `python3.12 -m venv local/kokoro-venv && local/kokoro-venv/bin/pip install kokoro soundfile`) and Homebrew's espeak-ng
(`brew install espeak-ng`): the espeakng-loader wheel ships without its data on macOS, so this script points
phonemizer at /opt/homebrew unless ESPEAK_DATA_PATH is already set.

Usage: kokoro-fala.py [--help] < jobs.json
"""
import json
import os
import sys

if "--help" in sys.argv or "-h" in sys.argv:
    print(__doc__)
    sys.exit(0)

os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/share/espeak-ng-data")
os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
os.environ.setdefault("PHONEMIZER_ESPEAK_PATH", "/opt/homebrew/bin/espeak-ng")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KPipeline  # noqa: E402

jobs = json.load(sys.stdin)
pipeline = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")
for job in jobs:
    chunks = [np.asarray(audio) for _, _, audio in pipeline(job["texto"], voice=job["voz"], speed=float(job.get("velocidade", 1.0)))]
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    sf.write(job["saida"], audio, 24000)
    print(json.dumps({"saida": job["saida"], "segundos": round(len(audio) / 24000, 2)}), flush=True)
