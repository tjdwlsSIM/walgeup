/* 월급노트 공통 스크립트 — 모든 계산기 페이지에서 사용하는 함수 */
const MIN_WAGE_2026 = 10320;                 // 2026년 최저시급
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const num = id => Number(document.getElementById(id).value.replace(/[^0-9.]/g,'')) || 0;

/* 금액 입력창(class="money")에 자동 콤마 */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input.money').forEach(el => {
    el.addEventListener('input', () => {
      const raw = el.value.replace(/[^0-9]/g,'');
      el.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    });
  });
});

/* 결과 명세서 복사: copyResult('#res-pay', '연차수당 산출내역') */
function copyResult(sel, title){
  const rows = [...document.querySelectorAll(sel+' .slip tr')]
    .filter(r => r.style.display !== 'none' && r.cells.length === 2);
  const text = '['+title+']\n'
    + rows.map(r => r.cells[0].textContent.trim()+' : '+r.cells[1].textContent.trim()).join('\n')
    + '\n(참고용 · 월급노트)';
  navigator.clipboard.writeText(text)
    .then(()=>alert('계산 결과가 복사되었습니다. 메모장이나 메신저에 붙여넣어 보세요.'))
    .catch(()=>alert('복사에 실패했습니다. 결과를 화면 캡처로 저장해 주세요.'));
}

/* 결과 영역 표시 */
function showResult(id){
  const el = document.getElementById(id);
  el.classList.add('show');
  el.scrollIntoView({behavior:'smooth', block:'nearest'});
}

/* ── 세후 실수령액 추정 (근로소득) — 2026년 4대보험 요율 + 소득세 한계세율 근사 ── */
const RATES_2026 = { pension:.0475, health:.03595, care:.004724, emp:.009, pensionCap:6370000 };
function laborIncomeDeduction(g){            // 근로소득공제(연)
  if(g <= 5e6)  return g*.7;
  if(g <= 15e6) return 3.5e6 + (g-5e6)*.4;
  if(g <= 45e6) return 7.5e6 + (g-15e6)*.15;
  if(g <= 1e8)  return 12e6 + (g-45e6)*.05;
  return Math.min(14.75e6 + (g-1e8)*.02, 20e6);
}
function marginalRate(base){                 // 과세표준별 한계세율
  if(base <= 14e6) return .06;
  if(base <= 50e6) return .15;
  if(base <= 88e6) return .24;
  if(base <= 15e7) return .35;
  if(base <= 3e8)  return .38;
  if(base <= 5e8)  return .40;
  if(base <= 1e9)  return .42;
  return .45;
}

/* ── 종합소득세 기본세율 산출세액 (누진공제 방식, 이 수치는 변경 금지) ──
   연봉 실수령액 계산기와 퇴직금 계산기(퇴직소득세)가 함께 사용 */
function basicIncomeTax(base){
  if(base <= 14000000)   return base * 0.06;
  if(base <= 50000000)   return base * 0.15 - 1260000;
  if(base <= 88000000)   return base * 0.24 - 5760000;
  if(base <= 150000000)  return base * 0.35 - 15440000;
  if(base <= 300000000)  return base * 0.38 - 19940000;
  if(base <= 500000000)  return base * 0.40 - 25940000;
  if(base <= 1000000000) return base * 0.42 - 35940000;
  return base * 0.45 - 65940000;
}
function estimateNet(bonus, monthly){
  const R = RATES_2026;
  const pension = monthly >= R.pensionCap ? 0 : Math.round(bonus*R.pension);
  const health  = Math.round(bonus*R.health);
  const care    = Math.round(bonus*R.care);
  const emp     = Math.round(bonus*R.emp);
  const annual  = monthly*12 + bonus;
  const taxBase = Math.max(annual - laborIncomeDeduction(annual) - 1.5e6 - annual*R.pension, 0);
  const tax     = Math.round(bonus * marginalRate(taxBase) * 1.1);   // 지방소득세 10% 포함
  const deduct  = pension + health + care + emp + tax;
  return { pension, health, care, emp, tax, deduct, net: bonus - deduct };
}

/* ── 최저임금 역산 (월급·주급 → 시급) ─────────────────────────────
   가장 흔한 오해가 '월급 ÷ 실근로시간'인데, 법정 월 근로시간에는
   유급 주휴시간이 포함돼야 정확합니다. 아래 함수들은 그 주휴시간을
   더한 유급 시간으로 나눠 시급을 역산합니다. (검증 가능한 순수 함수) */
const WEEKS_PER_MONTH = 4.345;                 // 365 ÷ 12 ÷ 7 ≈ 4.345주

/* 주 소정근로시간에 대한 유급 주휴시간
   · 주 15시간 미만이면 주휴수당이 발생하지 않아 0
   · 그 이상이면 (주 소정근로시간 ÷ 5), 최대 8시간 */
function weeklyHolidayHours(weekHours){
  if(weekHours < 15) return 0;
  return Math.min(weekHours / 5, 8);
}

/* 월 환산 유급 근로시간 = (주 소정근로시간 + 주휴시간) × 4.345, 정수로 반올림
   검증: 주 40시간 → 주휴 8시간 → (40+8)×4.345 = 208.56 → 209시간 */
function monthlyPaidHours(weekHours){
  return Math.round((weekHours + weeklyHolidayHours(weekHours)) * WEEKS_PER_MONTH);
}

/* 월급 → 시급 역산. 검증: 2,156,880 ÷ 209 = 10,320원 */
function hourlyFromMonthly(monthly, weekHours){
  const h = monthlyPaidHours(weekHours);
  return h > 0 ? monthly / h : 0;
}

/* 주급 → 시급 역산
   · includesHoliday=false: 순수 근로시간분만 지급 → 주급 ÷ 주 근로시간
   · includesHoliday=true : 주급에 주휴수당 포함 → 주급 ÷ (근로시간 + 주휴시간) */
function hourlyFromWeekly(weekly, weekHours, includesHoliday){
  const paid = includesHoliday ? weekHours + weeklyHolidayHours(weekHours) : weekHours;
  return paid > 0 ? weekly / paid : 0;
}

/* ── 불규칙 근무(알바·시프트) 평균 주 근무시간 ────────────────────
   주마다 근로시간이 다를 때, 주휴수당·최저임금 판단은 보통
   '4주 평균' 또는 '해당 기간 총합'으로 봅니다. (검증 가능한 순수 함수) */
/* 주별 근무시간 배열 → 평균 주 근무시간 (빈 칸은 호출부에서 걸러 넣음) */
function avgWeeklyHours(weeks){
  const vals = weeks.map(Number).filter(v => !isNaN(v));
  if(!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
/* 기간 총 근무시간 ÷ 주 수 → 평균 주 근무시간 */
function avgWeeklyFromTotal(totalHours, weeks){
  return weeks > 0 ? totalHours / weeks : 0;
}
/* 주휴수당 = (1주 소정근로시간 ÷ 40, 최대 1) × 8시간 × 시급 */
function juhyuPay(weekHours, hourly){
  return Math.min(weekHours, 40) / 40 * 8 * hourly;
}

/* ── 실업급여(구직급여) 계산 ─────────────────────────────────────
   상·하한액과 소정급여일수는 2026년 기준(변경 금지). 검증 가능한 순수 함수 */
const UI_MAX_2026 = 68100;   // 1일 상한액 (2026.1.1 이후 이직)
const UI_MIN_2026 = 66048;   // 1일 하한액 (최저시급 80% × 8시간)
const BENEFIT_DAYS = { u50:[120,150,180,210,240], o50:[120,180,210,240,270] };
const PERIOD_LABELS = ['1년 미만','1년 이상 ~ 3년 미만','3년 이상 ~ 5년 미만','5년 이상 ~ 10년 미만','10년 이상'];

/* 퇴직 전 3개월 임금 총액 → 1일 평균임금·구직급여(평균임금 60%, 상·하한 적용)
   반환: { avg, daily, capped }  capped: ''|'상한액 적용'|'하한액 적용' */
function jobseekerDaily(threeMonthWage){
  const avg = threeMonthWage / 91;                 // 3개월 ≈ 91일
  let daily = avg * 0.6, capped = '';
  if(daily > UI_MAX_2026){ daily = UI_MAX_2026; capped = '상한액 적용'; }
  else if(daily < UI_MIN_2026){ daily = UI_MIN_2026; capped = '하한액 적용'; }
  return { avg, daily, capped };
}

/* 나이 그룹·가입기간 구간 → 소정급여일수 */
function benefitDays(ageGroup, periodIdx){
  return BENEFIT_DAYS[ageGroup][periodIdx];
}

/* 두 날짜 기준 만 나이 (기준일에 생일이 지났는지 반영) */
function ageAt(birth, base){
  let age = base.getFullYear() - birth.getFullYear();
  const m = base.getMonth() - birth.getMonth();
  if(m < 0 || (m === 0 && base.getDate() < birth.getDate())) age--;
  return age;
}

/* 만 나이 → 나이 그룹 (50세 이상이면 o50) */
function ageGroupOf(age){ return age >= 50 ? 'o50' : 'u50'; }

/* 입사일·퇴사일 → 고용보험 가입기간 구간 인덱스
   구간: [0]1년 미만 [1]1~3년 [2]3~5년 [3]5~10년 [4]10년 이상 (소정급여일수표와 동일) */
function coveragePeriodIndex(hire, quit){
  const years = (quit - hire) / (365.25 * 24 * 3600 * 1000);
  if(years < 1) return 0;
  if(years < 3) return 1;
  if(years < 5) return 2;
  if(years < 10) return 3;
  return 4;
}

/* ── 계산 결과 URL 공유 ── */
/* 계산 실행 시 입력값을 쿼리스트링에 기록: setShareParams({salary:2500000, week:40}) */
function setShareParams(obj){
  const p = new URLSearchParams();
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if(v !== '' && v !== null && v !== undefined) p.set(k, v);
  });
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''));
}

/* 쿼리스트링 값으로 입력창 채우기 (money 입력은 콤마 포맷, 체크박스는 1/0) */
function fillInput(id, val){
  const el = document.getElementById(id);
  if(!el || val === null || val === '') return;
  if(el.type === 'checkbox'){ el.checked = val === '1'; return; }
  if(el.classList.contains('money')){
    const raw = String(val).replace(/[^0-9]/g,'');
    el.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    return;
  }
  el.value = val;
}

/* 현재 URL(계산 결과 링크) 복사 */
function copyLink(){
  navigator.clipboard.writeText(location.href)
    .then(()=>alert('결과 링크가 복사되었습니다. 이 주소를 열면 같은 계산 결과가 바로 표시됩니다.'))
    .catch(()=>alert('복사에 실패했습니다. 주소창의 URL을 직접 복사해 주세요.'));
}

/* ── 헤더 연도 선택 메뉴 (UI만 — 실제 연도 전환 로직은 아직 없음) ──
   [내년 확장 방법]
   1) 이 파일에 RATES_2027, MIN_WAGE_2027 등 연도별 상수 세트를 추가
   2) 각 페이지 헤더 .yrmenu의 '2027년' 항목에서 disabled를 제거하고,
      클릭 시 ?year=2027 파라미터로 이동하거나 localStorage에 연도를 저장
   3) 각 계산기에서 선택된 연도에 맞는 상수 세트를 골라 계산하도록 수정 */
function toggleYearMenu(e){
  e.stopPropagation();
  const btn = e.currentTarget;
  const menu = btn.parentElement.querySelector('.yrmenu');
  if(!menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  btn.setAttribute('aria-expanded', String(willOpen));
}
document.addEventListener('click', () => {
  document.querySelectorAll('.yrmenu:not([hidden])').forEach(m => {
    m.hidden = true;
    const btn = m.parentElement.querySelector('button.yr');
    if(btn) btn.setAttribute('aria-expanded', 'false');
  });
});

/* ── 계산 결과 이미지 저장 ──
   html2canvas는 버튼을 처음 누를 때 동적으로 로드 (초기 로딩에 영향 없음) */
let h2cLoading = null;
function loadHtml2Canvas(){
  if(window.html2canvas) return Promise.resolve();
  if(!h2cLoading){
    h2cLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => { h2cLoading = null; reject(new Error('html2canvas 로드 실패')); };
      document.head.appendChild(s);
    });
  }
  return h2cLoading;
}

/* ── 가이드 목록: 검색 + 페이지네이션 (guides/index.html에서만 동작) ──
   · 카드는 HTML에 전부 출력돼 있고(JS 없이도 전체 노출), 여기서 화면 표시만 제어
   · 검색 중에는 페이지네이션을 숨기고 일치 카드 전부 표시
   · 페이지 상태는 URL 해시(#page=2)로 남겨 뒤로가기가 동작 */
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('guide-list');
  if(!list) return;
  const input = document.getElementById('guide-search');
  const pager = document.getElementById('guide-pager');
  const empty = document.getElementById('guide-empty');
  const reset = document.getElementById('guide-empty-reset');
  const clearBtn = document.getElementById('guide-search-clear');
  const goBtn = document.getElementById('guide-search-go');
  const cards = [...list.querySelectorAll('.cardlink')];
  const PER = 8;
  let page = 1;

  const pageCount = () => Math.max(1, Math.ceil(cards.length / PER));
  const query = () => (input ? input.value.trim().toLowerCase() : '');

  function readHash(){
    const m = location.hash.match(/page=(\d+)/);
    const p = m ? parseInt(m[1], 10) : 1;
    return Math.min(Math.max(1, p), pageCount());
  }

  function scrollTop(){
    const anchor = (input && input.closest('.guide-search')) || list;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* 검색 모드: 페이저 숨기고 제목·설명에 검색어가 포함된 카드만 표시 */
  function showSearch(q){
    pager.hidden = true;
    let matched = 0;
    cards.forEach(c => {
      const hit = c.textContent.toLowerCase().includes(q);
      c.style.display = hit ? '' : 'none';
      if(hit) matched++;
    });
    empty.hidden = matched > 0;
  }

  /* 페이지네이션 모드: 현재 페이지의 8개만 표시 */
  function showPage(){
    empty.hidden = true;
    const pc = pageCount();
    if(page > pc) page = pc;
    if(pc <= 1){                     // 8개 이하면 페이저 자체를 감춤
      pager.hidden = true;
      cards.forEach(c => c.style.display = '');
      return;
    }
    pager.hidden = false;
    const start = (page - 1) * PER;
    cards.forEach((c, i) => {
      c.style.display = (i >= start && i < start + PER) ? '' : 'none';
    });
    buildPager(pc);
  }

  function buildPager(pc){
    pager.textContent = '';
    const mk = (label, target, current, disabled) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if(disabled) b.disabled = true;
      if(current){ b.className = 'on'; b.setAttribute('aria-current', 'page'); }
      if(!disabled) b.addEventListener('click', () => goTo(target));
      return b;
    };
    pager.appendChild(mk('« 이전', page - 1, false, page <= 1));
    for(let i = 1; i <= pc; i++) pager.appendChild(mk(String(i), i, i === page, false));
    pager.appendChild(mk('다음 »', page + 1, false, page >= pc));
  }

  function goTo(p){
    p = Math.min(Math.max(1, p), pageCount());
    const url = location.pathname + location.search + (p > 1 ? '#page=' + p : '');
    history.pushState(null, '', url);
    page = p;
    showPage();
    scrollTop();
  }

  /* 입력값 유무에 따라 지우기(X) 버튼 표시/숨김 */
  function syncClear(){
    if(clearBtn) clearBtn.hidden = !(input && input.value.length);
  }
  /* 검색어를 비우고 전체 목록으로 복귀 */
  function clearSearch(focus){
    if(input){ input.value = ''; if(focus) input.focus(); }
    syncClear();
    showPage();
  }

  if(input){
    input.addEventListener('input', () => {
      const q = query();
      if(q) showSearch(q);
      else showPage();               // 비우면 원래 페이지네이션 상태로 복귀
      syncClear();
    });
    /* 모바일 키보드의 '검색/완료'(Enter)로 키보드 내림 (form이 아니므로 직접 blur) */
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    });
    syncClear();
  }
  if(clearBtn){
    clearBtn.addEventListener('click', () => clearSearch(true));
  }
  if(goBtn){
    /* 검색은 입력 즉시 실시간 반영되므로, 이 버튼은 모바일 키보드 내림 용도 */
    goBtn.addEventListener('click', () => { if(input) input.blur(); });
  }
  if(reset){
    reset.addEventListener('click', () => clearSearch(true));
  }
  window.addEventListener('popstate', () => {   // 뒤로/앞으로 가기
    if(input) input.value = '';
    syncClear();
    page = readHash();
    showPage();
    scrollTop();
  });

  page = readHash();
  showPage();
});

/* 결과 명세서(.slip)를 2배 해상도 PNG로 저장: saveSlipImage('#res-pay .slip', '월급노트-연차수당.png') */
function saveSlipImage(slipSelector, filename){
  const slip = document.querySelector(slipSelector);
  if(!slip) return;
  loadHtml2Canvas().then(() => {
    // 캡처 직전 출처 워터마크를 붙였다가 캡처 후 제거
    const mark = document.createElement('div');
    mark.textContent = 'walgeupnote.com';
    mark.style.cssText = 'margin-top:10px;text-align:right;font-size:11px;color:#9AA3B0;letter-spacing:.08em';
    slip.appendChild(mark);
    return html2canvas(slip, { scale: 2, backgroundColor: '#FDFDFB' })
      .then(canvas => {
        mark.remove();
        const a = document.createElement('a');
        a.download = filename;
        a.href = canvas.toDataURL('image/png');
        a.click();
      })
      .catch(err => { mark.remove(); throw err; });
  }).catch(() => alert('이미지 저장에 실패했습니다. 화면 캡처를 이용해 주세요.'));
}
