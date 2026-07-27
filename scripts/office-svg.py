#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
노션 사무실 일러스트 생성기 — walgeupnote_company 페이지에 올릴 아이소메트릭 SVG.

    python3 scripts/office-svg.py            > office.svg
    python3 scripts/office-svg.py --now "2026-07-27 16:00"   # 시각 고정(테스트용)

notion-logger 는 STATE 만 이번 실행 결과로 바꿔 실행한다. 좌표·도형은 건드리지 않는다.

왜 스크립트인가 — 아이소메트릭 좌표를 손으로 쓰면 책상 하나 옮길 때마다 꼭짓점을
다시 계산해야 하고, 겹침 순서(painter's algorithm)를 사람이 관리할 수 없다.
"""
import sys, datetime, argparse

# ── 근무 스케줄 (사용자가 설정한 시간) ─────────────────────────────
#   days: daily=매일 · mwf=월·수·금
#   at  : 예정 시각(시). 이 시각이 지났는데 근무 기록이 없으면 ✕
SCHEDULE = {
    "cto":              {"days": "daily", "at": 9},
    "qa-calculator":    {"days": "daily", "at": 9},
    "law-monitor":      {"days": "mwf",   "at": 9},
    "planner":          {"days": "mwf",   "at": 15},
    "researcher":       {"days": "mwf",   "at": 15},
    "writer":           {"days": "mwf",   "at": 15},
    "reviewer-quality": {"days": "mwf",   "at": 15},
    "reviewer-facts":   {"days": "mwf",   "at": 15},
    "publisher":        {"days": "mwf",   "at": 15},
    "notion-logger":    {"days": "daily", "at": 9},
    "adsense-audit":    {"days": "daily", "at": 18},
}

# 구역: (키, 한글명, 소속, 배치 원점(gx,gy), 열 수)
ZONES = [
    ("EXECUTIVE", "경영실",     ["cto"],                                   (0.6, 0.6), 2),
    ("WATCH",     "상시감시팀", ["qa-calculator", "law-monitor"],           (6.2, 0.6), 2),
    ("STUDIO",    "제작팀",     ["planner", "researcher", "writer"], (0.6, 4.0), 2),
    ("REVIEW",    "품질관리팀", ["reviewer-quality", "reviewer-facts"],     (6.2, 4.0), 2),
    ("PUBLISH",   "발행실",     ["publisher", "notion-logger"],             (0.6, 7.4), 2),
    ("TEMP",      "임시데스크", ["adsense-audit"],                          (6.2, 7.4), 2),
]

# ── 이번 실행 상태 (notion-logger 가 여기만 갱신) ─ work | idle | stop ──
STATE = {
    "cto": "work", "qa-calculator": "work", "law-monitor": "stop",
    "planner": "idle", "researcher": "idle", "writer": "idle",
    "reviewer-quality": "idle", "reviewer-facts": "idle",
    "publisher": "idle", "notion-logger": "work", "adsense-audit": "idle",
}

ROOM_W, ROOM_D = 10.6, 10.2
TW, TH, ZH = 30, 15, 20          # 타일 반폭·반높이·높이 단위

P = {
    "bg": "#F4F1EA", "floor_a": "#DCD6C9", "floor_b": "#D3CCBE",
    "wall": "#B9C4D2", "wall_dark": "#9FAEC0", "win": "#BFE3F5",
    "desk": "#C08E5C", "chair": "#39434F", "monitor": "#28313D",
    "glow": "#7FD6FF", "skin": "#F1C9A6", "hair": "#2B2724", "plant": "#4E9A5B",
    "zone_tint": "#C6BEAE",
}
SHIRTS = ["#2E6FD9", "#3E8E7E", "#6B5BD2", "#C77A2B", "#4A7FBF", "#7A5AA8"]


def iso(x, y, z=0.0):
    return ((x - y) * TW, (x + y) * TH - z * ZH)


def pts(seq):
    return " ".join(f"{a:.1f},{b:.1f}" for a, b in seq)


def shade(hexc, f):
    c = hexc.lstrip("#")
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(v * f))) for v in (r, g, b))


def box(x, y, z, w, d, h, color):
    """직육면체 3면. 반환: svg 문자열"""
    top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
    left = [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
    right = [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)]
    return (f'<polygon points="{pts(left)}" fill="{shade(color,.74)}"/>'
            f'<polygon points="{pts(right)}" fill="{shade(color,.56)}"/>'
            f'<polygon points="{pts(top)}" fill="{color}"/>')


def check_mark(agent, state, now):
    """머리 위 배지 — 자리는 늘 채워져 있고, 상태는 이 배지 하나로만 말한다.

    done    ✔ 예정 시간에 근무 완료
    issue   ! 근무했으나 문제를 보고했다 (HALT 유발)
    missed  ✕ 예정 시간이 지났는데 근무 기록이 없다
    pending · 아직 예정 시간 전
    none      오늘은 예정이 없는 요일

    ★ stop 을 missed 로 묶지 마라. law-monitor 는 **일을 했고** 그 결과로 문제를
      보고한 것이다. '근무 안 함'으로 표시하면 가장 열심히 일한 에이전트를
      결근 처리하게 된다.
    """
    s = SCHEDULE[agent]
    # 보고된 문제는 요일과 무관하게 계속 보인다. 월·수·금 담당이 금요일에 HALT 를
    # 냈다면 토요일에도 그 사실이 남아 있어야 한다 — 근무일이 아니라고 배지를
    # 지워 버리면 정지 원인이 그림에서 사라진다.
    if state == "stop":
        return "issue"
    scheduled = s["days"] == "daily" or (s["days"] == "mwf" and now.isoweekday() in (1, 3, 5))
    if not scheduled:
        return "none"
    if state == "work":
        return "done"
    return "pending" if now.hour < s["at"] else "missed"


def furniture_symbols():
    """책상 세트는 전부 같은 도형이다. iso() 가 x·y 에 선형이므로 원점에서 한 번
    그려 두고 translate 로 옮기면 된다. (인라인 반복이면 그것만 30KB 다)

    ★ 의자와 책상을 한 심볼로 묶지 마라. 그리는 순서가
      의자 → 사람 → 책상 이어야 사람이 의자 앞·책상 뒤에 앉은 것으로 보인다.
      묶으면 의자가 사람을 덮어 사람이 사라진다."""
    cx, seat_y = 0.30, -1.25
    chair = [box(cx, seat_y, 0, 0.62, 0.60, 0.26, P["chair"]),
             box(cx, seat_y - 0.02, 0.26, 0.62, 0.12, 0.62, shade(P["chair"], 1.18))]
    mx, my = 0.55, 0.30
    desk = [box(0, 0, 0, 1.9, 1.05, 0.36, P["desk"]),
            box(0.06, 0.06, 0, 0.10, 0.93, 0.34, shade(P["desk"], .7)),
            box(1.74, 0.06, 0, 0.10, 0.93, 0.34, shade(P["desk"], .7)),
            box(mx + 0.28, my + 0.16, 0.36, 0.18, 0.16, 0.12, shade(P["monitor"], .8)),
            box(mx, my, 0.48, 0.78, 0.10, 0.52, P["monitor"]),
            f'<polygon points="{pts([iso(mx,my-.02,1.00), iso(mx+.78,my-.02,1.00), iso(mx+.78,my-.02,.48), iso(mx,my-.02,.48)])}" fill="{P["glow"]}" opacity=".28"/>',
            box(1.45, 0.45, 0.36, 0.16, 0.16, 0.18, "#E4E1D8")]
    return '<g id="ch">' + "".join(chair) + '</g><g id="dk">' + "".join(desk) + '</g>'


def person_symbol(shirt, sid):
    """앉은 사람. 셔츠 색만 다르므로 색깔 수(6)만큼만 정의하고 돌려 쓴다."""
    cx, seat_y = 0.30, -1.25
    px, py = cx + 0.02, seat_y + 0.26
    g = [box(px, py, 0.26, 0.58, 0.46, 0.86, shirt),                             # 몸통
         box(px - 0.16, py + 0.08, 0.62, 0.16, 0.40, 0.16, shade(shirt, .88)),   # 팔
         box(px + 0.58, py + 0.08, 0.62, 0.16, 0.40, 0.16, shade(shirt, .88)),
         box(px + 0.13, py + 0.09, 1.12, 0.34, 0.30, 0.14, P["skin"]),           # 목
         box(px + 0.06, py + 0.04, 1.20, 0.46, 0.40, 0.40, P["skin"]),           # 머리
         box(px + 0.04, py + 0.02, 1.52, 0.50, 0.44, 0.14, P["hair"]),           # 머리카락
         box(px + 0.04, py + 0.02, 1.30, 0.50, 0.10, 0.24, P["hair"])]           # 뒷머리
    return f'<g id="p{sid}">' + "".join(g) + '</g>'


def workstation(x, y, agent, state, idx):
    """책상 1세트를 배치. 사람은 **모든 자리에 항상 앉힌다** —
    상태는 머리 위 배지 하나로만 말한다. 사람을 지웠다 그렸다 하면
    '자리 비움'과 '아직 예정 시간 전'이 같은 그림이 돼 구분되지 않는다."""
    ox, oy = iso(x, y)
    t = f'transform="translate({ox:.0f},{oy:.0f})"'
    sid = idx % len(SHIRTS)
    svg = (f'<use href="#ch" {t}/><use href="#p{sid}" {t}/><use href="#dk" {t}/>')
    anchor = iso(x + 0.60, y - 0.95, 2.45)
    return (x + y, svg, anchor)


def build(now):
    parts, labels, zone_tags = [], [], []
    # 바닥 — 타일 100장을 개별 폴리곤으로 쓰면 그것만 8KB다.
    # 큰 면 한 장 + 격자선으로 같은 인상을 1/4 용량에 낸다.
    # (notion-logger 가 매 실행 업로드하므로 용량은 매번 드는 비용이다)
    floor = [iso(0, 0), iso(ROOM_W, 0), iso(ROOM_W, ROOM_D), iso(0, ROOM_D)]
    parts.append((-999, f'<polygon points="{pts(floor)}" fill="{P["floor_a"]}"/>', None))
    grid = []
    for i in range(1, int(ROOM_W)):
        a, b = iso(i, 0), iso(i, ROOM_D)
        grid.append(f'M{a[0]:.0f} {a[1]:.0f}L{b[0]:.0f} {b[1]:.0f}')
    for j in range(1, int(ROOM_D)):
        a, b = iso(0, j), iso(ROOM_W, j)
        grid.append(f'M{a[0]:.0f} {a[1]:.0f}L{b[0]:.0f} {b[1]:.0f}')
    parts.append((-999, f'<path d="{"".join(grid)}" stroke="{P["floor_b"]}" stroke-width="1.2" fill="none"/>', None))
    # 구역 바닥 틴트
    for key, ko, agents, (gx, gy), cols in ZONES:
        rows = (len(agents) + cols - 1) // cols
        w, d = (3.9 if len(agents) > 1 else 2.1), rows * 1.7 + 0.5
        q = [iso(gx - .35, gy - 1.5), iso(gx - .35 + w, gy - 1.5), iso(gx - .35 + w, gy - 1.5 + d), iso(gx - .35, gy - 1.5 + d)]
        parts.append((-998, f'<polygon points="{pts(q)}" fill="{P["zone_tint"]}" opacity=".55"/>', None))
        # 구역 이름표는 구역 **앞쪽 바닥**(큰 y)에 둔다. 뒤쪽에 두면 앉아 있는 사람을 덮는다.
        zone_tags.append((iso(gx - .35 + w / 2, gy - 1.5 + d, .02), ko, key))
    # 뒷벽 + 창문
    parts.append((-997, f'<polygon points="{pts([iso(0,0,0), iso(ROOM_W,0,0), iso(ROOM_W,0,2.6), iso(0,0,2.6)])}" fill="{P["wall"]}"/>', None))
    parts.append((-997, f'<polygon points="{pts([iso(0,0,0), iso(0,ROOM_D,0), iso(0,ROOM_D,2.6), iso(0,0,2.6)])}" fill="{P["wall_dark"]}"/>', None))
    for i in range(1, int(ROOM_W) - 1, 3):
        parts.append((-996, f'<polygon points="{pts([iso(i,0,.9), iso(i+2,0,.9), iso(i+2,0,2.2), iso(i,0,2.2)])}" fill="{P["win"]}" opacity=".85"/>', None))
    for j in range(1, int(ROOM_D) - 1, 3):
        parts.append((-996, f'<polygon points="{pts([iso(0,j,.9), iso(0,j+2,.9), iso(0,j+2,2.2), iso(0,j,2.2)])}" fill="{shade(P["win"],.9)}" opacity=".8"/>', None))
    # 책상
    idx = 0
    for key, ko, agents, (gx, gy), cols in ZONES:
        for n, a in enumerate(agents):
            x = gx + (n % cols) * 2.05
            y = gy + (n // cols) * 1.70
            depth, svg, anchor = workstation(x, y, a, STATE[a], idx)
            parts.append((depth, svg, None))
            # 아이소메트릭에서는 책상이 흩어져 있어도 이름표 앵커가 화면 좌상단에 몰린다.
            # 구역이 놓인 열에 따라 라벨을 좌/우로 갈라 놓아야 겹침이 풀린다.
            side = -1 if gx < 3 else 1
            anchor = (anchor[0] + side * 62, anchor[1])
            labels.append((anchor, a, STATE[a], check_mark(a, STATE[a], now)))
            idx += 1
        # 화분
        parts.append((gx + gy + 3.2, box(gx + 4.0 if len(agents) > 1 else gx + 2.2, gy + 0.2, 0, .34, .34, .30, "#8B6E4E")
                      + box(gx + 4.05 if len(agents) > 1 else gx + 2.25, gy + 0.25, .30, .26, .26, .46, P["plant"]), None))
    parts.sort(key=lambda t: t[0])
    return parts, labels, zone_tags


def render(now):
    parts, labels, zone_tags = build(now)
    corners = [iso(0, 0, 2.6), iso(ROOM_W, 0, 2.6), iso(0, ROOM_D, 0), iso(ROOM_W, ROOM_D, 0), iso(0, 0, 0)]
    minx = min(c[0] for c in corners) - 118
    maxx = max(c[0] for c in corners) + 118
    miny = min(c[1] for c in corners) - 128
    maxy = max(c[1] for c in corners) + 104
    W, H = maxx - minx, maxy - miny

    # 체크/엑스는 **도형으로 그린다.** 글리프(✔ ✕)로 두면 폰트에 없을 때
    # 두부(□)로 렌더링된다 — 상태 표시가 깨지면 그림 전체가 쓸모없어진다.
    def badge(cx, cy, kind, col):
        e = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="8.5" fill="{col}"/>']
        if kind == "done":
            e.append(f'<path d="M{cx-4.2:.1f} {cy+.2:.1f} l3 3.1 l5.4-6.2" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind == "missed":
            e.append(f'<path d="M{cx-3.4:.1f} {cy-3.4:.1f} l6.8 6.8 M{cx+3.4:.1f} {cy-3.4:.1f} l-6.8 6.8" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>')
        elif kind == "issue":                      # 근무했으나 문제 보고 — 느낌표
            e.append(f'<path d="M{cx:.1f} {cy-4.6:.1f} l0 5.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>')
            e.append(f'<circle cx="{cx:.1f}" cy="{cy+3.4:.1f}" r="1.4" fill="#fff"/>')
        else:                                       # pending — 아직 예정 시간 전
            e.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="2.6" fill="#fff"/>')
        return "".join(e)

    MARK = {"done": ("done", "#1F9D55"), "issue": ("issue", "#E08A1E"),
            "missed": ("missed", "#C8452F"), "pending": ("pending", "#8A94A3"),
            "none": (None, "")}
    FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', 'Noto Serif CJK KR', sans-serif"

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.0f} {miny:.0f} {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}" font-family="{FONT}">']
    s.append('<defs>' + furniture_symbols()
             + "".join(person_symbol(c, i) for i, c in enumerate(SHIRTS)) + '</defs>')
    s.append(f'<rect x="{minx:.0f}" y="{miny:.0f}" width="{W:.0f}" height="{H:.0f}" fill="{P["bg"]}"/>')
    s.append(f'<text x="{minx+26:.0f}" y="{miny+44:.0f}" font-size="27" font-weight="800" fill="#213A5C">월급노트 컴퍼니</text>')
    s.append(f'<text x="{minx+26:.0f}" y="{miny+68:.0f}" font-size="13.5" fill="#6B7688">에이전트 {len(SCHEDULE)}명 · {now:%Y-%m-%d %H:%M} 기준 스냅샷</text>')
    for _, svg, _ in parts:
        s.append(svg)
    for (tx, ty), ko, key in zone_tags:
        s.append(f'<rect x="{tx-42:.0f}" y="{ty-11:.0f}" width="84" height="21" rx="10.5" fill="#213A5C" opacity=".9"/>')
        s.append(f'<text x="{tx:.0f}" y="{ty+4:.0f}" font-size="11.5" font-weight="700" fill="#fff" text-anchor="middle">{ko}</text>')

    # 이름표 충돌 해소 — 겹치면 위로 밀어 올리고 지시선을 남긴다.
    # (아이소메트릭에서 책상이 붙어 있으면 라벨은 반드시 겹친다. 손으로 맞출 수 없다)
    placed = []
    for (lx, ly), agent, state, mark in sorted(labels, key=lambda t: (t[0][1], t[0][0])):
        sym, col = MARK[mark]
        w = 7.2 * len(agent) + (30 if sym else 16)
        y = ly
        for _ in range(40):
            hit = any(abs(y - py) < 23 and abs(lx - px) < (w + pw) / 2 + 6 for px, py, pw in placed)
            if not hit:
                break
            y -= 12
        placed.append((lx, y, w))
        if y < ly - 6:                                   # 끌어올렸으면 원래 자리와 이어 준다
            s.append(f'<line x1="{lx:.0f}" y1="{y+6:.0f}" x2="{lx:.0f}" y2="{ly:.0f}" stroke="#B9B2A3" stroke-width="1.2" stroke-dasharray="2.5 2.5"/>')
            s.append(f'<circle cx="{lx:.0f}" cy="{ly:.0f}" r="2" fill="#B9B2A3"/>')
        op = "1"
        s.append(f'<rect x="{lx-w/2:.0f}" y="{y-16:.0f}" width="{w:.0f}" height="22" rx="11" fill="#fff" stroke="#CFC8B9" opacity="{op}"/>')
        s.append(f'<text x="{lx-(11 if sym else 0):.0f}" y="{y:.0f}" font-size="11" font-weight="600" fill="#2C3648" text-anchor="middle">{agent}</text>')
        if sym:
            s.append(badge(lx + w / 2 - 12, y - 5, sym, col))
    # 범례
    y0 = maxy - 74
    s.append(f'<rect x="{minx+22:.0f}" y="{y0:.0f}" width="{W-44:.0f}" height="54" rx="11" fill="#fff" stroke="#E0DACE"/>')
    s.append(f'<text x="{minx+52:.0f}" y="{y0+17:.0f}" font-size="11.5" font-weight="700" fill="#2C3648">머리 위 배지 — 설정한 시간에 실제로 일했는가</text>')
    row = [("done", "예정 시간에 근무함", "#1F9D55"),
           ("issue", "근무했으나 문제 보고", "#E08A1E"),
           ("missed", "예정 시간이 지났는데 근무 안 함", "#C8452F"),
           ("pending", "아직 예정 시간 전", "#8A94A3")]
    yy = y0 + 40
    step = (W - 96) / len(row)
    for i, (kind, t, c) in enumerate(row):
        x = minx + 56 + i * step
        s.append(badge(x, yy - 4, kind, c))
        s.append(f'<text x="{x+14:.0f}" y="{yy:.0f}" font-size="11.5" fill="#4A5464">{t}</text>')
    s.append('</svg>')
    return "\n".join(s)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--now")
    a = ap.parse_args()
    now = datetime.datetime.strptime(a.now, "%Y-%m-%d %H:%M") if a.now else datetime.datetime.now()
    sys.stdout.write(render(now))
