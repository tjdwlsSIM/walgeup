# 월급노트 — 프로젝트 지침

정적 HTML/CSS/JS 노동·급여 계산기 사이트. 프레임워크·빌드 도구·서버 없음.
공통 로직은 [assets/common.js](assets/common.js), 공통 스타일은 [assets/common.css](assets/common.css).

**이 사이트의 유일한 자산은 "숫자가 맞다"는 신뢰다.** 아래 규칙은 대부분 그걸 지키기 위한 것이다.

> **자동화 계층은 현재 비어 있다.** 에이전트 정의(`.claude/agents/`)와 자동 운영
> 루프(`scripts/`)를 2026-08-20 에 제거하고 새로 설계하는 중이다. 이전 구조는
> git 이력에 남아 있다 — `git show f9bc85f~1:CLAUDE.md` 로 볼 수 있다.

---

## 사이트 구조

```
walgeup-note/
├── index.html              # 메인 (계산기·가이드 목록)
├── annual-leave/           # 연차수당 계산기
├── weekly-holiday/         # 주휴수당 계산기
├── salary/                 # 연봉 실수령액 계산기
├── severance/              # 퇴직금 계산기
├── insurance/              # 4대보험 계산기
├── unemployment/           # 실업급여 계산기
├── minimum-wage/           # 최저임금 위반 체크기
├── guides/                 # 가이드 목록 + 개별 가이드
├── about/ · privacy/       # 사이트 소개 · 개인정보처리방침
├── 404.html
├── sitemap.xml · robots.txt · ads.txt · favicon.ico
├── assets/                 # common.css · common.js · 아이콘
├── tests/
│   ├── baseline.json           # 계산기 회귀테스트 기준값 ★
│   ├── run.js                  # 계산기 회귀 — baseline.json 을 읽어 구동
│   └── check-content.js        # FAQ 구조화 데이터·canonical·링크·sitemap 검사
└── docs/
    └── index-request-queue.md   # 색인 요청 대기열 (수동 처리)
```

**배포는 Cloudflare Workers (정적 자산 전용).** GitHub Pages 가 아니다 —
저장소 Settings → Pages 는 비활성이다. `main` 에 푸시하면 자동 배포된다.
자세한 내용과 SEO 관련 필수 설정은 [README.md](README.md) 참고.

---

## 지켜야 할 규칙

**수치**
- 모든 수치에 연도를 붙인다. "최저시급 10,320원" ✗ → "2026년 최저시급 10,320원" ○
- 글의 수치는 `assets/common.js` 의 `YEAR_DATA`·`RATES_2026` 과 반드시 일치
- 2027년 미발표 항목(4대보험 요율·소득세율·실업급여 상한액)은 2026년 값을 쓰되
  **미발표 사실을 반드시 표시**한다 (`unconfirmedNote()`)
- 미발표 항목은 `YEAR_DATA[연도].unconfirmed` 배열에도 키를 남긴다
  (`uiMax`·`rates`·`incomeTax`). **값이 전년과 같은 이유를 코드가 알아야 한다** —
  미발표라서 같은 것인지 갱신을 깜빡한 것인지 값만 봐서는 구분되지 않는다.
  확정치가 발표되면 값을 고치고 **배열에서 그 키를 지운다.** 둘 중 하나만 하면
  회귀테스트가 어긋난다

**출처**
- 1차 출처(법령·고시·공단·부처 발표) 우선. **개인 블로그의 수치는 근거로 쓰지 않는다.**
- 확정되지 않은 제도(심의 중·예상치)는 변경으로 처리하지 않고 "미확정 관찰"로만 기록

**테스트 기준값을 고치지 않는다 ★**
- `tests/baseline.json` 은 계산기 7종의 검증된 기대값이다.
- **테스트를 통과시키려고 baseline 을 고치는 것은 테스트를 없애는 것이다.**
  값이 안 맞으면 계산기가 틀렸는지 baseline 이 낡았는지를 먼저 가린다.
- 법령·요율이 실제로 바뀌어 baseline 을 갱신할 때는 **1차 출처를 커밋 메시지에 남긴다.**

**고치면 검사를 돌린다**
```bash
node tests/run.js            # 계산기 회귀 — baseline.json 대조
node tests/check-content.js  # FAQ 구조화 데이터·canonical·링크·sitemap 정합성
```
- 둘 다 통과하면 exit 0, 하나라도 어긋나면 exit 1 이다.
- `run.js` 는 기대값을 갖고 있지 않다 — `baseline.json` 을 읽어 구동한다.
  기대값을 코드에 또 적으면 사본이 되고 한쪽만 갱신되며 조용히 어긋난다.
- 퇴직금·연봉 실수령액 2건은 계산이 DOM 에 묶여 있어 자동 검증되지 않는다.
  `run.js` 가 "미검증"으로 따로 보고하니, 건드렸으면 브라우저에서 확인한다.

**미발표 수치는 작성 시점을 함께 적는다**
- "2027년 요율은 아직 발표되지 않았습니다" 는 **쓴 순간에만 참이다.** 발표가 나면
  글은 그대로인데 문장만 거짓이 된다 — 실제로 `minimum-wage-2027-preview` 가
  최저임금 확정 두 달 뒤까지 "아직 확정되지 않았습니다" 라고 말하고 있었다.
- 그래서 뒤에 괄호로 시점을 붙인다:
  `…아직 발표되지 않았습니다(2026년 7월 22일 작성 시점 기준).`
- 확정된 뒤에는 바뀐 사실도 함께: `…(2026년 7월 15일 작성 시점 기준 — 이후 10,700원으로 확정됐습니다).`
- 작성일은 `git log --diff-filter=A --format=%ad --date=short -1 -- <파일>` 로 확인한다.
- **본문과 FAQ JSON-LD 양쪽에 똑같이 적는다.** 구글이 JSON-LD 답변을 리치결과로
  노출하는데, 거기에는 화면의 안내 문구가 따라가지 않는다.

**FAQ 구조화 데이터는 페이지가 진실이다**
- FAQ JSON-LD 는 **페이지에 실제로 보이는 `<details>` 와 일치해야 한다.** 구글이
  요구하는 조건이고, 없는 Q&A 를 선언하면 리치결과 수동 조치 대상이 될 수 있다.
- 어긋나면 페이지를 JSON-LD 에 맞추지 말고 **JSON-LD 를 페이지에 맞춘다.**
  사용자가 보는 것이 페이지이기 때문이다.
- 대상은 `<h2>자주 묻는 질문</h2>` 아래의 `<details>` 뿐이다. 결과 영역의 접기
  UI("공제 내역 자세히 보기")는 FAQ 가 아니므로 넣지 않는다.
- `node tests/check-content.js` 가 이 어긋남을 잡는다.

**SEO — 주소 규칙**
- 내부 링크·canonical·sitemap 은 모두 **루트 절대경로 + 후행 슬래시**(`/salary/`)로 통일.
  `index.html` 을 링크에 쓰지 않는다 (301 리디렉션이 생기고 중복 색인 신호가 된다)
- 새 페이지를 만들면 `sitemap.xml` 에 등록하고, 관련 계산기·가이드에서 **역링크를 건다.**
  목록 페이지에서만 링크되는 글은 크롤링 우선순위가 밀려 색인이 안 된다 (2026-08 실측)

**색인 요청은 수동이다**
- 발행해도 구글·네이버가 알아서 찾아주지 않는다.
- `docs/index-request-queue.md` 에 항목을 남기고, **Search Console / 서치어드바이저에서
  사람이 직접 요청**한 뒤 체크박스를 `[x]` 로 바꾼다.

**푸시는 사람이 한다**
- `git push` 는 `.claude/settings.json` 의 deny 에 있다.
- 발행 전 사람이 한 번 확인하라는 게이트다.

---

## MCP: code-review-graph

이 프로젝트에는 지식 그래프가 있다. Grep/Glob/Read 보다 **먼저** code-review-graph
MCP 툴을 쓴다. 그래프가 커버하지 못하는 경우에만 파일 스캔으로 내려간다.

| 툴 | 쓰는 때 |
|---|---|
| `detect_changes_tool` | 코드 변경 리뷰 — 위험도 점수 포함 |
| `get_review_context_tool` | 리뷰용 소스 조각 (토큰 효율적) |
| `get_impact_radius_tool` | 변경의 영향 범위 |
| `query_graph_tool` | 호출자·피호출자·import·테스트 추적 |
| `semantic_search_nodes_tool` | 이름·키워드로 함수/클래스 찾기 |
| `get_architecture_overview_tool` | 전체 구조 파악 |
