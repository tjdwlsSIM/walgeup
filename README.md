# 월급노트 📒

> **일하는 사람의 계산기** — 연차수당·퇴직금·실업급여·연봉 실수령액을 2026년 최신 기준으로 바로 계산하는 무료 웹 계산기 모음

회원가입 없이, 광고 몇 개 외에는 아무 조건 없이 쓸 수 있는 노동·급여 계산기 사이트입니다.
매년 바뀌는 최저임금, 실업급여 상·하한액, 4대보험 요율 등 **2026년 확정 고시 기준**을 반영했습니다.

🔗 **https://walgeupnote.com**

## 🧮 제공 계산기 (7종)

계산기는 성격에 따라 색으로 묶여 있습니다 — 🟢 받을 돈 · 🔵 내 급여 · 🟠 지원금 · 🔴 경고·판정.

| 계산기 | 분류 | 설명 |
|---|---|---|
| [연차수당](https://walgeupnote.com/annual-leave/) | 🟢 받을 돈 | 못 쓴 연차를 수당으로 환산. 퇴직 정산 모드와 세후 실수령액 추정 지원 |
| [주휴수당](https://walgeupnote.com/weekly-holiday/) | 🟢 받을 돈 | 알바·단시간 근로자용. 주 15시간 이상 근무 시 주휴수당 계산 |
| [연봉 실수령액](https://walgeupnote.com/salary/) | 🔵 내 급여 | 연봉에서 4대보험·소득세를 뺀 세후 월 실수령액을 2026년 요율로 계산 |
| [퇴직금](https://walgeupnote.com/severance/) | 🔵 내 급여 | 입사일·퇴사일과 최근 3개월 급여 기반 평균임금 방식 퇴직금 계산 (세후 지원) |
| [4대보험](https://walgeupnote.com/insurance/) | 🔵 내 급여 | 국민연금·건강보험·고용보험 근로자·사업주 부담금을 항목별로 확인 |
| [실업급여](https://walgeupnote.com/unemployment/) | 🟠 지원금 | 2026년 인상된 상·하한액 반영. 나이·고용보험 가입기간으로 총 수급액 확인 |
| [최저임금 위반 체크기](https://walgeupnote.com/minimum-wage/) | 🔴 경고·판정 | 내 시급이 최저임금 기준에 맞는지, 주휴 포함 계약까지 판정 |

## 📖 노동법·급여 가이드 (9편)

계산기와 함께 보는 개념·절차 안내 글입니다. 목록 페이지에는 **실시간 검색**과 **페이지네이션(8개씩)**이 있습니다.

- [2026년 달라지는 노동법·급여 총정리](https://walgeupnote.com/guides/2026-changes/)
- [퇴사 전 챙겨야 할 돈 체크리스트](https://walgeupnote.com/guides/resignation-checklist/)
- [알바생이 몰라서 못 받는 돈 3가지](https://walgeupnote.com/guides/parttime-rights/)
- [통상임금 vs 평균임금, 뭐가 다를까?](https://walgeupnote.com/guides/tongsang-imgeum/)
- [실업급여 신청 절차 A to Z](https://walgeupnote.com/guides/unemployment-guide/)
- [연봉 3,000만 원 실수령액은 얼마일까?](https://walgeupnote.com/guides/salary-3000/)
- [월급 250만 원 직장인, 연차수당은 얼마?](https://walgeupnote.com/guides/salary-250-annual-leave/)
- [2026 최저시급으로 주 40시간 일하면 월급은?](https://walgeupnote.com/guides/minimum-wage-monthly/)
- [떼인 월급 받는 법: 임금체불 대응 절차](https://walgeupnote.com/guides/wage-theft/)

## ✨ 주요 기능

- **세후 실수령액 추정** — 2026년 4대보험 요율과 소득세 한계세율 근사로 연차수당·퇴직금 등의 세후 금액 표시
- **결과 URL 공유** — 계산 입력값을 쿼리스트링에 담아 링크로 복사, 같은 주소를 열면 결과가 그대로 재현
- **결과 명세서 복사·이미지 저장** — 텍스트 복사, 또는 2배 해상도 PNG로 내려받기(임금체불 증빙 등에 활용)
- **가이드 검색·페이지네이션** — 제목·설명 실시간 필터(대소문자 무시), `#page` 해시로 뒤로가기 지원, JS가 꺼져도 전체 목록 노출
- **연도 선택 UI** — 헤더에 연도 전환 메뉴(다음 연도 확장 대비)

## 📌 반영된 2026년 기준

- **최저임금**: 시급 10,320원 (월 2,156,880원)
- **실업급여 1일 상한액**: 68,100원 / **하한액**: 66,048원
- **국민연금 보험료율**: 9.5% (근로자 부담 4.75%)
- **건강보험료율**: 7.19% (근로자 부담 3.595%) + 장기요양 별도
- **소득세**: 근로소득공제 및 과세표준별 한계세율 근사 적용 (지방소득세 10% 포함)

## 🛠 기술 스택

- **순수 HTML / CSS / JavaScript** — 프레임워크, 빌드 도구, 서버 없음
- 공통 로직은 [assets/common.js](assets/common.js)에, 공통 스타일은 [assets/common.css](assets/common.css)에 분리
- 폰트: Pretendard, Noto Serif KR (CDN)
- 광고: Google AdSense
- 정적 호스팅만 있으면 어디서든 동작 (GitHub Pages, Netlify, Vercel, Cloudflare Pages 등)

## 🔍 SEO

- 모든 페이지에 `<link rel="canonical">`, Open Graph 메타 태그
- [sitemap.xml](sitemap.xml) · [robots.txt](robots.txt) 제공
- 모든 내부 링크는 canonical과 일치하도록 **루트 절대경로(`/폴더/`)**로 통일 (리다이렉트·중복 색인 방지)

## 📁 프로젝트 구조

```
walgeup-note/
├── index.html                  # 메인 페이지 (계산기·가이드 목록)
├── annual-leave/               # 연차수당 계산기
├── weekly-holiday/             # 주휴수당 계산기
├── salary/                     # 연봉 실수령액 계산기
├── severance/                  # 퇴직금 계산기
├── insurance/                  # 4대보험 계산기
├── unemployment/               # 실업급여 계산기
├── minimum-wage/               # 최저임금 위반 체크기
├── guides/                     # 가이드 목록 + 개별 가이드 9편
│   ├── index.html              #   목록 (검색·페이지네이션)
│   ├── 2026-changes/           #   2026년 달라지는 노동법
│   ├── resignation-checklist/  #   퇴사 전 돈 체크리스트
│   ├── parttime-rights/        #   알바가 못 받는 돈 3가지
│   ├── tongsang-imgeum/        #   통상임금 vs 평균임금
│   ├── unemployment-guide/     #   실업급여 신청 절차
│   ├── salary-3000/            #   연봉 3천만 원 실수령액
│   ├── salary-250-annual-leave/#   월급 250만 원 연차수당
│   ├── minimum-wage-monthly/   #   최저시급 월급 환산
│   └── wage-theft/             #   임금체불 대응 절차
├── about/                      # 사이트 소개
├── privacy/                    # 개인정보처리방침
├── 404.html                    # 404 페이지
├── sitemap.xml · robots.txt    # SEO
└── assets/
    ├── common.css              # 공통 스타일
    ├── common.js               # 공통 함수 (콤마 포맷, 세후 계산, 결과 복사·이미지 저장,
    │                           #             URL 공유, 가이드 검색·페이지네이션 등)
    └── logo.svg, favicon…      # 아이콘·파비콘
```

## 🚀 배포 (GitHub Pages)

1. 이 저장소를 GitHub에 푸시합니다.
2. 저장소 **Settings → Pages**로 이동합니다.
3. **Source**를 `Deploy from a branch`, 브랜치를 `main` / `/ (root)`로 설정합니다.
4. 잠시 후 게시된 주소에서 접속할 수 있습니다. (본 사이트는 `walgeupnote.com` 커스텀 도메인 사용)

빌드 과정이 없는 정적 사이트라 별도 설정 없이 바로 배포됩니다.

### 로컬에서 실행

내부 링크가 루트 절대경로(`/폴더/`)라서, 파일을 직접 열기보다 **로컬 서버**로 실행하는 것을 권장합니다.

```bash
# Python이 있다면
python -m http.server 8000
# 이후 http://localhost:8000 접속
```

## 🔄 연도 업데이트 가이드

매년 고시 기준이 바뀌면 아래를 수정하세요.

- [assets/common.js](assets/common.js) — `MIN_WAGE_2026`(최저시급), `RATES_2026`(4대보험 요율·국민연금 상한 월소득)
- 각 계산기 페이지의 상·하한액 등 연도별 상수와 안내 문구
- `index.html`의 기준표와 각 페이지 제목·설명·`canonical`의 연도 표기
- 새 가이드를 추가하면 [sitemap.xml](sitemap.xml)에도 URL을 등록 (가이드 목록 페이지네이션은 자동으로 8개씩 분할)

## ⚠️ 면책 조항

본 사이트의 계산기와 가이드는 관련 법령과 2026년 고시 기준을 반영한 **참고용 자료**입니다.
개별 사정(통상임금 산정, 상여금 포함 여부, 특수 고용형태 등)에 따라 실제 금액과 차이가 있을 수 있습니다.
법적 판단이 필요한 경우 **고용노동부(☎ 1350)** 또는 공인노무사와 상담하시기 바랍니다.

## 📮 문의

- 이메일: simsj0930@gmail.com

---

© 2026 월급노트
