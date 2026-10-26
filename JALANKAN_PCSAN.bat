@echo off
title PCSAN OTOMATIS - JANGAN DITUTUP
cd /d "%~dp0"
where node >NUL 2>NUL
if errorlevel 1 (
  echo Node.js belum terpasang. Install versi LTS dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b
)
if not exist "node_modules\.bin\next.cmd" (
  echo Memasang paket ^(butuh internet, beberapa menit^)...
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if not exist "node_modules\.bin\next.cmd" (
    echo.
    echo [GAGAL] Pemasangan paket tidak selesai. Cek koneksi internet, lalu jalankan file ini lagi.
    echo Kalau folder ini ada di OneDrive, pindahkan dulu ke D:\pcsan-web atau C:\pcsan-web.
    pause
    exit /b
  )
)
if not exist ".next\BUILD_ID" (
  echo Menyiapkan aplikasi ^(build^)...
  call npm run build
  if not exist ".next\BUILD_ID" ( echo [GAGAL] Build tidak berhasil. Screenshot jendela ini dan kirim ke Claude. & pause & exit /b )
)
start "" http://localhost:3000
call npm start
pause
