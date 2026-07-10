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
