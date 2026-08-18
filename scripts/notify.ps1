# 텔레그램 알림 — loop.ps1 이 dot-source 해서 쓴다.
#
#     . "$PSScriptRoot\notify.ps1"
#     Send-Telegram -Title "HALT" -Body "계산기 검증 실패"
#
# ── 설계 원칙 두 가지 ────────────────────────────────────────────────
#
# ① 알림이 실패해도 루프는 계속된다.
#    알림은 관측 수단이지 작업이 아니다. 텔레그램이 죽었다고 그날 글이
#    안 나가면 안 된다. 모든 실패를 삼키고 loop.txt 에만 남긴다.
#
# ② 토큰은 저장소에 들어가지 않는다.
#    scripts\telegram.local.json 은 .gitignore 에 있다. 이 파일이 없으면
#    알림 기능만 조용히 꺼지고 나머지는 그대로 돈다 — 설정 안 한 사람의
#    루프가 멈추는 일은 없어야 한다.

$script:TelegramConf     = $null
$script:TelegramLoaded   = $false
$script:TelegramWarned   = $false

function Get-TelegramConfig {
  if ($script:TelegramLoaded) { return $script:TelegramConf }
  $script:TelegramLoaded = $true

  # 1순위 환경변수 — CI 나 작업 스케줄러에서 주입하기 쉽다
  if ($env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_CHAT_ID) {
    $script:TelegramConf = @{ botToken = $env:TELEGRAM_BOT_TOKEN; chatId = $env:TELEGRAM_CHAT_ID }
    return $script:TelegramConf
  }

  # 2순위 로컬 파일
  $confPath = Join-Path $PSScriptRoot 'telegram.local.json'
  if (-not (Test-Path $confPath)) { return $null }

  try {
    $j = Get-Content $confPath -Raw -Encoding utf8 | ConvertFrom-Json
    if (-not $j.botToken -or -not $j.chatId) { return $null }
    if ($j.botToken -like '*여기에*' -or $j.chatId -like '*여기에*') { return $null }   # 예시 그대로면 미설정
    $script:TelegramConf = @{ botToken = [string]$j.botToken; chatId = [string]$j.chatId }
    return $script:TelegramConf
  } catch {
    return $null
  }
}

# HTML parse_mode 를 쓰므로 &, <, > 를 이스케이프해야 한다.
# 로그 본문에 <html> 조각이나 부등호가 섞이면 텔레그램이 400 을 돌려준다.
function ConvertTo-TelegramText($s) {
  if ($null -eq $s) { return '' }
  return ([string]$s).Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;')
}

function Send-Telegram {
  param(
    [Parameter(Mandatory=$true)][string] $Title,
    [string] $Body = '',
    [switch] $Silent          # 알림음 없이 (매일 리포트처럼 급하지 않은 것)
  )

  $conf = Get-TelegramConfig
  if (-not $conf) {
    if (-not $script:TelegramWarned) {
      $script:TelegramWarned = $true
      $msg = '텔레그램 미설정 — scripts\telegram.local.json 이 없거나 값이 비어 있어 알림을 건너뜁니다.'
      if (Get-Command Write-Log -ErrorAction SilentlyContinue) { Write-Log $msg } else { Write-Host $msg }
    }
    return $false
  }

  # 텔레그램 메시지 상한은 4096자. 넘으면 400 이 나므로 잘라 보낸다.
  $head = "<b>{0}</b>" -f (ConvertTo-TelegramText $Title)
  $text = if ($Body) { $head + "`n`n<pre>" + (ConvertTo-TelegramText $Body) + "</pre>" } else { $head }
  if ($text.Length -gt 3900) { $text = $text.Substring(0, 3900) + "`n…(생략)</pre>" }

  try {
    # Windows PowerShell 5.1 기본값이 TLS 1.0 이라 api.telegram.org 연결이 끊긴다
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $payload = @{
      chat_id              = $conf.chatId
      text                 = $text
      parse_mode           = 'HTML'
      disable_notification = [bool]$Silent
    } | ConvertTo-Json -Compress

    # 한글이 깨지지 않도록 UTF-8 바이트로 직접 보낸다.
    # 해시테이블을 그대로 -Body 로 넘기면 PowerShell 이 기본 인코딩으로 직렬화해
    # 한글이 물음표가 된다.
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $uri   = "https://api.telegram.org/bot$($conf.botToken)/sendMessage"

    Invoke-RestMethod -Uri $uri -Method Post -Body $bytes `
                      -ContentType 'application/json; charset=utf-8' `
                      -TimeoutSec 15 | Out-Null
    return $true
  }
  catch {
    # 실패 사유는 남기되 예외는 던지지 않는다 — 호출부가 try 로 감싸지 않아도 안전해야 한다.
    # 토큰이 예외 메시지에 실려 로그로 새는 일이 없도록 URL 은 적지 않는다.
    $msg = "텔레그램 전송 실패: $($_.Exception.Message)"
    if (Get-Command Write-Log -ErrorAction SilentlyContinue) { Write-Log $msg } else { Write-Host $msg }
    return $false
  }
}

# 색인 요청 대기열의 미처리 건수.
# CLAUDE.md 가 정한 패턴("- [ ] **")을 그대로 센다 — 형식을 바꾸면 여기도 바꿔야 한다.
function Get-PendingIndexCount($root) {
  $queue = Join-Path $root 'docs\index-request-queue.md'
  if (-not (Test-Path $queue)) { return 0 }
  try {
    return @(Select-String -Path $queue -Pattern '^- \[ \] \*\*' -ErrorAction Stop).Count
  } catch { return 0 }
}

# 실행 로그의 마지막 N줄. 리포트 본문으로 쓴다.
function Get-LogTail($path, $lines = 20) {
  if (-not (Test-Path $path)) { return '(로그 파일 없음)' }
  try {
    $t = (Get-Content $path -Tail $lines -Encoding utf8) -join "`n"
    if ([string]::IsNullOrWhiteSpace($t)) { return '(로그가 비어 있음)' }
    return $t
  } catch { return "(로그를 읽을 수 없음: $($_.Exception.Message))" }
}
