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
