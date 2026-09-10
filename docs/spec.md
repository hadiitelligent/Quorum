# Handoff: Quorum — AI Advisor Board

## Overview
Quorum is an "AI board of advisors" product. A client (founder) keeps a roster of AI advisor personas, can chat with any advisor privately (1:1), or **convene the board**: every advisor forms an independent view on a question, they challenge each other, and the board delivers a synthesis with alignment votes and recorded dissent. Admins manage the personas (add, remove, expertise ratings, knowledge grounding).

## About the Design Files
The files in this bundle are **design references created in HTML** — an interactive prototype showing intended look and behavior, not production code to copy directly. Recreate these designs in the target codebase's environment (React, Vue, etc.) using its established patterns; if no environment exists yet, choose an appropriate framework and implement there. `Quorum.dc.html` contains the full prototype (template markup + a plain JS logic class near the bottom of the file); `nocturne-styles.css` is the design-system stylesheet it consumes.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final intent. Recreate pixel-perfectly, sourcing all values from the design tokens below (CSS variables in `nocturne-styles.css`).

## Screens / Views
The app is a two-pane shell: fixed 230px sidebar + scrollable main area, full viewport height, dark ground.

### Shell / Sidebar (all screens)
- Background `--color-surface` (#232532), 1px right border `--color-divider`; padding ~17px 11px; column flex, gap 17px.
- Brand: 22×22 rotated-45° square outline (1.5px `--color-accent` #9184d9, 5px radius) with a 7px accent square inside; "Quorum" 18px Inter 500.
- Nav items: Board, Sessions, Persona library (admin-only). Full-width buttons, 8px 12px padding, 8px radius, 14px text, Phosphor icon 17px. Active: bg `--color-accent-900` (#2b2741), text `--color-accent-200` (#e7e5fe). Inactive: transparent, text `--color-neutral-400` (#b2b6ca); hover: 6% text tint bg. Board stays active while in Chat or Session views.
- Bottom user chip: 30px circle avatar (`--color-neutral-800` bg, initials 11px), name 13px, subtitle 11px `--color-neutral-500`.

### 1. Board (home)
- Max width 960px, padding ~22px, column gap ~22px.
- Header: kicker "YOUR BOARD" (11px, 0.1em tracking, uppercase, accent color) over h2 "«Count» advisors, on call." (30px, Inter 500). Count word updates with roster size.
- Convene panel (card, `--color-surface`, 8px radius, shadow-sm = 1px #3f424d ring): kicker "CONVENE THE BOARD" (neutral-500), 2-row textarea (surface bg, divider border, 8px radius, 15px), footer row: helper text 12px neutral-500 ("Each advisor forms an independent view before seeing the others' — then they challenge, then synthesize.") + primary button "Convene board" (accent outline, transparent bg — Nocturne primaries are outlined, never filled) with users-three icon.
- Advisor grid: `repeat(auto-fill, minmax(250px, 1fr))`, ~11px gap. Each card: 36px circle avatar (`--color-accent-800` bg, `--color-accent-100` initials, 13px/500), name 16px, role kicker 11px uppercase accent; bio 13px at 0.8 opacity; **expertise meter**: up to 3 rows of subject label (12px neutral-400, left) + five 6px dots right-aligned (filled `--color-accent`, empty `--color-neutral-800`), rating 1–5; ghost button "Ask privately" 13px with chat icon.

### 2. Chat (private 1:1)
- Max width 820px, full-height column: header / scrollable messages / input row. Header and input row separated by 1px `--color-divider` rules.
- Header: back icon-button (36px, divider border), 34px avatar, name 15px + role 12px neutral-500, right-aligned outline tag "Private 1:1" (1px accent border, accent text, 11px).
- Empty state (centered): lock icon 22px + 13px neutral-500 copy: "This conversation is private. «First name» answers from the persona and knowledge base your admin configured."
- User bubbles: right-aligned, max 72%, 10px 14px padding, radius 14/14/4/14, bg `--color-accent-900`, text `--color-accent-100`, 14px.
- Advisor bubbles: left, 26px avatar (neutral-800), bubble radius 14/14/14/4, bg surface + shadow-sm, 14px/1.55; enters with 350ms fade-up (translateY 10px→0).
- Typing indicator: 3 six-px dots pulsing (opacity 0.25↔1, 1.1s, 180ms stagger).
- Input row: text input + primary icon button (paper-plane). Enter sends; ~1.6s scripted reply delay (advisor cycles a canned reply pool).

### 3. Board session (staged simulation)
- Max width 900px. Header: back button, kicker "BOARD SESSION · LIVE" (accent), question as h3 22px.
- Stage tracker: 3 steps ("01 Independent views", "02 Challenge round", "03 Synthesis"), 22px numbered circle + 13px label. Reached: accent circle/border, label `--color-accent-300`; not reached: neutral-700 border, neutral-600 text.
- Stage 1: advisor view cards (grid minmax(270px,1fr)) appear one-by-one (~950ms apart, 450ms fade-up each): 26px avatar, name 13px/500, role right-aligned 10px uppercase neutral-500, view text 13px/1.55 at 0.88 opacity. While appearing: status line "Advisors are forming independent views — none can see the others' yet." with pulsing circle-notch icon.
- Stage 2 "CHALLENGE ROUND": exchanges appear ~1.4s apart: 26px initials chip, "From → To" line 11px neutral-500, challenge text 13.5px.
- Stage 3 synthesis card (padding ~17px, shadow-md): seal-check icon + accent kicker "BOARD SYNTHESIS"; recommendation paragraph 15px/1.6; alignment chips row — pill (divider border, 99px radius) with 20px initials circle + vote label 12px ("Agree" ×4, "Conditional"); "Recorded dissent" accent tag (bg accent-800, text accent-100) over dissent paragraph 13px `--color-neutral-300`; actions: "Export memo" primary + "Back to board" secondary.
- All stage timings divide by a speed multiplier (0.5–3×).

### 4. Sessions
- Header kicker "SESSIONS" + h2 "Every decision, on the record." Data table (Nocturne `.table`: uppercase 11px headers, row rules that fade to transparent over the outer 48px, row hover tint): Question / Convened / Outcome tag / "Open" link. Sample rows included in the prototype.

### 5. Persona library (admin)
- Header: kicker "ADMIN · PERSONA LIBRARY", h2 "The people behind the board.", right-aligned primary "New persona" (+ icon).
- Persona grid (minmax(280px,1fr)): avatar + name 15px + role 11px neutral-500 + "Live" neutral tag; expertise meter (same component as board cards); meta rows 12px neutral-400 with 14px icons: "Grounded in «N docs · source types»", "Temperament: «…»", "Edited «date»"; actions: ghost "Edit persona" + ghost "Remove" (neutral-400 text, trash icon).
- **New persona dialog** (modal, 440px, `--color-surface`, 14px radius, shadow-lg, backdrop 50% neutral-900): fields Name, Domain, Bio (2-row textarea); helper note "New personas start ungrounded — attach documents after creating to give them a knowledge base."; Cancel (secondary) + "Create persona" (primary, disabled until name+domain non-empty). Created persona: initials derived from name, domain's first segment as a level-3 strength, "0 docs · not yet grounded", hedged session view text.
- **Remove dialog**: title "Remove «Name»?", body "The persona leaves the board immediately. Its private chats and past session contributions stay on the record.", Cancel + Remove (primary, trash icon).

## Interactions & Behavior
- Nav switches views; leaving a view clears pending simulation timers and typing state.
- "Ask privately" opens that advisor's chat (per-advisor message history persists in state during the visit).
- Chat: Enter (without Shift) or send button submits; blocked while a reply is pending; typing indicator during the ~1.6s delay.
- Convene: reads the textarea (falls back to the default question), switches to Session, then runs the timed stage sequence over the current roster. All delays scale by the simSpeed setting.
- Add/remove personas updates every surface: board grid, heading count, convene sequence, chats, library.
- Focus: 2px accent `:focus-visible` outline everywhere (from the stylesheet). Buttons: accent-tint hover/active states as defined in `.btn` classes.

## State Management
- `view`: 'board' | 'chat' | 'session' | 'sessions' | 'library'
- `roster`: advisor array (id, initials, name, firstName, role, bio, strengths[{s, lv 1–5}], sources, temperament, edited, view, replies[])
- `chats`: map advisorId → message[{from: 'user'|'adv', text}]; `chatId`, `draft`, `typing`
- `question`, `sessionQ`, `stage` 0–3, `shownViews`, `shownChallenges` (timer-driven)
- Dialog state: `newOpen`, `npName/npRole/npBio`, `removeId`
- Settings: `simSpeed` (0.5–3), `adminTools` (shows/hides Persona library nav)
- No backend in the prototype; advisor replies and session content are scripted. In production these become model calls: per-persona system prompts + knowledge grounding, and a convene orchestration (parallel independent calls → cross-examination round → synthesis call that must preserve dissent verbatim).

## Design Tokens (Nocturne)
All values live as CSS variables in `nocturne-styles.css` — port them as your token layer.
- Ground `--color-bg` #161826; surface #232532; text #e9e9ed; divider = text at 16% alpha.
- Accent #9184d9 (blurple) with 100–900 ramp (#f5f4ff → #2b2741); neutral ramp #f3f5fe → #292b31. On the dark ground: 700–900 for tinted fills/borders, 100–300 for text on tints.
- Type: Inter throughout; headings weight 500 (never bolder), −0.015em tracking; body 15px/1.55; h2 30–32px, h3 22–25px.
- Spacing scale (0.7× density): 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4 px.
- Radii: 4 / 8 / 14 px. Shadows: sm = 1px #3f424d ring; md = 1px #595d6c ring + 0 6px 18px rgba(0,0,0,.55); lg = 1px #9397ab ring + 0 16px 40px rgba(0,0,0,.65).
- Signature: freestanding rules and table row rules fade to transparent over 48px at each end.
- Buttons are **outlined**, never filled: primary = 1px accent border + accent text; hover = 12% accent tint; active = 22%.
- Animations: fade-up (opacity 0→1, translateY 10px→0, 350–500ms ease) for entering cards/bubbles; pulse (opacity .25↔1) for typing dots and progress spinners.

## Assets
- Icons: Phosphor Icons (regular weight) via @phosphor-icons/web — users-three, chat-circle, chats-circle, stack, arrow-left, arrow-right, lock-simple, paper-plane-tilt, circle-notch, seal-check, download-simple, plus, trash-simple, pencil-simple, files, sliders-horizontal, clock-counter-clockwise.
- Font: Inter 400/500/600/700 (Google Fonts).
- No images. Avatars are initials on ramp-tinted circles.

## Files
- `Quorum.dc.html` — full prototype: template markup (all five views + dialogs) and the logic class (state, scripted data, simulation timers).
- `nocturne-styles.css` — design tokens + component classes (.btn, .card, .tag, .input, .table, .dialog, .seg, etc.).
