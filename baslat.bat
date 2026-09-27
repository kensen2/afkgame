@echo off
chcp 65001 >nul
title Zindan Dalgalari
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node serve.mjs
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:5173
  python -m http.server 5173
  goto :eof
)
echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kurup tekrar dene.
pause
