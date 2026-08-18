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

# 모드별 실행 상한(분). 초과하면 프로세스를 끊고 실패로 센다.
# 상한이 없으면 claude 가 멈췄을 때 루프가 영원히 서 있는다 — 멈춘 것과
# 일하는 중인 것을 구분할 방법이 없어 사용자는 그냥 기다리게 된다.
$TimeoutMin = @{ morning = 25; content = 60; evening = 20 }

$KeepDays    = 30           # 실행 로그 보관 기간. 넘으면 지운다
$IndexBacklog = 3           # 색인 요청 미처리가 이 건수 이상이면 알린다 (CLAUDE.md 기준과 동일)

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# 텔레그램 알림. 설정이 없으면 Send-Telegram 이 알아서 건너뛴다 —
# 여기서 분기하지 않는 이유는, 알림 미설정이 루프의 관심사가 아니기 때문이다.
. (Join-Path $PSScriptRoot 'notify.ps1')

# 오래된 실행 로그 정리 — 없으면 무한히 쌓인다.
# STOP·HALT·loop-state.json·loop.txt 는 건드리지 않는다(상태 파일이다).
function Clear-OldLogs {
  Get-ChildItem -Path $LogDir -Filter '*-*.txt' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-' -and $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    ForEach-Object {
      try { Remove-Item $_.FullName -Force -ErrorAction Stop; Write-Log "오래된 로그 삭제: $($_.Name)" }
      catch { }
    }
}

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
  Send-Telegram -Title '🛑 월급노트 — HALT (사람의 판단 필요)' `
                -Body "$reason`n`n해결 후 scripts\start.bat 으로 재시작하세요." | Out-Null
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

# 모드가 성공으로 끝났을 때 보내는 알림.
#
# 본문은 실행 로그의 꼬리를 그대로 쓴다. 에이전트에게 "알림용 요약을 따로
# 만들라"고 시키지 않는 이유는, 그렇게 하면 알림 형식이 프롬프트에 묶여
# 에이전트를 고칠 때마다 알림이 깨지기 때문이다. 로그는 이미 사람이 읽으라고
# 쓰인 것이라 그대로 보내면 된다.
function Send-ModeReport($mode, $runLog) {
  $tail    = Get-LogTail $runLog 20
  $pending = Get-PendingIndexCount $Root

  switch ($mode) {
    'content' {
      # 발행 여부는 publisher 의 커밋으로 판정한다. 발행이 없었다면
      # 마지막 커밋이 이전 것 그대로라 제목만 봐도 구분된다.
      $last = ''
      try { $last = (& git -C $Root log -1 --format='%h %s' 2>$null) } catch { }
      $body = if ($last) { "최근 커밋: $last`n`n$tail" } else { $tail }
      Send-Telegram -Title '📝 월급노트 — 콘텐츠 파이프라인 완료' -Body $body | Out-Null
    }
    'morning' { Send-Telegram -Title '☀️ 월급노트 — 아침 점검 완료' -Body $tail -Silent | Out-Null }
    'evening' { Send-Telegram -Title '🌙 월급노트 — 저녁 정리 완료' -Body $tail -Silent | Out-Null }
  }

  # 색인 요청은 사람이 직접 해야 하는 유일한 수동 작업이라 밀리면 따로 알린다.
  # 리포트 본문에 섞으면 묻힌다 — 조용한 알림 안에 든 경고는 경고가 아니다.
  if ($pending -ge $IndexBacklog) {
    Send-Telegram -Title "🔔 월급노트 — 색인 요청 ${pending}건 밀림" `
                  -Body "docs\index-request-queue.md 에 미처리 ${pending}건이 쌓였습니다.`n`nSearch Console / 네이버 서치어드바이저에서 직접 요청한 뒤 체크박스를 [x] 로 바꿔 주세요." | Out-Null
  }
}

Write-Log "=== 루프 시작 (간격 ${IntervalSec}초 · 저장소 $Root) ==="
Write-Log "멈추려면 scripts\stop.bat 을 실행하거나 이 창을 닫으세요."
Clear-OldLogs

while ($true) {

  if (Test-Path $StopFile) {
    Write-Log "STOP 감지 — 루프를 정상 종료합니다. (start.bat 으로 재시작)"
    break
  }

  # cto 가 qa 실패·3회 반려 에스컬레이션 시 직접 써 두는 파일도 여기서 걸린다.
  # 그 경로는 Set-Halt 를 거치지 않으므로 알림도 여기서 따로 보낸다.
  # 이미 보낸 HALT 를 다시 알리지 않도록 표식 파일로 한 번만 발송한다 —
  # 루프가 재시작될 때마다 같은 HALT 가 다시 날아오면 알림을 무시하게 된다.
  if (Test-Path $HaltFile) {
    $haltBody = (Get-Content $HaltFile -Raw)
    Write-Log "HALT 감지 — 사람의 판단이 필요합니다. 내용:"
    Write-Host $haltBody
    $sentMark = "$HaltFile.notified"
    if (-not (Test-Path $sentMark)) {
      Send-Telegram -Title '🛑 월급노트 — HALT (사람의 판단 필요)' -Body $haltBody | Out-Null
      New-Item -ItemType File -Path $sentMark -Force | Out-Null
    }
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

    $limit = $TimeoutMin[$mode]
    Write-Log "$mode 모드 실행 — $bat (상한 ${limit}분)"

    # 상한을 걸어 실행한다. cmd /c 로 감싸는 이유는 배치가 낳은 자식(claude)까지
    # 한 프로세스 트리로 끊기 위해서다.
    $proc = Start-Process -FilePath $env:ComSpec -ArgumentList '/c', "`"$bat`"" `
                          -WorkingDirectory $Root -NoNewWindow -PassThru
    if (-not $proc.WaitForExit($limit * 60 * 1000)) {
        Write-Log "$mode 모드 시간 초과(${limit}분) — 프로세스를 종료합니다."
        try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop }
        catch { Write-Log "  종료 실패: $($_.Exception.Message)" }
        # 배치가 남긴 자식 프로세스 정리 (claude 가 살아남으면 다음 틱과 겹친다)
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$($proc.Id)" -ErrorAction SilentlyContinue |
            ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
        $code = 124                              # 관례상 timeout 종료 코드
    }
    else {
        # ★ 인자 있는 WaitForExit(ms) 만으로는 ExitCode 가 채워지지 않는 경우가 있다.
        #   비어 있으면 `$code -eq 0` 이 거짓이 돼 **성공한 실행이 실패로 집계**되고,
        #   3번 쌓이면 멀쩡한데도 HALT 가 걸린다. 인자 없는 WaitForExit() 를 한 번 더
        #   불러 종료 처리를 끝낸 뒤 읽는다. (2026-07-28 로그의 "exit=" 공백이 이 증상)
        $proc.WaitForExit()
        $code = $proc.ExitCode
        if ($null -eq $code) {
            Write-Log "$mode 종료 코드를 읽지 못했습니다 — 성공으로 간주하지 않고 실패로 셉니다."
            $code = 1
        }
    }

    # cto 가 HALT 를 남겼다면 exit 0 이어도 성공이 아니다.
    # lastRuns 에 오늘을 기록하지 않는다 — 기록해 버리면 start.bat 이 HALT 를 해제한 뒤
    # 그 모드가 '오늘 이미 실행됨'으로 판정돼 건너뛰어진다. morning 이 그렇게 건너뛰어지면
    # 계산기 검증 없이 content 가 진행된다(검증 게이트가 무력화된다).
    $halted = Test-Path $HaltFile

    if ($halted) {
      Write-Log "$mode 모드가 HALT 를 남겼습니다 (exit=$code) — 실행 기록 안 함. 재시작 시 이 모드부터 다시 실행됩니다."
      # 연속 실패로 세지 않는다. 사람의 판단을 기다리는 것이지 재시도할 실패가 아니다.
      continue                     # 다음 틱 시작에서 HALT 를 감지해 루프가 멈춘다
    }

    if ($code -eq 0) {
      $state[$mode] = Get-Date -Format 'yyyy-MM-dd'
      $state.fails  = 0
      Save-State $state
      $runLog = Join-Path $LogDir ("{0}-{1}.txt" -f (Get-Date -Format 'yyyy-MM-dd'), $mode)
      Write-Log "$mode 모드 완료 (exit=0) — 로그: logs\$(Get-Date -Format 'yyyy-MM-dd')-$mode.txt"
      Send-ModeReport $mode $runLog
    }
    else {
      $state.fails = $state.fails + 1
      Save-State $state
      Write-Log "$mode 모드 실패 (exit=$code) — 연속 실패 $($state.fails)/$MaxFails"
      if ($state.fails -ge $MaxFails) {
        Set-Halt "$mode 모드가 연속 $($state.fails)회 실패했습니다 (마지막 exit=$code). logs\$(Get-Date -Format 'yyyy-MM-dd')-$mode.txt 를 확인하세요."
        # 사유를 HALT 에 적었으므로 카운터의 역할은 끝났다. 0 으로 되돌려
        # 재시작 직후 단 한 번의 실패로 다시 멈추는 일을 막는다.
        $state.fails = 0
        Save-State $state
        continue
      }
    }
  }

  Start-Sleep -Seconds $IntervalSec
}

Write-Log "=== 루프 종료 ==="
