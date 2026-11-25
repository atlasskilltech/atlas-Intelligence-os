# ATLAS Dashboard agents: setup guide

Ready-made agents for the ATLAS Dashboard (timetable, exams, attendance, rooms, events and tickets).
They appear as example chips under the prompt box on **Home** and **New agent**
(`src/components/agents/suggestions.js`).

**Each person creates their own agents.** An agent always runs as its owner. The dashboard checks the
owner's email on every call and shows only what that person may see there: their permissions and
school limits. An agent cannot be shared to give someone more access.

## 1. One-time setup (admin)

1. **ATLAS Dashboard → Access Management → IntelligenceOS Keys → + New key**:
   - Tick the read areas.
   - Tick the **Drafts** areas only if the draft agents below are wanted.
   - Expiry: 90 days.
   - Allowed IPs: the IntelligenceOS server.
   - Keep **Acts as the signed-in user** ticked.
2. **IntelligenceOS → Connectors → Connect project**:
   - Name: `ATLAS Dashboard`
   - URL: `https://uat-dashboard.atlasskilltech.app/agent-api`
   - Paste the key and tick **"This project acts as the signed-in user"**.
3. Check that everyone's IntelligenceOS email is the **same** as their dashboard email, which is the faculty
   email for teachers.

**Adding areas later:** on the dashboard, use **IntelligenceOS Keys → Edit areas** on the key and tick the new
areas. For example, tick **Admissions (read)** and **All dashboard pages (read)** so Intelligence can answer
questions about every menu page. Then click **Connectors → ATLAS Dashboard → Re-check access** here. Each user's
list of actions refreshes within 10 minutes.

## 2. Agents

| Chip | Who creates it | When it runs | They need on the dashboard | Key areas |
|---|---|---|---|---|
| Today on campus | Anyone (a question, not an agent) | Asked in the Home assistant | `timetable.view`, `exam.view` | Timetable, Exams |
| Morning campus brief | Dean / Director / admin | Weekdays 08:00 | timetable, `exam.view`, `student_events.view`, `tickets.view` | Timetable, Exams, Events, Tickets |
| Weekly attendance watch | Each HOD / programme head | Mondays 09:00 | `attendance.view` + `students.view` | Attendance |
| Exam day monitor | Exam cell | Weekdays 07:30 | `exam.view` | Exams |
| My day (faculty) | Any faculty member | Weekdays 07:30 | Nothing: their email must match their faculty record | Faculty's own schedule |
| Find & book a free room | Floor managers / infra | Manual (write the date and time in the run box) | `infra.view` + `infra.edit` | Rooms, Draft room bookings |
| Low-attendance email draft | Programme coordinator | Mondays 09:30 | attendance + `students.view` + `student_email.send` | Attendance, Draft low-attendance emails |
| Timetable change helper | Timetable admin | Manual (describe the change in the run box) | `timetable.view` + `timetable.move` / `timetable.delete` | Timetable, Rooms, Draft timetable changes |
| Weekly room usage | Infra head | Fridays 17:00 | `infra.view` | Rooms |
| Admissions today | Admissions team (a question, not an agent) | Asked in the Home assistant | `admissions.view` | Admissions |
| Weekly admissions report | Admissions head / Director | Mondays 09:00 | `admissions.view` | Admissions |
| Admissions by school & degree | Admissions head | Daily 18:00 | `admissions.view` | Admissions |

**Admissions questions:** anything on the dashboard's Admissions page can be asked directly in the Home assistant:
- the funnel
- any intake, school, program, degree or date range
- state, city, Class XII / X school, gender, board, referral, lead source or channel
- Class XII scores and the application trend
- year-on-year comparison, and looking up an applicant by name or id

For example: "How many B.Des applications from Maharashtra have paid so far this intake, versus last year?"
Agents never receive applicants' email or phone.

**School limits:** to keep an HOD's agents to their own school, add a limit under
**IntelligenceOS Keys → School limits for agents** on the dashboard. Super admins are never limited.

## 3. Creating one (each person)

1. **New agent** → click the chip → **Continue**. The planner builds the steps from the dashboard actions
   you are allowed to use.
2. Check the plan:
   - Every dashboard step uses **ATLAS Dashboard**.
   - The schedule is right (Asia/Kolkata).
   - Draft agents use a `draft_…` action, not a read action.
3. Run a **Test** first.
   - Reads run for real.
   - Write steps are only simulated in a test, so no draft is created.
   - Then run **Live**, or switch the schedule on.
4. Draft agents: IntelligenceOS asks you to approve each write step. The run page then shows **Open draft in
   ATLAS Dashboard**. Nothing changes until someone with the permission confirms it under **Agent Drafts**
   on the dashboard.

## 4. If something is missing

| What you see | Why | Fix |
|---|---|---|
| "…is not a user or faculty member of the ATLAS Dashboard" | Emails differ between the two apps | Use the same email in both |
| "Your ATLAS Dashboard access does not allow this (needs …)" | The owner lacks that dashboard permission | Grant it in Manage Access, or use another owner |
| "This key does not allow …", or the assistant says it only has e.g. `list_schools` | The area is not ticked on the key | Dashboard → IntelligenceOS Keys → **Edit areas**, then **Re-check access** here |
| Planner says it cannot find a dashboard action | The connector or key does not offer it to you | As above; check **Connectors → ATLAS Dashboard → View access** |

Not available yet: a ticket triage agent that replies to individual new tickets. The dashboard only gives
ticket **counts** to agents. Adding a "list open tickets" read action would make this possible.
