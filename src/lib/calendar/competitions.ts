import { shiftDay } from "./dates";
import type { CalendarEvent, CompetitionDetails, DayKey } from "@/types/calendar";

export const bundledCompetitionLogos = [
  "/competition-logos/codeforces.ico", "/competition-logos/kaggle.ico",
  "/competition-logos/lanqiao.png", "/competition-logos/robomaster.ico",
  "/competition-logos/solana.ico",
  "/competition-logos/samsung.png", "/competition-logos/hk-science-fair.png",
  "/competition-logos/atcoder.png", "/competition-logos/diamond-challenge.png",
  "/competition-logos/edcity.svg", "/competition-logos/technovation.png",
  "/competition-logos/vex.ico",
];

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isCompetitionDetails(value: unknown): value is CompetitionDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.catalogKey !== undefined && (typeof item.catalogKey !== "string" || !item.catalogKey.trim() || item.catalogKey.length > 200)) return false;
  return ["provider", "website", "logoUrl", "eligibility", "joinInstructions", "deadlineNotes"]
    .every((key) => typeof item[key] === "string" && item[key].length <= 4000) &&
    typeof item.provider === "string" && !!item.provider.trim() &&
    typeof item.website === "string" && (item.website === "" || isWebUrl(item.website)) &&
    typeof item.logoUrl === "string" && (item.logoUrl === "" || bundledCompetitionLogos.includes(item.logoUrl) || isWebUrl(item.logoUrl)) &&
    ["competition", "registration", "submission", "preparation"].some((kind) => kind === item.kind);
}

export type CompetitionMilestone = {
  label: string;
  kind: CompetitionDetails["kind"];
} & ({ allDay?: false; start: string; end: string } | { allDay: true; startDate: DayKey; endDate: DayKey });

export function milestoneEndTime(milestone: CompetitionMilestone): number {
  return Date.parse(milestone.allDay ? `${milestone.endDate}T00:00:00+08:00` : milestone.end);
}

export interface CompetitionTemplate {
  id: string;
  title: string;
  details: CompetitionDetails;
  hk: "online" | "conditional" | "confirm";
  schedule: string;
  milestones: CompetitionMilestone[];
  location?: string;
}

export const recommendedCompetitionIds = [
  "samsung-2026", "hk-science-fair-2027", "atcoder-abc484",
  "diamond-challenge-2027", "edcity-2027", "technovation-2027", "vex-hk-2027",
];

const codeforcesDetails: CompetitionDetails = {
  provider: "Codeforces",
  website: "https://codeforces.com/contests",
  logoUrl: "/competition-logos/codeforces.ico",
  kind: "competition",
  eligibility: "Online participation is accessible from Hong Kong. Rated eligibility depends on the round's division and your rating; check its announcement. Out-of-competition participation may be available.",
  joinInstructions: "Create a Codeforces account, open the round, and register before registration closes. Read the announcement, supported languages and contest rules. Submit solutions during the contest; virtual participation is separate from the live rated round.",
  deadlineNotes: "Register before the round starts; check the official page for its exact registration cutoff. Contest end is the solution submission cutoff. Source times use Moscow (UTC+3), converted to instants here.",
};

function codeforces(id: string, title: string, start: string, end: string): CompetitionTemplate {
  return { id, title, details: { ...codeforcesDetails, website: `https://codeforces.com/contest/${id}` }, hk: "online",
    schedule: "Confirmed on the official contest listing. Recheck before joining.",
    milestones: [
      { label: "Contest", kind: "competition", start, end },
      { label: "Submission cutoff", kind: "submission", start: end, end: new Date(Date.parse(end) + 15 * 60000).toISOString() },
    ] };
}

function kaggle(id: string, title: string): CompetitionTemplate {
  return {
    id, title, hk: "conditional", schedule: "Getting Started practice competition. No fixed deadline verified; choose your own preparation target, not an official cutoff.",
    details: {
      provider: "Kaggle", website: `https://www.kaggle.com/competitions/${id}`,
      logoUrl: "/competition-logos/kaggle.ico", kind: "preparation",
      eligibility: "A possible online option for Hong Kong participants, subject to Kaggle's terms and the specific competition rules, including age and location restrictions. Eligibility and prize entitlement are not guaranteed; review Rules before accepting.",
      joinInstructions: "Sign in to Kaggle. Open Rules and confirm your eligibility, then accept the competition rules. Download the data or start a notebook, train a model and upload predictions in the sample submission format. Check any account verification requirements.",
      deadlineNotes: "No fixed closing date verified for this practice option. For other Kaggle contests, track entry, team merger and final submission deadlines separately using the competition's Timeline.",
    },
    milestones: [],
  };
}

// Research snapshot, not a live feed. Unknown dates are deliberately not scheduled.
export const competitionCatalog: CompetitionTemplate[] = [
  codeforces("2290", "Codeforces Round 1134 (Div. 4)", "2026-11-12T14:35:00Z", "2026-11-12T16:50:00Z"),
  codeforces("2285", "Codeforces Round (Div. 2) - November 15", "2026-11-15T14:35:00Z", "2026-11-15T16:35:00Z"),
  {
    id: "codeforces-upcoming", title: "Codeforces upcoming rounds / Kotlin Heroes", hk: "online",
    details: codeforcesDetails, milestones: [],
    schedule: "The listing includes November 21 Div. 1/2 rounds and December Kotlin Heroes events. Choose a round and verify its current schedule before entering dates.",
  },
  kaggle("titanic", "Titanic - Machine Learning from Disaster"),
  kaggle("house-prices-advanced-regression-techniques", "House Prices - Advanced Regression Techniques"),
  {
    id: "lanqiao", title: "Lanqiao Cup - choose division / track", hk: "confirm", milestones: [],
    schedule: "No precise date or Hong Kong division eligibility verified from the official portal. Confirm with the organizer or your institution; do not use a mainland campus deadline as a Hong Kong deadline.",
    details: {
      provider: "Lanqiao Cup", website: "https://dasai.lanqiao.cn/",
      logoUrl: "/competition-logos/lanqiao.png", kind: "preparation",
      eligibility: "Hong Kong eligibility needs organizer confirmation for the selected division, student category and examination venue. Do not assume every university or youth track accepts the same applicants.",
      joinInstructions: "Choose the university or youth division and the software, electronics or other offered track on the official portal. Ask the organizer or your school coordinator to confirm Hong Kong eligibility, registration documents, fee, language and examination location before paying.",
      deadlineNotes: "Registration and provincial/final-round dates depend on division and season. Obtain the official notice for your track and add each deadline separately.",
    },
  },
  {
    id: "robomaster-2027", title: "RoboMaster 2027 University Championship", hk: "conditional",
    schedule: "Team registration closed October 27, 2026 at 15:00 HKT. Regional competition: May-June 2027; finals: July-August 2027. Exact match days are not published here.",
    details: {
      provider: "RoboMaster", website: "https://www.robomaster.com/zh-CN/robo/rm",
      logoUrl: "/competition-logos/robomaster.ico", kind: "competition",
      eligibility: "Open to universities worldwide, including Hong Kong, but not individual walk-in registration. Your university team must meet the 2027 prior-season qualification criteria and pass technical assessments. Registration is already closed; ask an existing qualified team about joining.",
      joinInstructions: "Contact your university's RoboMaster team or faculty adviser. The captain/adviser handles team entry through the official forum's My Team section. Review the 2027 participant manual, qualification criteria, technical reviews, robot budget and travel requirements.",
      deadlineNotes: "Official team registration: October 20, 2026 15:00 to October 27, 2026 15:00 HKT. Closed as of the research snapshot. Technical-assessment deadlines must be checked in the 2027 manual; no exact match day is assumed.",
    },
    milestones: [{ label: "Team registration deadline (closed)", kind: "registration", start: "2026-10-27T07:00:00Z", end: "2026-10-27T07:15:00Z" }],
  },
  {
    id: "solana-2026", title: "MLH Solana Hackathon", hk: "confirm",
    schedule: "Ended November 8, 2026. Hong Kong event window: November 7 01:00 to November 9 02:00. This is not a future registration opportunity.",
    details: {
      provider: "Solana / MLH", website: "https://events.mlh.com/events/15200-solana-hackathon",
      logoUrl: "/competition-logos/solana.ico", kind: "competition",
      eligibility: "Hosted online; beginners were welcome. The linked event has ended. Hong Kong participation and prize eligibility for any future edition must be checked against its own rules, age and location requirements.",
      joinInstructions: "For future editions, sign in/register on the official MLH event page, review eligibility and code of conduct, join team formation, and follow the linked MLH Challenges page for project submission. The linked November 2026 edition is closed.",
      deadlineNotes: "Initial submission: November 8, 2026 23:00 HKT. Final submission/hacking ends: November 9 00:45 HKT. Event ends: November 9 02:00 HKT. Original schedule uses US Eastern Standard Time (UTC-5).",
    },
    milestones: [
      { label: "Hackathon (ended)", kind: "competition", start: "2026-11-06T17:00:00Z", end: "2026-11-08T18:00:00Z" },
      { label: "Initial submission (past)", kind: "submission", start: "2026-11-08T15:00:00Z", end: "2026-11-08T15:15:00Z" },
      { label: "Final submission (past)", kind: "submission", start: "2026-11-08T16:45:00Z", end: "2026-11-08T17:00:00Z" },
    ],
  },
  {
    id: "samsung-2026", title: "Samsung Solve for Tomorrow 2026/27", hk: "conditional",
    location: "Hong Kong / school team; initial proposal online",
    schedule: "Applications close November 13, 2026. A calendar-date marker is used because no exact cutoff time was verified. The current competition page supersedes the earlier October deadline in launch publicity.",
    details: {
      provider: "Samsung Solve for Tomorrow", website: "https://www.samsung.com/hk_en/offer/solvefortomorrow/",
      logoUrl: "/competition-logos/samsung.png", kind: "registration",
      eligibility: "Hong Kong primary, secondary (including private and international schools) and tertiary students. Form a team of 2-5 students from the same institution; each student may join only one team. Primary and secondary teams need a teacher as the main contact.",
      joinInstructions: "1. Recruit 2-5 students from your school and ask a teacher to be your registration contact.\n2. Open the official page, read the current rules and select Apply now.\n3. Choose a challenge under inclusive communities, sports and technology, or environmental sustainability.\n4. Submit the Stage 1 concept proposal: the people and need observed, your AI/STEM idea, and expected impact. A finished prototype is not required initially.\n5. Keep the confirmation and follow the organizer's shortlisting and workshop instructions.",
      deadlineNotes: "Apply by November 13, 2026 (Hong Kong calendar date; exact cutoff time not verified). Shortlisted teams develop prototypes in January-March 2027; final showcase is in April 2027. Confirm exact later-stage dates with the organizer.",
    },
    milestones: [{ label: "Application deadline (time unconfirmed)", kind: "registration", allDay: true, startDate: "2026-11-13", endDate: "2026-11-14" }],
  },
  {
    id: "hk-science-fair-2027", title: "Hong Kong Science Fair 2027", hk: "conditional",
    location: "Hong Kong / school nomination; submissions online",
    schedule: "Stage 1 applications: November 29, 2026 before 23:59 HKT. Stage 2 project submission: February 28, 2027 before 23:59 HKT. A successful application is required for Stage 2.",
    details: {
      provider: "Hong Kong Science Fair", website: "https://www.hksciencefair.org.hk/competitionDetails.html",
      logoUrl: "/competition-logos/hk-science-fair.png", kind: "competition",
      eligibility: "Hong Kong school students from Primary 4 to Secondary 6, or international-school Years 4-12, in 2026/27. Junior and senior secondary divisions are available. Each team has 1-4 students, must be nominated by its school, and needs a full-time teaching staff member as supervising teacher.",
      joinInstructions: "1. Choose the correct junior/senior secondary division and recruit 1-4 students.\n2. Ask your school to nominate the team and appoint a supervising teacher.\n3. Open Competition Details, read the rules/PDF and use the HKSF online application platform for Stage 1.\n4. Submit the application before November 29 and retain the confirmation.\n5. If accepted, follow the platform instructions for Stage 2 and upload the required project materials and video before February 28. Check later judging/exhibition notices.",
      deadlineNotes: "Stage 1: November 29, 2026 before 23:59 HKT. Stage 2: February 28, 2027 before 23:59 HKT. Submit early; the one-minute calendar markers start at the cutoff and do not extend it. Stage 2 is conditional on successful Stage 1 submission.",
    },
    milestones: [
      { label: "Stage 1 application cutoff", kind: "registration", start: "2026-11-29T15:59:00Z", end: "2026-11-29T16:00:00Z" },
      { label: "Stage 2 project cutoff", kind: "submission", start: "2027-02-28T15:59:00Z", end: "2027-02-28T16:00:00Z" },
    ],
  },
  {
    id: "atcoder-abc484", title: "AtCoder Beginner Contest 484", hk: "online",
    schedule: "Online on November 14, 2026, 20:00-21:40 HKT (21:00-22:40 JST). Participation is open to all; the rated range is 0-1999.",
    details: {
      provider: "AtCoder", website: "https://atcoder.jp/contests/abc484",
      logoUrl: "/competition-logos/atcoder.png", kind: "competition",
      eligibility: "Individual online contest, open to all participants including Hong Kong secondary-school students. Rating updates apply to the stated 0-1999 range. Generative AI is prohibited during the ongoing contest, including for unrated participants.",
      joinInstructions: "1. Create/sign in to your AtCoder account.\n2. Open ABC 484, read the rules and register for the contest.\n3. Try the linked practice contest to check your language and submission workflow.\n4. Be ready before November 14 at 20:00 HKT, solve tasks and submit code before 21:40 HKT.\n5. Work independently and do not use generative AI during the contest.",
      deadlineNotes: "Contest: November 14, 2026 20:00-21:40 HKT, converted from Japan Standard Time (UTC+9). Solution submissions close at contest end. Check the official page for any schedule or registration changes.",
    },
    milestones: [{ label: "Contest", kind: "competition", start: "2026-11-14T12:00:00Z", end: "2026-11-14T13:40:00Z" }],
  },
  {
    id: "diamond-challenge-2027", title: "Diamond Challenge 2027", hk: "conditional",
    schedule: "Submission window is open. Deadline: January 15, 2027 at 06:00 HKT, converted from January 14 at 17:00 US Eastern Standard Time.",
    details: {
      provider: "Diamond Challenge", website: "https://diamondchallenge.org/competition/",
      logoUrl: "/competition-logos/diamond-challenge.png", kind: "submission",
      eligibility: "Worldwide high-school teams, including Hong Kong. Teams need 2-4 students aged 14-18 at the submission deadline and an adult adviser aged 21 or older. Each student may join only one team and submit one concept per competition year. Virtual/pre-recorded pitching is available; confirm finalist attendance requirements separately.",
      joinInstructions: "1. Form a team of 2-4 eligible students and find an adviser aged 21+.\n2. Read the official rules and choose Business Innovation or Social Innovation.\n3. Use the official submission link and prepare all required concept materials.\n4. Select a live pitch site or the virtual/pre-recorded pitch option; prepare its required pitch deck/video.\n5. Submit before the deadline and monitor notification emails. Check disclosure, original-work and later-round requirements before submitting an existing app.",
      deadlineNotes: "Submit by January 14, 2027 at 17:00 EST = January 15 at 06:00 HKT. Advancing-team notifications: February 10 (source date); finalist announcement: March 9; Limitless World Summit: April 29-30. Later event times/attendance arrangements must be confirmed. The one-minute deadline marker does not extend the cutoff.",
    },
    milestones: [{ label: "Submission cutoff", kind: "submission", start: "2027-01-14T22:00:00Z", end: "2027-01-14T22:01:00Z" }],
  },
  {
    id: "edcity-2027", title: "EdCity Student Innovation Competition 2026/27", hk: "conditional",
    location: "School team / online submissions and presentations",
    schedule: "Registration and first proposal close January 15, 2027. Revised proposals for qualifying finalists are due April 18, 2027. These are date-only markers; exact cutoff times were not verified.",
    details: {
      provider: "EdCity", website: "https://www.edcity.hk/home/en/sic/202627/introduction/",
      logoUrl: "/competition-logos/edcity.svg", kind: "competition",
      eligibility: "Junior secondary (S1-S3) and senior secondary (S4-S6) categories. Teams must have 2-6 students from the same school and be recommended and registered by a teacher. Check the current rules for the appropriate school/category.",
      joinInstructions: "1. Form a same-school team of 2-6 students and ask a teacher to recommend/register it.\n2. Choose a specific issue in Family, School or Community under the competition theme.\n3. Prepare the first proposal as a PowerPoint presentation, maximum 40 pages, explaining the problem, ICT/AI solution, feasibility and expected impact.\n4. Use Register Now on the official website and submit the proposal with registration by January 15.\n5. Follow the online presentation/Q&A stages. If qualified, revise the proposal by April 18 and check the June 2027 exhibition requirements.",
      deadlineNotes: "Register and submit first proposal by January 15, 2027. Revised finalist proposal by April 18, 2027. Exact cutoff times are unconfirmed, so calendar entries cover those dates rather than inventing midnight deadlines. Finalist exhibition/awards: June 2027; exact day to be announced.",
    },
    milestones: [
      { label: "Registration and first proposal (time unconfirmed)", kind: "registration", allDay: true, startDate: "2027-01-15", endDate: "2027-01-16" },
      { label: "Revised finalist proposal (time unconfirmed)", kind: "submission", allDay: true, startDate: "2027-04-18", endDate: "2027-04-19" },
    ],
  },
  {
    id: "technovation-2027", title: "Technovation Challenge 2026/27", hk: "conditional",
    schedule: "Free global program with virtual participation. Register by March 12, 2027 at 07:59 HKT; submit the project by May 6 at 08:00 HKT.",
    details: {
      provider: "Technovation", website: "https://technovationchallenge.org/get-involved/",
      logoUrl: "/competition-logos/technovation.png", kind: "competition",
      eligibility: "Free and open globally to youth ages 8-18, including Hong Kong. Both Girls and Mixed tracks are offered; participants may join virtually without a local chapter. Review the current age-division, team, guardian-consent and honor-code requirements before registering.",
      joinInstructions: "1. Open the official page and choose the student Sign Up link.\n2. Review eligibility, consent requirements and the Girls/Mixed track options; form your team according to current rules.\n3. Connect with a local program/mentor if helpful, or participate virtually.\n4. Use the curriculum to build a technology solution to a community problem, with a business plan and pitch.\n5. Formally register the team before the registration cutoff and upload all required project materials before the submission cutoff. Agree to the honor code and check original-work/AI-use rules.",
      deadlineNotes: "Team registration: March 11, 2027 23:59 UTC = March 12 07:59 HKT. Project submission: May 5, 2027 17:00 PDT = May 6 08:00 HKT. Quarterfinal judging: May 11-June 7; semifinals: June 15-28 (source calendar dates). One-minute calendar markers start at each cutoff, not an extra submission grace period.",
    },
    milestones: [
      { label: "Team registration cutoff", kind: "registration", start: "2027-03-11T23:59:00Z", end: "2027-03-12T00:00:00Z" },
      { label: "Project submission cutoff", kind: "submission", start: "2027-05-06T00:00:00Z", end: "2027-05-06T00:01:00Z" },
    ],
  },
  {
    id: "vex-hk-2027", title: "VEX V5 Hong Kong Championship 2027 (High School)", hk: "conditional",
    location: "Grand Hall, Hong Kong Science Park Phase 3",
    schedule: "Registration is not open yet: opens December 16, 2026 at 10:00 HKT and closes January 31, 2027 at 18:00 HKT, subject to capacity. Competition: February 20-21 at Hong Kong Science Park.",
    details: {
      provider: "VEX Robotics", website: "https://events.vex.com/robot-competitions/vex-robotics-competition/RE-V5RC-27-4476.html",
      logoUrl: "/competition-logos/vex.ico", kind: "competition",
      eligibility: "High-school robotics teams in Hong Kong; not an individual software-only entry. You need a registered VEX V5 team, an adult/school team contact, and a rules-compliant robot. Check the season's age/team requirements and available places. Event entry is listed as free, but robot equipment, team registration and travel may cost extra.",
      joinInstructions: "1. Contact your school's robotics teacher/team and arrange a registered VEX V5 team and robot.\n2. Read the current game manual, event rules and engineering-notebook requirements.\n3. Have the team contact sign in to the official VEX Events registration platform and open this event when registration begins.\n4. Register the team before the deadline while places remain; save confirmation and follow workshop/check-in notices.\n5. Prepare for qualification matches, robot skills and judging, including the digital engineering notebook and in-person interview. Reconfirm the venue and daily timetable before attending.",
      deadlineNotes: "Registration opens December 15, 2026 21:00 EST = December 16 10:00 HKT. Registration deadline January 31, 2027 05:00 EST = January 31 18:00 HKT, subject to capacity. Competition February 20-21, 2027 (Hong Kong local dates; daily match times unconfirmed). The event is not open for entry as of the research snapshot.",
    },
    milestones: [
      { label: "Registration opens", kind: "registration", start: "2026-12-16T02:00:00Z", end: "2026-12-16T02:01:00Z" },
      { label: "Registration cutoff", kind: "registration", start: "2027-01-31T10:00:00Z", end: "2027-01-31T10:01:00Z" },
      { label: "Championship (daily times unconfirmed)", kind: "competition", allDay: true, startDate: "2027-02-20", endDate: "2027-02-22" },
    ],
  },
];

export const competitionResearchDate = "2026-11-10";

export function recommendedCompetitionEvents(day: DayKey): CalendarEvent[] {
  return competitionCatalog.filter((item) => recommendedCompetitionIds.includes(item.id))
    .flatMap((item) => item.milestones.map((milestone) => competitionEvent(item, day, milestone)));
}

export function competitionEvent(template: CompetitionTemplate, day: DayKey, milestone?: CompetitionMilestone): CalendarEvent {
  const base = {
    id: crypto.randomUUID(),
    title: milestone ? `${template.title} / ${milestone.label}` : template.title,
    description: milestone ? template.schedule : `PERSONAL TARGET - not an official event date.\n${template.schedule}`,
    location: template.location ?? (template.details.provider === "RoboMaster" ? "Confirm venue with university team" : template.details.provider === "Lanqiao Cup" ? "Confirm examination venue" : "Online"),
    color: "blue" as const, classification: "TLP:CLEAR" as const, status: "pending" as const,
    competition: { ...template.details, ...(milestone ? { catalogKey: `${template.id}/${milestone.label}` } : {}), kind: milestone?.kind ?? "preparation" as const },
  };
  return milestone
    ? milestone.allDay
      ? { ...base, allDay: true, startDate: milestone.startDate, endDate: milestone.endDate }
      : { ...base, allDay: false, start: milestone.start, end: milestone.end }
    : { ...base, allDay: true, startDate: day, endDate: shiftDay(day, 1, "UTC") };
}
