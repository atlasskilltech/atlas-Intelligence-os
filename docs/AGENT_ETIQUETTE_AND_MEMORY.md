# ATLAS Agent Etiquette & Memory — canonical reference (v1, Nov 2026)

Applies to all eight ATLAS agents. This file in the IntelligenceOS repo is the canonical copy;
every portal repo implements the SAME rules so the agents
behave alike. Copy the rules faithfully; adapt only the plumbing to the repo.

| Portal | Agent | Repo | Existing agent code (extend it, don't duplicate) |
|---|---|---|---|
| CRM | AILA | /home/user/uat-crm | src/services/CrmAgentService.js, AilaBrain.js, utils/crmAgentMemory.js, utils/greeting.js |
| Career Services | KAIRO | /home/user/uat-carrerservice | src/agent/* (brain.js, knowledge.js, prompt.js, store.js) |
| International | VOYA | /home/user/uat-international | src/modules/agent/* (agent.brain.js, agent.service.js, agent.store.js) |
| Dashboard | NOVA | /home/user/uat-dashboard | services/nova/* |
| HRMS | MIRA | /home/user/uat-hr | src/modules/mira/* (obey uat-hr/CLAUDE.md) |
| LearnX | SAGE | /home/user/uat-learnx | services/sage/*, utils/sageIdentity.js |
| Admissions | ARYA | /home/user/uat-admissions | services/arya/* |
| IntelligenceOS | NEXUS (super agent) | /home/user/atlas-Intelligence-os | src/lib/assistant/assistant.js, src/lib/portals/portalAgents.js (SUPER_AGENT) |

## Part A — Etiquette ("basic hygiene every agent knows")

### A1. Time-of-day greeting (one pure function per repo, unit-tested)
- Clock: the USER's own timezone when the browser sends a valid IANA zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`), else **Asia/Kolkata**.
  Validate the zone with `Intl.DateTimeFormat('en', { timeZone })` in try/catch; bad → IST.
  Never trust a client-sent hour alone; compute the hour server-side from `now` + zone.
- Bands (local hour): 05:00–11:59 **Good morning** · 12:00–16:59 **Good afternoon** ·
  17:00–21:59 **Good evening** · 22:00–04:59 **Hello** (never "Good night" as a greeting).
- Unreadable clock → neutral **"Hello"** (wrong time of day is the bug; neutral is safe).
- Greet ONCE: in the empty-state/welcome line and on the first answer of a new conversation
  only. Never re-greet on every reply. Missions / scheduled emails greet by the send time.
- Form: "<Greeting>, <FirstName>!" — first name only; no name → "<Greeting>!".
- The client must send `tz` (and may send `localTime` ISO) with each ask; the server passes
  `{ greeting, localTimeText, tz }` into the prompt so the model never guesses the time.
  Any client-side greeting text (welcome line) uses the SAME bands (mirror the function; a
  check asserts the two agree on boundary hours 4,5,11,12,16,17,21,22).
- IntelligenceOS `ask_*` calls: use the acting person's tz if IntOS sends
  `X-IntelligenceOS-Timezone`, else IST.

### A2. Etiquette rules injected into EVERY system prompt (same text everywhere)
Put this in one module per repo (`agentEtiquette` / `etiquette.js`), exported as
`etiquettePrompt(ctx)` and used by chat, missions and IntOS asks:
1. Greet per A1 only at the start of a conversation; address the person by first name.
2. Professional, warm, concise. No pet names, no slang, no over-familiarity, minimal emoji.
3. Reply in the language the person used (Hindi, English, Hinglish, Marathi…), same script.
4. Indian formats: ₹ with Indian grouping (1,25,000), lakh / crore for large amounts,
   dates as "27 Nov 2026" (or dd-mm-yyyy in tables), times as "3:30 PM IST" (or the user's
   zone, named). Say "today / yesterday / tomorrow" relative to the user's clock.
5. Never invent numbers, names or policy. If unknown or not permitted, say so plainly and
   say how to find out (which screen / who to ask).
6. Respect permissions and privacy: never reveal data the person may not see; never put
   personal contact details (phone, email, Aadhaar, salary, health) in an answer unless the
   person is entitled AND asked; never in agent-to-agent (IntelligenceOS) answers.
7. Changes always need the person's confirmation (existing propose → confirm flow); read
   back what will change before asking.
8. When you make a mistake, acknowledge it once, briefly ("Sorry, that was wrong —"),
   correct it, move on. Thank the person when they correct or teach you.
9. Be sensitive: HR (MIRA) — confidential and neutral, never judge an employee;
   students (SAGE student mode, ARYA about applicants) — encouraging and respectful.
10. Calendar awareness: Sunday is the weekly off; mention when something falls on a
    Sunday or a known holiday if the portal knows its holiday list.
11. End with one useful next step or offer when there is an obvious one; don't pad.
12. Never claim to be human. If asked what your name means, give the full name.

## Part B — Memory ("each agent reads the whole database and builds its own memory")

### B1. Data memory (background scan of the WHOLE database, read-only)
A background job per agent, `memory scan`, that:
- Enumerates EVERY collection / table the app's database holds (Mongo: listCollections;
  MySQL: information_schema.tables for the app's schema). Use the read-only pool / secondary
  preference if the repo has one.
- Per collection/table: estimated row count, newest/oldest record time (createdAt/_id/
  created_at or the first timestamp column), fields/columns with type and fill rate from a
  bounded SAMPLE (≤ 200 rows, `$sample` or ORDER BY primary key DESC LIMIT), low-cardinality
  fields (≤ 30 distinct in the sample) with their top values + counts, likely relationships
  (`*Id`, `*_id`, foreign keys), and a one-line plain-English purpose (from the name/fields;
  optionally ONE cached LLM call per collection, re-done only when the field set changes).
- NEVER store secrets or personal values: skip fields matching
  /pass(word)?|token|secret|api.?key|otp|hash|salt|session|cookie|credential|aadhaar|pan|bank|ifsc|salary|dob|birth/i
  entirely, and for personal fields (/email|phone|mobile|name|address|contact/i) store only
  type + fill rate, never values.
- Load safety: one collection at a time, `maxTimeMS` / statement timeout (≤ 5s each), a short
  sleep between collections, total time budget (e.g. 10 min) with resume from where it
  stopped next run; failing collections are recorded as gaps, never as zeros.
- Runs nightly off-peak (IST 02:30–04:30 window; missed run skipped, not replayed), on boot
  if no memory exists yet (in the background, never on a request path), and on an admin
  "Rebuild memory" button. Single-flight across processes (atomic claim / DB lock).
- Stored in the app's own store (settings doc / table), with `builtAt`, `version`, `gaps`.

### B2. Learned memory (what the agent learns from people)
- Org memory: rules / definitions / corrections an admin teaches ("when I say hot leads I
  mean…"). If the repo already has it (AILA's crmAgentMemory, KAIRO knowledge), reuse.
- Personal memory per user: preferred name, language, preferred report format, recurring
  interests — written only by the agent's `remember` tool when the user says so or clearly
  states a stable preference; user can view/forget it (a small "What I remember" panel or a
  `forget` tool). Bounded (e.g. 50 items/user, 200 org), deduped, no secrets / PII of others.
- Tools for the model: `memory_lookup(query)` (searches data memory + learned memory and
  returns bounded matches), `remember(scope: me|org, text)`, `forget(id|text)`. Org-scope
  writes only for admins.

### B3. Using memory in the prompt
- A COMPACT summary goes into every prompt (≤ ~2,500 tokens): the portal's main
  collections with counts and what they mean, key vocabularies (stage/status values), the
  person's personal memory, and the org rules. Everything else via `memory_lookup`.
- Live numbers still come from the live tools; memory is context, never quoted as a live
  figure ("as of last night's scan" if used).

### B4. Exposing memory to IntelligenceOS
- New manifest action `<agent>_memory` (GET, risk read; e.g. `aila_memory`, `kairo_memory`,
  `voya_memory`, `nova_memory`, `mira_memory`, `sage_memory`, `arya_memory`) returning the
  data memory (no personal values) + org rules (not other users' personal memory), filtered
  by the acting user's permissions, behind the same read scope as `<agent>_brain` (or a new
  `<agent>.memory` scope if the repo's key model needs it).

### B5. NEXUS super memory (IntelligenceOS only)
- A background job that, for every connected ATLAS project exposing `<agent>_memory` and/or
  `<agent>_brain`, fetches them (as the project's connecting key, no user header, or the
  project's documented admin path), and stores a consolidated **super memory**: per portal
  the agent, collections/entities, counts, vocabularies, observations, last fetched; plus
  cross-portal links (e.g. same student/applicant concepts across CRM → Admissions →
  LearnX → Career Services; employee across HRMS ↔ Dashboard faculty) as plain-English
  notes. Nightly + on demand + after a project connects; failures recorded per project.
- NEXUS personal + org learned memory (B2) per IntelligenceOS user.
- Compact super-memory summary goes into the NEXUS system prompt; a `memory_lookup` tool for
  detail. Etiquette (Part A) in NEXUS prompt too.

## Amendment 1 — redaction matching (supersedes the raw regexes in B1)
Matching the raw regexes against whole column names over-redacts: `/pan/` hits "company",
"expansion"; `/name/` hits "program_name", "school_name", "company_name", "template_name" — and
those vocabularies are exactly what the agents need. Match on TOKENS instead:
- Split the column/field name into lower-case tokens on `_`, `-`, `.`, spaces and camelCase
  (`fatherMobileNo` → father, mobile, no).
- SECRET (never select/read): any token in {password, passwd, pwd, pass, token, secret, apikey,
  otp, hash, salt, session, cookie, credential, credentials, aadhaar, aadhar, pan, bank, ifsc,
  salary, ctc, dob, birth, birthdate} OR adjacent tokens "api"+"key" / "access"+"key" /
  "private"+"key" / "account"+"number".
- PERSONAL (type + fill rate only, no values): any token in {email, mail, phone, mobile, contact,
  address, pincode, whatsapp} OR a person-name field: the name is exactly `name`/`fullname`/
  `username`, or a `name` token preceded by a person word {first, last, middle, full, father,
  mother, guardian, parent, student, applicant, candidate, employee, user, contact, person,
  spouse, nominee}. `program_name`, `school_name`, `company_name`, `course_name` etc. are NOT
  personal — their values may be kept (they still pass the value-level filter below).
- Value-level filter stays: drop any sampled value that looks like an email, a phone number
  (≥ 8 digits), an Aadhaar/PAN pattern, or is longer than 80 chars.
- Repo-specific extra sensitive columns (marks, caste, religion, medical…) stay as added.
Add tests: `company`, `program_name`, `school_name` keep values; `pan_number`, `first_name`,
`fatherMobile`, `api_key` do not.

## Checks every repo ships (offline, stubbed DB / model)
Greeting bands + time-zone fallback, client/server greeting agreement, etiquette text present in
every prompt path (chat, mission, IntelligenceOS ask), scan redaction (a password / email field is
never stored with values), budget / resume, single-flight, `memory_lookup` bounds, remember /
forget, and the manifest `<agent>_memory` action gated by scope. Commits carry no model identifiers.

## NEXUS implementation (this repo)

| Part | Where |
|---|---|
| A1 greeting (pure, shared by client + server) | `src/lib/assistant/greeting.js` — `greetingFor`, `greetLine`, `clockContext`, `resolveTimeZone` |
| Welcome line (Home + voice) | `src/components/home/WelcomeGreeting.js` (imports the same module; browser zone) |
| A2 etiquette rules | `src/lib/assistant/etiquette.js` — `ETIQUETTE_RULES`, `etiquettePrompt(ctx)`; used by the NEXUS chat + voice prompt (`assistant.js`), agent runs (`engine/prompt.js`) and the planner (`planner/prompts.js`, rule 11) |
| Time zone to portals | the browser sends `tz` with every `/api/chat` ask; `callAction({ timeZone })` sends `X-IntelligenceOS-Timezone` (IST when unknown) on every call that acts as a person |
| B2 learned memory | `src/lib/memory/learnedMemory.js` → `DATA_DIR/nexus-memory.json` (org ≤ 200 items, admins only; personal ≤ 50 per user; deduped; secrets, emails, phones and ID numbers refused) |
| B3 prompt + tools | `assistant.js`: compact super-memory summary (≤ 9,000 chars ≈ 2,500 tokens) + learned memory in the system prompt; tools `memory_lookup` (≤ 12 matches, ≤ 600 chars each), `remember(scope: me\|org, text)`, `forget(id\|text)` |
| B5 super memory | `src/lib/memory/superMemory.js` (I/O) + `src/lib/memory/memoryCore.js` (pure rules) → `DATA_DIR/super-memory.json` |
| Admin view | Plugins page → **NEXUS super memory** card (`SuperMemorySection.js`, `GET/POST /api/memory/super`, admin only) |
| CLI | `scripts/build-super-memory.mjs` (`npm run memory:build`) |

### How the super memory is built
- For every **enabled + connected** project, only the actions its manifest lists among
  `<agent>_memory` / `<agent>_brain` (GET, risk read, no required params) are fetched, with the
  project's own connecting key and **no** `X-IntelligenceOS-User` header (20 s / 3 MB per call,
  5 min total budget; a portal past the budget is recorded as a gap and fetched next run).
- Each payload is redacted before storage with the Amendment 1 token rules
  (`memoryCore.classifyField` / `fieldTokens`): SECRET fields dropped entirely, PERSONAL fields keep
  type / fill rate only, sampled values (`topValues`, `samples`, `values` …) pass the value-level
  filter (no email, ≥ 8-digit number, Aadhaar / PAN, > 80 chars), and emails, phone numbers,
  12-digit IDs and PAN patterns are scrubbed from free text. One adaptation for portal payloads: a
  bare `name` inside a schema descriptor (an object that also carries count / type / fields /
  purpose …) names a collection or field and is kept; on any other object it is personal. Then
  condensed per portal: collections + counts + purpose, vocabularies, observations, rules, plus a
  bounded searchable text (24 KB) for `memory_lookup`. Status per portal: `ok`, `partial`, `error`,
  or `stale` (this run failed, the earlier good memory is kept). Gaps name the action and the error.
- Cross-portal links are plain-English notes, only between portals that are present
  (CRM lead → Admissions applicant → LearnX learner → Career Services student; International ↔
  Admissions; HRMS employee ↔ Dashboard faculty; Dashboard ↔ LearnX / Admissions).
- **When:** nightly in the IST 02:30–04:30 window (the IST date is claimed in the store; a missed
  night is skipped, not replayed), in the background 60 s after boot when no memory exists yet,
  after a project connects or re-syncs (that project only), and on **Rebuild now**. Never on a
  request path. Single-flight per process (promise) and across processes (`super-memory.lock`,
  stale after 15 min). Off with `SUPER_MEMORY_ENABLED=false` (and on serverless hosts).
- **Rebuild portal memories too** (checkbox next to Rebuild now, default off; `refreshPortals`):
  first calls each portal's `<agent>_memory?refresh=1` so the portal rebuilds its OWN memory,
  waits 45 s, then fetches as usual. `<agent>_brain` is never refreshed.

### CLI (first scan after a deploy)
```
cd /path/to/atlas-Intelligence-os          # same folder + environment as the server (.env / .env.local are read)
npm run memory:build                        # fetch every portal's memory/brain once
npm run memory:build -- --refresh           # ask portals to rebuild their own memory first
npm run memory:build -- --project crm       # only one connected project (repeatable)
```
Prints per-portal status, actions, counts and gaps. Exit code `0` = at least one portal fetched
(or nothing to fetch), `1` = every portal failed, `2` = another build is running / the build failed.
