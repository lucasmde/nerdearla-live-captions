@echo off
title Live Captions - servidor
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\nodejs
where node >nul 2>nul || (echo Falta Node.js: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias... & call npm install --no-audit --no-fund)
echo Servidor en http://localhost:8080  (dejar esta ventana abierta)
start "" http://localhost:8080/s/main?lang=es
node server\index.js
pause
