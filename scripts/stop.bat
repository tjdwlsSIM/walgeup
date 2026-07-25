@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs

rem 루프는 매 틱 시작에 이 파일을 확인한다. 진행 중인 작업은 끝까지 마치고 멈춘다.
echo %date% %time% 사용자가 중지 요청> logs\STOP

echo ============================================
echo  중지 요청을 남겼습니다.
echo ============================================
echo.
echo 루프는 현재 작업을 끝낸 뒤 다음 확인 시점(최대 5분)에 멈춥니다.
echo 지금 당장 끊으려면 루프 창을 직접 닫으세요.
echo.
echo 다시 시작: scripts\start.bat
echo.
pause
endlocal
