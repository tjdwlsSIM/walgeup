/* 계산기 회귀 테스트 — tests/baseline.json 의 기대값과 실제 계산 결과를 대조한다.
   실행: node tests/run.js      (전부 통과 exit 0, 하나라도 틀리면 exit 1)

   ★ 기대값은 baseline.json 에만 둔다. 이 파일은 "그 값을 어떻게 계산하는가"만 안다.
     기대값을 여기 또 적으면 사본이 되고, 한쪽만 갱신되며 조용히 어긋난다
     — assets/common.js 맨 위가 경고하는 바로 그 사고다.

   ★ 실패했다고 baseline.json 을 고치지 마라. 계산기가 틀렸는지 baseline 이 낡았는지를
     먼저 가린다. 법령·요율이 실제로 바뀌어 갱신할 때는 1차 출처를 커밋 메시지에 남긴다. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const B = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline.json'), 'utf8'));

/* common.js 는 브라우저 전역 스크립트라 require 되지 않는다.
   DOM·sessionStorage 를 스텁으로 넣고 순수 함수만 꺼내 쓴다. */
function loadCommon() {
  const src = fs.readFileSync(path.join(root, 'assets/common.js'), 'utf8');
  const doc = {
    addEventListener() {}, querySelectorAll: () => [], getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { toggle() {} }, setAttribute() {}, appendChild() {} })
  };
  let year = '2026';
  const ss = { getItem: () => year, setItem: (k, v) => { year = v; } };
  return new Function('document', 'sessionStorage', 'window', src +
    '; return {monthlyPaidHours,hourlyFromMonthly,juhyuPay,jobseekerDaily,benefitDays,' +
    'insurancePremiums,ratesData,estimateNet,isUnconfirmed,YEAR_DATA,setYear};')(doc, ss, {});
}

/* 페이지 안에 있는 순수 함수 하나를 꺼내 온다 (연차 누적일수). */
function loadPageFn(file, name) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const m = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}', 'm').exec(src);
  if (!m) throw new Error(file + ' 에서 ' + name + ' 을 찾지 못했습니다');
  return new Function(m[0] + '; return ' + name + ';')();
}

const M = loadCommon();
const accruedLeave = loadPageFn('annual-leave/index.html', 'accruedLeave');
const R = (n) => Math.round(n);
const D = (s) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d); };

/* id → 기대값과 같은 모양의 실제값을 만든다. baseline 에 없는 키는 만들지 않는다. */
const EVAL = {
  'annual-leave-monthly': (i) => {
    const h = M.hourlyFromMonthly(i.monthlySalary, i.weekHours);
    return { hourlyOrdinary: R(h), dailyOrdinary: R(h * 8), total: R(h * 8 * i.unusedDays) };
  },
  'annual-leave-net': (i) => {
    const n = M.estimateNet(i.bonus, i.monthlySalary);
    return { deduct: n.deduct, net: n.net };
  },
  'annual-leave-accrued-1y': (i) => ({ accruedDays: accruedLeave(D(i.hireDate), D(i.quitDate)).total }),
  'annual-leave-accrued-3y': (i) => ({ accruedDays: accruedLeave(D(i.hireDate), D(i.quitDate)).total }),
  'unemployment': (i) => {
    const u = M.jobseekerDaily(i.threeMonthWage), days = M.benefitDays(i.ageGroup, i.periodIdx);
    return { dailyAvgWage: R(u.avg), dailyBenefit: u.daily, capped: u.capped, days, total: u.daily * days };
  },
  'weekly-holiday': (i) => ({ juhyuPay: M.juhyuPay(i.weekHours, i.hourly) }),
  'minimum-wage-pass': (i) => {
    const h = R(M.hourlyFromMonthly(i.monthlySalary, i.weekHours));
    return { hourly: h, verdict: h >= M.YEAR_DATA[2026].minWage ? '통과' : '위반' };
  },
  'minimum-wage-violation': (i) => ({
    verdict: R(M.hourlyFromMonthly(i.monthlySalary, i.weekHours)) >= M.YEAR_DATA[2026].minWage ? '통과' : '위반'
  }),
  'monthly-paid-hours': (i) => ({ monthlyPaidHours: M.monthlyPaidHours(i.weekHours) }),
  'pension-cap-applied': (i) => {
    const p = M.insurancePremiums(i.base);
    return { pensionBase: p.pensionBase, pensionCapApplied: p.pensionCapApplied, pensionWorker: p.p.w };
  },
  'pension-floor-applied': (i) => {
    const p = M.insurancePremiums(i.base);
    return { pensionBase: p.pensionBase, pensionCapApplied: p.pensionCapApplied, pensionWorker: p.p.w };
  },
  'year-2027-pension-rate': (i) => ({
    pensionWorker: R(i.base * M.ratesData().pension),
    pensionRateUnconfirmed: M.isUnconfirmed('pensionRate', 2027)
  }),
  'year-2027-health-rate': (i) => ({
    healthWorker: R(i.base * M.ratesData().health),
    healthRateUnconfirmed: M.isUnconfirmed('healthRate', 2027)
  }),
  'year-2027-minwage': () => {
    const Y = M.YEAR_DATA[2027];
    return { minWage: Y.minWage, minWageWithHoliday: Y.minWageWithHoliday, minMonthly: Y.minMonthly };
  },
  'year-2027-ui-min': () => ({ uiMin: M.YEAR_DATA[2027].uiMin }),
  'year-2027-ui-max-unconfirmed': () => ({
    uiMax: M.YEAR_DATA[2027].uiMax,
    unconfirmed: M.isUnconfirmed('uiMax', 2027),
    unconfirmedKeys: M.YEAR_DATA[2027].unconfirmed
  }),
  'year-2027-ui-inverted-floor': (i) => {
    const u = M.jobseekerDaily(i.threeMonthWage);
    return { daily: u.daily, capped: u.capped };
  }
};

/* 순수 함수로 꺼낼 수 없는 케이스 — DOM 에 묶인 계산이라 브라우저에서 확인해야 한다.
   조용히 건너뛰면 통과한 것처럼 보이므로 개수를 따로 보고한다. */
const NOT_COVERED = {
  'severance': 'severance/index.html calcSeverance() 가 DOM 입력에 묶여 있음',
  'salary-net': 'salary/index.html calcSalary() 가 DOM 입력에 묶여 있음'
};

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let pass = 0, fail = 0;
const skipped = [];
const rows = [];

for (const c of B.cases) {
  if (NOT_COVERED[c.id]) { skipped.push(c); continue; }
  const run = EVAL[c.id];
  if (!run) { skipped.push(Object.assign({}, c, { _why: 'tests/run.js 에 평가기가 없음' })); continue; }
  M.setYear(c.year);
  let actual;
  try { actual = run(c.input || {}); }
  catch (e) { rows.push(['✗', c.name, '실행 오류: ' + e.message]); fail++; continue; }
  const bad = Object.keys(c.expect).filter(k => !eq(c.expect[k], actual[k]));
  if (bad.length) {
    fail++;
    rows.push(['✗', c.name, bad.map(k =>
      k + ' 기대 ' + JSON.stringify(c.expect[k]) + ' 실제 ' + JSON.stringify(actual[k])).join(' / ')]);
  } else { pass++; rows.push(['OK', c.name, Object.keys(c.expect).join(', ')]); }
}

const w = Math.max(...rows.map(r => r[1].length));
for (const [s, n, d] of rows) console.log('  ' + (s === 'OK' ? 'OK ' : '✗  ') + n.padEnd(w) + '  ' + d);

if (skipped.length) {
  console.log('\n  미검증 ' + skipped.length + '건 (브라우저에서 수동 확인):');
  for (const c of skipped) console.log('    - ' + c.name + ' — ' + (NOT_COVERED[c.id] || c._why));
}
console.log('\n' + pass + '/' + (pass + fail) + ' 통과' + (skipped.length ? ' · 미검증 ' + skipped.length : ''));

if (fail) {
  console.log('\n실패 원인을 찾기 전에는 assets/common.js 를 고치지 마라.');
  console.log('그리고 통과시키려고 tests/baseline.json 을 고치는 것은 테스트를 없애는 것이다.');
}
process.exit(fail ? 1 : 0);
