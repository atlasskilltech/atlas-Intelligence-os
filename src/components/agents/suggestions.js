// Example tasks shown as chips under the prompt box (home assistant and agent builder).
//
// The ATLAS Dashboard ones are written for the dashboard's Agent API actions
// (timetable, exams, attendance, rooms, events, tickets, drafts), so the planner
// picks the right actions. Each agent runs as the person who creates it, and sees
// only what that person may see on the dashboard. "Draft …" steps never change
// data: they return a link to confirm on the dashboard (Agent Drafts).
// Setup guide: docs/ATLAS_DASHBOARD_AGENTS.md.
export const PROMPT_SUGGESTIONS = [
  // ── ATLAS Dashboard ──
  {
    label: "Today on campus",
    prompt:
      "From the ATLAS Dashboard: how many lectures are scheduled today, how many timetable entries were created today, and which exams are scheduled today?",
  },
  {
    label: "Morning campus brief",
    prompt:
      "Every weekday at 8:00 AM, use the ATLAS Dashboard to build my morning brief for today: the timetable summary (lectures, faculty teaching, rooms in use, sections with no lecture), today's exams and invigilation with any room that has no invigilator, today's student events, and how many student support tickets are open. Keep it short with the key numbers first and anything that needs attention highlighted, create a report and notify me.",
  },
  {
    label: "Weekly attendance watch",
    prompt:
      "Every Monday at 9:00 AM, use the ATLAS Dashboard to list students whose attendance is below 75% over the last 30 days (only students marked in at least 5 lectures) in the schools I can see, lowest first and grouped by cohort, and add last Friday's attendance summary by school. Create a report and notify me with the number of students below 75%.",
  },
  {
    label: "Exam day monitor",
    prompt:
      "Every weekday at 7:30 AM, check the ATLAS Dashboard for today's exams. If there are none, finish without notifying. Otherwise list each paper with time, room and classes, list today's invigilation duties, highlight any room without an invigilator, create a report and notify me.",
  },
  {
    label: "My day (faculty)",
    prompt:
      "Every weekday at 7:30 AM, get my own lectures and my own exam invigilation duties for today and tomorrow from the ATLAS Dashboard and notify me with a short schedule in time order (time, subject, classes, room). If I have nothing, say so in one line.",
  },
  {
    label: "Find & book a free room",
    prompt:
      "When I run this agent I will write a date, a time range, a building (optional) and what the room is for. Use the ATLAS Dashboard to find rooms that are free then, pick the most suitable one, and draft a room booking for it with my reason. Do not book directly: notify me with the draft link so the booking can be confirmed on the dashboard.",
  },
  {
    label: "Low-attendance email draft",
    prompt:
      "Every Monday at 9:30 AM, use the ATLAS Dashboard to draft a low-attendance warning email to the students below 75% attendance over the last 30 days (at least 5 lectures marked) in the schools I can see. Do not send it: notify me with the draft link and how many students it covers, so I can review the list and the text and send it from the dashboard.",
  },
  {
    label: "Timetable change helper",
    prompt:
      "When I run this agent I will describe a lecture to move or cancel (class, subject, date and the new time or room). Find the lecture in the ATLAS Dashboard timetable, check that the new room is free, and draft the move or the cancellation with my reason. Do not change the timetable directly: notify me with the draft link and any clash warnings, so it can be confirmed on the dashboard.",
  },
  {
    label: "Weekly room usage",
    prompt:
      "Every Friday at 5:00 PM, use the ATLAS Dashboard room usage for each day from Monday to Friday this week to report, per building, how many rooms were used and idle each day, and list the 10 busiest rooms of the week. Create a report and notify me.",
  },

  {
    label: "Ask NOVA: what needs attention",
    prompt:
      "Ask NOVA, the ATLAS Dashboard's own agent, what needs attention on campus today (timetable gaps, exams without invigilators, low attendance, open tickets), using its brain first, and summarise the answer with the key numbers.",
  },

  // ── ATLAS Dashboard: Admissions (/admissions/dashboard) ──
  {
    label: "Admissions today",
    prompt:
      "From the ATLAS Dashboard admissions: how many applications, paid applications and enrolments does the current intake have so far, and how does that compare with the same period last year?",
  },
  {
    label: "Weekly admissions report",
    prompt:
      "Every Monday at 9:00 AM, use the ATLAS Dashboard admissions data for the current intake to report: the funnel (applications, paid, challenge completed, passed, enrolled, tuition fee paid, withdrawn) with the change versus the same period last year, last week's applications and paid applications, the top 10 states and cities, the degree-wise split and the top lead sources. Create a report and notify me.",
  },
  {
    label: "Admissions by school & degree",
    prompt:
      "Every day at 6:00 PM, use the ATLAS Dashboard admissions data to list today's new applications and paid applications for the current intake by school and by degree, compare them with the same day last year, and notify me with a short summary.",
  },

  // ── ATLAS CRM ──
  {
    label: "Daily admission lead report",
    prompt:
      "Every morning, check new admission leads in our CRM, identify duplicate entries, summarize the lead status, and prepare a daily report.",
  },
  {
    label: "Counsellor workload report",
    prompt: "Every Monday, count open leads and overdue follow-ups for each counsellor in our CRM and prepare a workload report.",
  },
  {
    label: "Follow-up reminders",
    prompt: "Every evening, list CRM leads with overdue follow-ups, group them by counsellor and notify me with a summary.",
  },
  // ── ATLAS HRMS (MIRA) ──
  {
    label: "Pending approvals nudge",
    prompt:
      "Every weekday at 10:00 AM, read MIRA's brain in ATLAS HRMS and list the leave and attendance-regularisation requests waiting for approval for more than 2 days, grouped by approver with the oldest first. Create a report and notify me with the number pending. Do not approve or reject anything.",
  },
  {
    label: "Weekly attendance irregularities",
    prompt:
      "Every Monday at 9:00 AM, ask MIRA in ATLAS HRMS for last week's attendance irregularities (late marks, missed punches, absences without leave) by department, highlight employees with three or more, create a report and notify me.",
  },

  // ── ATLAS LearnX (SAGE) ──
  {
    label: "Grading queue",
    prompt:
      "Every weekday at 5:00 PM, ask SAGE in ATLAS LearnX which assignment submissions are waiting to be graded, grouped by course and faculty with the oldest first and anything past the grading deadline highlighted. Create a report and notify me.",
  },
  {
    label: "At-risk students",
    prompt:
      "Every Monday at 8:30 AM, read SAGE's brain in ATLAS LearnX and list students at risk (missed submissions, low scores or no activity in the last 14 days) by course, with the reason for each. Create a report and notify me with the number of at-risk students.",
  },

  // ── ATLAS Admissions (ARYA) ──
  {
    label: "Daily admissions brief",
    prompt:
      "Every day at 6:30 PM, read ARYA's brain in ATLAS Admissions and build today's admissions brief: new applications, payments, documents submitted and verified, and anything ARYA flags as needing attention. Keep the key numbers first, create a report and notify me.",
  },
  {
    label: "Document backlog watch",
    prompt:
      "Every weekday at 11:00 AM, ask ARYA in ATLAS Admissions for applications whose documents have been waiting for verification for more than 2 days, grouped by school with the oldest first. If there are none, finish without notifying; otherwise create a report and notify me.",
  },
  {
    label: "Bot leads not pushed",
    prompt:
      "Every evening at 7:00 PM, ask ARYA in ATLAS Admissions which chatbot leads from today have not yet been pushed to the CRM, with the reason for each. Notify me with the count and the list. If ARYA proposes pushing them, include its confirm link so I can approve it in ATLAS Admissions.",
  },

  {
    label: "Research submission check",
    prompt: "When a new research paper is submitted, check that the required fields are filled in and notify the reviewer.",
  },
];
