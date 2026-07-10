@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ניתוח מבדקי ספקים — שרת מקומי
echo  ================================
echo  פתח בדפדפן: http://localhost:8765
echo  לחץ Ctrl+C לעצירה
echo.

where node >nul 2>&1
if %ERRORLEVEL%==0 (
  node server.js
  goto :done
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -m http.server 8765
  goto :done
)

echo  שגיאה: לא נמצא Node.js או Python.
echo  פתח index.html ישירות ב-Chrome/Edge
pause

:done
