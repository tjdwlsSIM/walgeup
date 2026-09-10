/* 콘텐츠·SEO 정합성 검사 — 계산이 아니라 "글과 표시가 서로 맞는가"를 본다.
   실행: node tests/check-content.js     (문제 없으면 exit 0, 있으면 exit 1)

   여기서 잡는 것은 전부 실제로 났던 사고다.
   · FAQ JSON-LD 가 페이지에 없는 질문을 선언 — 구글은 구조화 데이터가 화면에 보이는
     내용과 일치하기를 요구한다. 어긋나면 리치결과 수동 조치 대상이 될 수 있다.
   · canonical 이 자기 주소와 다름 / 후행 슬래시 누락 / index.html 링크 — 중복 색인 신호
   · sitemap 에 없는 페이지 — 목록에서만 링크되면 크롤링 우선순위가 밀린다 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ORIGIN = 'https://walgeupnote.com';

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) files.push(path.relative(root, p).replace(/\\/g, '/'));
  }
})(root);

const strip = (s) => s
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const urlOf = (f) => '/' + f.replace(/index\.html$/, '');
const pageExists = (u) => fs.existsSync(path.join(root, (u.endsWith('/') ? u + 'index.html' : u).slice(1)));

let fail = 0;
const bad = (m) => { console.log('  ✗  ' + m); fail++; };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* ── 1. JSON-LD 파싱 + FAQ 가 페이지 실물과 일치하는가 ── */
for (const f of files) {
  const h = read(f);
  for (const b of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let o;
    try { o = JSON.parse(b[1]); } catch (e) { bad(f + ' — JSON-LD 파싱 실패: ' + e.message); continue; }

    if (o['@type'] === 'FAQPage') {
      /* FAQ 는 <h2>자주 묻는 질문</h2> 아래의 details 만 해당한다.
         결과 영역의 접기 UI(예: "공제 내역 자세히 보기")는 FAQ 가 아니다. */
      const hi = h.indexOf('자주 묻는 질문');
      const sec = hi === -1 ? '' : h.slice(hi, (h.indexOf('</section>', hi) + 1) || h.length);
      const body = [...sec.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<div class="a">([\s\S]*?)<\/div>/g)]
        .map((m) => [strip(m[1]), strip(m[2])]);
      for (const q of o.mainEntity) {
        const hit = body.find(([bq]) => bq === strip(q.name));
        if (!hit) { bad(f + ' — JSON-LD 에만 있는 FAQ: "' + strip(q.name) + '"'); continue; }
        const a = strip(q.acceptedAnswer.text);
        if (hit[1] !== a && !hit[1].startsWith(a)) bad(f + ' — FAQ 답변이 본문과 다름: "' + strip(q.name) + '"');
      }
      const ldQ = o.mainEntity.map((q) => strip(q.name));
      for (const [bq] of body) if (!ldQ.includes(bq)) bad(f + ' — 본문에만 있는 FAQ: "' + bq + '"');
    }

    if (o['@type'] === 'BreadcrumbList') {
      const last = o.itemListElement[o.itemListElement.length - 1].item;
      const canon = (/rel="canonical" href="([^"]+)"/.exec(h) || [])[1];
      if (canon && last !== canon) bad(f + ' — breadcrumb 마지막(' + last + ')이 canonical(' + canon + ')과 다름');
    }
  }
}

/* ── 2. canonical 이 자기 주소를 가리키는가 ── */
for (const f of files) {
  if (/404\.html$/.test(f)) continue;
  const c = (new RegExp('rel="canonical" href="' + ORIGIN + '([^"]+)"').exec(read(f)) || [])[1];
  if (!c) bad(f + ' — canonical 없음');
  else if (c !== urlOf(f)) bad(f + ' — canonical ' + c + ' ≠ 실제 ' + urlOf(f));
}

/* ── 3. 내부 링크: 실체가 있는가 · 후행 슬래시 · index.html 금지 ── */
for (const f of files) {
  const h = read(f);
  for (const u of new Set([...h.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))) {
    if (u.startsWith('/assets')) continue;
    if (u.includes('index.html')) bad(f + ' — index.html 링크(301 유발): ' + u);
    else if (!u.endsWith('/') && !/\.[a-z0-9]+$/i.test(u)) bad(f + ' — 후행 슬래시 없음: ' + u);
    else if (!pageExists(u)) bad(f + ' — 깨진 링크: ' + u);
  }
}

/* ── 4. sitemap ↔ 실제 페이지 ── */
const sm = read('sitemap.xml');
const locs = [...sm.matchAll(new RegExp('<loc>' + ORIGIN + '([^<]*)</loc>', 'g'))].map((m) => m[1]);
if (new Set(locs).size !== locs.length) bad('sitemap.xml — 중복 URL');
for (const u of locs) if (!pageExists(u)) bad('sitemap.xml — 실체 없는 URL: ' + u);
for (const f of files) {
  if (/404\.html$/.test(f)) continue;
  if (!locs.includes(urlOf(f))) bad('sitemap.xml — 미등록 페이지: ' + urlOf(f));
}

/* ── 5. HTML 구조 (태그 균형 · 계산식 박스 잔재) ── */
for (const f of files) {
  const h = read(f);
  for (const [n, ro, rc] of [['div', /<div\b/g, /<\/div>/g], ['p', /<p\b/g, /<\/p>/g],
    ['section', /<section\b/g, /<\/section>/g], ['details', /<details\b/g, /<\/details>/g]]) {
    const o = (h.match(ro) || []).length, c = (h.match(rc) || []).length;
    if (o !== c) bad(f + ' — <' + n + '> 불균형: ' + o + ' 열림 / ' + c + ' 닫힘');
  }
  for (const m of h.matchAll(/<div class="formula">([\s\S]*?)<\/div>/g)) {
    const c = m[1].trim();
    if (!c) bad(f + ' — 빈 계산식 박스');
    else if (/<br>$/.test(c)) bad(f + ' — 계산식 박스 끝에 <br> 잔재');
  }
}

console.log(fail ? '\n문제 ' + fail + '건 (' + files.length + '개 파일)' : '검사 통과 — 문제 0건 (' + files.length + '개 파일)');
process.exit(fail ? 1 : 0);
