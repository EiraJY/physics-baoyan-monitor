@echo off
chcp 65001 >nul
python -m pip install -r requirements.txt
if errorlevel 1 exit /b 1
python crawler.py --all
if errorlevel 1 exit /b 1
start "" http://localhost:8000/
python -m http.server 8000
