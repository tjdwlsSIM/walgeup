# 월급노트 자동 운영 루프
#
# 5분마다 깨어나 "지금 할 일이 있는지"만 확인한다. 없으면 API 호출 0회로 다시 잔다.
# 작업 실행은 기존 scripts\run-<mode>.bat 를 그대로 호출한다(로그 기록도 그쪽이 담당).
#
# 사용자 조작면은 두 개다:
#   scripts\stop.bat   — 멈춤 (logs\STOP 생성)
#   scripts\start.bat  — 재시작 (STOP·HALT 해제 후 이 스크립트 실행)
#
# 멈추는 경우는 세 가지:
#   ① logs\STOP        사용자가 stop.bat 을 눌렀다
#   ② logs\HALT        사람의 판단이 필요하다 (qa 실패, 3회 반려 에스컬레이션, 연속 실패)
#   ③ 창을 닫음        다음 start.bat 에서 이어서 진행된다

$ErrorActionPreference = 'Stop'

$Root        = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir      = Join-Path $Root 'logs'
$StopFile    = Join-Path $LogDir 'STOP'
$HaltFile    = Join-Path $LogDir 'HALT'
$StateFile   = Join-Path $LogDir 'loop-state.json'
$LoopLog     = Join-Path $LogDir 'loop.txt'
$IntervalSec = 300          # 5분. 할 일이 없는 틱은 API 를 쓰지 않으므로 짧아도 공짜다
$MaxFails    = 3            # 연속 실패 3회면 HALT. 실패를 무한 재시도하며 쿼터를 태우지 않는다

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

function Write-Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -Path $LoopLog -Value $line -Encoding utf8
}

function Load-State {
  if (Test-Path $StateFile) {
    try {
      $j = Get-Content $StateFile -Raw | ConvertFrom-Json
      return @{
        morning = [string]$j.lastRuns.morning
        content = [string]$j.lastRuns.content
        evening = [string]$j.lastRuns.evening
        fails   = [int]$j.consecutiveFailures
      }
    } catch {
      Write-Log "상태 파일을 읽을 수 없어 초기화합니다: $($_.Exception.Message)"
    }
  }
  return @{ morning = ''; content = ''; evening = ''; fails = 0 }
}

function Save-State($s) {
  @{
    lastRuns            = @{ morning = $s.morning; content = $s.content; evening = $s.evening }
    consecutiveFailures = $s.fails
    updated             = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  } | ConvertTo-Json -Depth 4 | Out-File -FilePath $StateFile -Encoding utf8
}

function Set-Halt($reason) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $lines = @($stamp, '', "사유: $reason", '', '해결 후 scripts\start.bat 으로 재시작하세요.')
  Out-File -FilePath $HaltFile -InputObject $lines -Encoding utf8
  Write-Log "HALT 생성 — $reason"
}

# 지금 시각·요일과 마지막 실행일로 '밀린 작업'을 판정한다.
# 한 틱에 하나만 실행한다 — morning 의 계산기 검증이 content 보다 먼저 끝나야 한다.
function Get-DueMode($s) {
  $today = Get-Date -Format 'yyyy-MM-dd'
  $hour  = (Get-Date).Hour
  $dow   = [string](Get-Date).DayOfWeek

  $isContentDay = @('Monday','Wednesday','Friday') -contains $dow

  if ($hour -ge 9  -and $s.morning -ne $today) { return 'morning' }
  if ($hour -ge 15 -and $isContentDay -and $s.content -ne $today) { return 'content' }
  if ($hour -ge 18 -and $s.evening -ne $today) { return 'evening' }
  return $null
}

Write-Log "=== 루프 시작 (간격 ${IntervalSec}초 · 저장소 $Root) ==="
Write-Log "멈추려면 scripts\stop.bat 을 실행하거나 이 창을 닫으세요."

while ($true) {

  if (Test-Path $StopFile) {
    Write-Log "STOP 감지 — 루프를 정상 종료합니다. (start.bat 으로 재시작)"
    break
  }

  # cto 가 qa 실패·3회 반려 에스컬레이션 시 직접 써 두는 파일도 여기서 걸린다
  if (Test-Path $HaltFile) {
    Write-Log "HALT 감지 — 사람의 판단이 필요합니다. 내용:"
    Write-Host (Get-Content $HaltFile -Raw)
    Write-Log "해결 후 scripts\start.bat 으로 재시작하세요."
    break
  }

  $state = Load-State
  $mode  = Get-DueMode $state

  if (-not $mode) {
    Write-Log "대기 — 밀린 작업 없음 (morning:$($state.morning) content:$($state.content) evening:$($state.evening))"
  }
  else {
    $bat = Join-Path $Root "scripts\run-$mode.bat"
    if (-not (Test-Path $bat)) {
      Set-Halt "실행 파일이 없습니다: $bat"
      continue
    }

    Write-Log "$mode 모드 실행 — $bat"
    & $bat
    $code = $LASTEXITCODE

    if ($code -eq 0) {
      $state[$mode] = Get-Date -Format 'yyyy-MM-dd'
      $state.fails  = 0
      Save-State $state
      Write-Log "$mode 모드 완료 (exit=0) — 로그: logs\$(Get-Date -Format 'yyyy-MM-dd')-$mode.txt"
    }
    else {
      $state.fails = $state.fails + 1
      Save-State $state
      Write-Log "$mode 모드 실패 (exit=$code) — 연속 실패 $($state.fails)/$MaxFails"
      if ($state.fails -ge $MaxFails) {
        Set-Halt "$mode 모드가 연속 $($state.fails)회 실패했습니다 (마지막 exit=$code). logs\$(Get-Date -Format 'yyyy-MM-dd')-$mode.txt 를 확인하세요."
        continue
      }
    }
  }

  Start-Sleep -Seconds $IntervalSec
}

Write-Log "=== 루프 종료 ==="
