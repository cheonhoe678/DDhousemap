@echo off
chcp 65001 >nul
title 든든전세 지도 실행
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [실행 실패] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo 처음 실행에 필요한 패키지를 설치합니다.
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [설치 실패] 인터넷 연결과 npm 상태를 확인해주세요.
    pause
    exit /b 1
  )
)

if not exist "public\data.json" (
  echo.
  echo 저장된 주택 데이터가 없어 HUG에서 처음 수집합니다.
  call npm.cmd run refresh
  if errorlevel 1 (
    echo.
    echo [수집 실패] 인터넷 연결 또는 원본 사이트 상태를 확인해주세요.
    pause
    exit /b 1
  )
)

echo.
echo 든든전세 지도를 시작합니다.
echo 브라우저 주소: http://127.0.0.1:4173
echo 서버를 끄려면 이 창에서 Ctrl+C를 누르세요.
echo.

start "" "http://127.0.0.1:4173"
call npm.cmd start

if errorlevel 1 (
  echo.
  echo 서버가 종료되었습니다. 위 오류 내용을 확인해주세요.
  pause
)
