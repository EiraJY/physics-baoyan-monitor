#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install -r requirements.txt
python3 crawler.py --all
python3 -m http.server 8000
