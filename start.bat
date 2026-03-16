@echo off
chcp 65001 > nul
echo.
echo ╔═══════════════════════════════════════════════╗
echo ║         Claude Monitor - Setup                ║
echo ╚═══════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo nodejs.org 에서 다운로드 후 다시 실행하세요.
    pause
    exit /b 1
)

echo [1/3] 의존성 설치 중...
call npm install
if %errorlevel% neq 0 (
    echo [오류] npm install 실패
    pause
    exit /b 1
)

echo [2/3] 앱 시작 중...
echo.
echo 앱이 시작됩니다. 시스템 트레이와 화면 우하단에 위젯이 나타납니다.
echo 종료하려면 시스템 트레이 아이콘을 우클릭 → Quit
echo.
call npm start

pause
