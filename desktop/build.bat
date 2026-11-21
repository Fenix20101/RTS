@echo off
rem Build "Steel Front" into a single exe. Double-click or run from any folder.
cd /d "%~dp0"
set PY=..\.venv-build\Scripts\python.exe
if not exist "%PY%" (
  echo Build environment not found. Create it:
  echo   python -m venv ..\.venv-build
  echo   ..\.venv-build\Scripts\python -m pip install pywebview pyinstaller pillow
  exit /b 1
)
"%PY%" make_icon.py || exit /b 1
"%PY%" -m PyInstaller --noconfirm --clean --onefile --windowed --name SteelFront --icon "%~dp0icon.ico" --add-data "%~dp0..\index.html;game" --add-data "%~dp0..\js;game\js"  --add-data "%~dp0..\assets;game\assets" --distpath "%~dp0..\dist" --workpath "%~dp0build" --specpath "%~dp0build" app.py || exit /b 1
echo.
echo Done: dist\SteelFront.exe
