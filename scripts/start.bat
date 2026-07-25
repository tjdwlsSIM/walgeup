@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs

echo ============================================
echo  월급노트 자동 운영 루프 시작
echo ============================================
echo.

rem 이전에 멈춰 있던 이유를 먼저 보여준 뒤 해제한다 (조용히 지우면 원인을 놓친다)
if exist logs\HALT (
  echo [이전 HALT 사유]
  type logs\HALT
  echo.
  echo 위 문제가 해결되지 않았다면 다음 실행에서 다시 멈춥니다.
  echo.
  del /q logs\HALT
)

if exist logs\STOP (
  echo STOP 해제
  del /q logs\STOP
)

echo 루프를 시작합니다. 멈추려면 scripts\stop.bat 을 실행하거나 이 창을 닫으세요.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0loop.ps1"

echo.
echo 루프가 종료되었습니다.
pause
endlocal
