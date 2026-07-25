@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%d
set LOG=logs\%TODAY%-content.txt

echo [%date% %time%] content 모드 시작 >> "%LOG%"
rem claude 는 npm 셈(claude.cmd)이므로 반드시 call 로 부른다.
rem call 없이 부르면 제어가 넘어가 아래 줄들이 실행되지 않는다.
call claude -p "cto 에이전트를 content 모드로 실행해서 가이드 글 1편을 생산해줘" >> "%LOG%" 2>&1
set CODE=%ERRORLEVEL%
echo [%date% %time%] 종료 (exit=%CODE%) >> "%LOG%"
rem loop.ps1 이 성공·실패를 판정하려면 종료 코드를 그대로 넘겨야 한다
endlocal & exit /b %CODE%
