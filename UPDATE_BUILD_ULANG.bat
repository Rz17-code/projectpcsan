@echo off
cd /d "%~dp0"
echo Membangun ulang aplikasi (pakai setelah kode diperbarui)...
call npm install
call npm run build
echo Selesai. Jalankan JALANKAN_PCSAN.bat
pause
