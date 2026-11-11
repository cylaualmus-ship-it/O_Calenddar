export type DayKey = string;
export type CalendarView = "month" | "week" | "day" | "agenda";
export type EventColor = "violet" | "blue" | "green" | "orange" | "rose";
export type TimeMode = "local" | "utc";
export type Classification = "TLP:CLEAR" | "TLP:GREEN" | "TLP:AMBER" | "TLP:RED";
export type OperationStatus = "pending" | "active" | "completed" | "aborted";

export interface CompetitionDetails {
  catalogKey?: string;
  provider: string;
  website: string;
  logoUrl: string;
  kind: "competition" | "registration" | "submission" | "preparation";
  eligibility: string;
  joinInstructions: string;
  deadlineNotes: string;
}

interface BaseEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  color: EventColor;
  classification: Classification;
  status: OperationStatus;
  competition?: CompetitionDetails;
}

export interface TimedEvent extends BaseEvent {
  allDay: false;
  start: string;
  end: string;
}

export interface AllDayEvent extends BaseEvent {
  allDay: true;
  startDate: DayKey;
  endDate: DayKey;
}

export type CalendarEvent = TimedEvent | AllDayEvent;
