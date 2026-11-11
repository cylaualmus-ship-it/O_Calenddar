"use client";

import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlignLeft, CalendarDays, Clock3, MapPin, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { dualTime, localDateTime, localDateTimeToDate, shiftDay } from "@/lib/calendar/dates";
import { classifications, colorNames, operationStatuses } from "@/lib/calendar/events";
import { isCompetitionDetails, isWebUrl } from "@/lib/calendar/competitions";
import { useCalendarStore } from "@/stores/calendar-store";
import type { CalendarEvent, Classification, CompetitionDetails, EventColor, OperationStatus } from "@/types/calendar";
import { CompetitionLogo } from "./competition-logo";

export function EventDialog() {
  const open = useCalendarStore((s) => s.editorOpen);
  const close = useCalendarStore((s) => s.closeEditor);
  const eventId = useCalendarStore((s) => s.editingEventId);
  const event = useCalendarStore((s) => s.events.find((item) => item.id === eventId));
  const day = useCalendarStore((s) => s.selectedDate);
  const zone = useCalendarStore((s) => s.timeZone);
  const localZone = useCalendarStore((s) => s.localTimeZone);
  const draft = useCalendarStore((s) => s.draftSlot);
  const template = useCalendarStore((s) => s.draftEvent);
  const mode = useCalendarStore((s) => s.mode);
  const groupId = useCalendarStore((s) => s.activeGroupId);
  const eventGroups = useCalendarStore((s) => s.eventGroups);
  const groupNames = useCalendarStore((s) => s.groupNames);
  const shared = eventId ? eventGroups[eventId] != null : groupId != null;
  const sharedGroupId = eventId ? eventGroups[eventId] : groupId;

  return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="event-dialog">
        <Dialog.Title className="dialog-title">{event?.competition || template?.competition ? "COMPETITION DETAILS" : event ? "EDIT OPERATION" : "NEW OPERATION"}</Dialog.Title>
        <Dialog.Description className="dialog-description">{mode === "local" ? "DEVICE CALENDAR / NOT SYNCED" : shared && sharedGroupId ? `SHARED / ${groupNames[sharedGroupId] ?? "GROUP"} / CHANGES AFFECT ALL MEMBERS` : "PRIVATE / ONLY YOU CAN SEE THIS"}</Dialog.Description>
        <Dialog.Close asChild><button className="dialog-close icon-button" aria-label="Close dialog"><X size={19} /></button></Dialog.Close>
        {open && <EventForm key={`${eventId ?? template?.id ?? "new"}-${day}-${zone}-${draft?.start ?? ""}`} event={event} template={template} draft={draft} day={day} zone={zone} localZone={localZone} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function EventForm({ event, template, draft, day, zone, localZone }: { event?: CalendarEvent; template: CalendarEvent | null; draft: { start: string; end: string } | null; day: string; zone: string; localZone: string }) {
  const initial = event ?? template;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [color, setColor] = useState<EventColor>(initial?.color ?? "violet");
  const [classification, setClassification] = useState<Classification>(initial?.classification ?? "TLP:CLEAR");
  const [status, setStatus] = useState<OperationStatus>(initial?.status ?? "pending");
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [start, setStart] = useState(initial ? initial.allDay ? `${initial.startDate}T09:00` : localDateTime(initial.start, zone) : draft ? localDateTime(draft.start, zone) : `${day}T09:00`);
  const [end, setEnd] = useState(initial ? initial.allDay ? `${shiftDay(initial.endDate, -1, zone)}T10:00` : localDateTime(initial.end, zone) : draft ? localDateTime(draft.end, zone) : `${day}T10:00`);
  const [competition, setCompetition] = useState<CompetitionDetails | undefined>(initial?.competition);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveEvent = useCalendarStore((s) => s.saveEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const close = useCalendarStore((s) => s.closeEditor);
  const busy = useCalendarStore((s) => s.busy);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Add a title for the operation.");
      return;
    }
    try {
      if (competition && !isCompetitionDetails(competition)) throw new RangeError("Add a competition provider and valid HTTPS links. Each detail must be at most 4000 characters.");
      const base = { id: event?.id ?? crypto.randomUUID(), title: trimmedTitle, description: description.trim(), location: location.trim(), color, classification, status, ...(competition ? { competition } : {}) };
      let next: CalendarEvent;
      if (allDay) {
        const startDate = start.slice(0, 10);
        const lastDate = end.slice(0, 10);
        if (lastDate < startDate) throw new RangeError("The end date must be on or after the start date.");
        next = { ...base, allDay: true, startDate, endDate: shiftDay(lastDate, 1, zone) };
      } else {
        const originalStart = initial && !initial.allDay ? initial.start : draft?.start;
        const originalEnd = initial && !initial.allDay ? initial.end : draft?.end;
        const startDate = originalStart && localDateTime(originalStart, zone) === start
          ? new Date(originalStart)
          : localDateTimeToDate(start, zone);
        const endDate = originalEnd && localDateTime(originalEnd, zone) === end
          ? new Date(originalEnd)
          : localDateTimeToDate(end, zone);
        if (endDate.getTime() <= startDate.getTime()) throw new RangeError("The end time must be after the start time.");
        next = { ...base, allDay: false, start: startDate.toISOString(), end: endDate.toISOString() };
      }
      if (await saveEvent(next)) {
        useCalendarStore.getState().setSelectedDate(next.allDay ? next.startDate : localDateTime(next.start, zone).slice(0, 10));
        close();
        toast.success(event ? "Operation updated" : "Operation initialized");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the operation.");
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (await deleteEvent(event.id)) {
      close();
      toast.success("Operation deleted");
    }
  }

  return <form onSubmit={submit} className="event-form">
    {competition && <section className="competition-summary">
      <header><CompetitionLogo competition={competition} /><strong>{competition.provider} / {competition.kind.toUpperCase()}</strong></header>
      <h3>INFORMATION DETAILS</h3>
      <h3>ELIGIBILITY</h3><p>{competition.eligibility || "Confirm eligibility with the organizer."}</p>
      <h3>HOW TO JOIN</h3><p>{competition.joinInstructions || "Add joining instructions below."}</p>
      <h3>DEADLINES</h3><p>{competition.deadlineNotes || "No official deadline recorded."}</p>
      {isWebUrl(competition.website) && <a className="competition-link" href={competition.website} target="_blank" rel="noopener noreferrer">OPEN OFFICIAL EVENT / REGISTRATION</a>}
      <p>These are saved notes, not live organizer updates. The time window below schedules this entry; changing it does not change other milestones.</p>
    </section>}
    <label className="form-field"><span>TITLE</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Operation name" maxLength={120} required /></label>
    <div className="time-fields">
      <label className="form-field"><span>CLASSIFICATION</span><select value={classification} onChange={(e) => { const selected = classifications.find((item) => item === e.target.value); if (selected) setClassification(selected); }}>{classifications.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="form-field"><span>STATUS</span><select value={status} onChange={(e) => { const selected = operationStatuses.find((item) => item === e.target.value); if (selected) setStatus(selected); }}>{operationStatuses.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></label>
    </div>
    <div className="form-heading"><CalendarDays size={16} aria-hidden="true" /><span>TIME</span><label className="all-day-toggle"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> ALL DAY</label></div>
    <div className="time-fields">
      <label className="form-field"><span>START</span><input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(e) => setStart(allDay ? `${e.target.value}T09:00` : e.target.value)} required /></label>
      <label className="form-field"><span>{allDay ? "END (INCLUSIVE)" : "END"}</span><input type={allDay ? "date" : "datetime-local"} value={allDay ? end.slice(0, 10) : end} onChange={(e) => setEnd(allDay ? `${e.target.value}T10:00` : e.target.value)} required /></label>
    </div>
    <p className="form-timezone"><Clock3 size={13} aria-hidden="true" /> TIME ZONE: {zone.replaceAll("_", " ")}</p>
    {!allDay && <div className="time-preview"><span>START / {timePreview(start, zone, localZone, event && !event.allDay ? event.start : draft?.start)}</span><span>END / {timePreview(end, zone, localZone, event && !event.allDay ? event.end : draft?.end)}</span></div>}
    <label className="form-field"><span><MapPin size={14} aria-hidden="true" /> LOCATION</span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add location" maxLength={200} /></label>
    <label className="form-field"><span><AlignLeft size={14} aria-hidden="true" /> NOTES</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add notes" rows={3} maxLength={2000} /></label>
    <label className="all-day-toggle competition-toggle"><input type="checkbox" checked={!!competition} onChange={(e) => setCompetition(e.target.checked ? { provider: "Custom competition", website: "", logoUrl: "", kind: "competition", eligibility: "", joinInstructions: "", deadlineNotes: "" } : undefined)} /> COMPETITION / CUSTOM DETAILS</label>
    {competition && <fieldset className="competition-edit"><legend>TAILOR THIS COMPETITION</legend>
      <label className="form-field"><span>PROVIDER / ORGANIZER</span><input value={competition.provider} maxLength={120} required onChange={(e) => setCompetition({ ...competition, provider: e.target.value })} /></label>
      <label className="form-field"><span>ENTRY TYPE</span><select value={competition.kind} onChange={(e) => { const kind = e.target.value; if (kind === "competition" || kind === "registration" || kind === "submission" || kind === "preparation") setCompetition({ ...competition, kind }); }}><option value="competition">Competition</option><option value="registration">Registration deadline</option><option value="submission">Submission deadline</option><option value="preparation">Personal preparation target</option></select></label>
      <label className="form-field"><span>OFFICIAL / JOIN URL (HTTPS)</span><input type="url" value={competition.website} maxLength={4000} onChange={(e) => setCompetition({ ...competition, website: e.target.value })} /></label>
      <label className="form-field"><span>LOGO (BUNDLED PATH OR HTTPS URL / OPTIONAL)</span><input value={competition.logoUrl} maxLength={4000} onChange={(e) => setCompetition({ ...competition, logoUrl: e.target.value })} /></label>
      <label className="form-field"><span>HONG KONG / OTHER ELIGIBILITY</span><textarea rows={3} value={competition.eligibility} maxLength={4000} onChange={(e) => setCompetition({ ...competition, eligibility: e.target.value })} /></label>
      <label className="form-field"><span>HOW TO JOIN / REQUIREMENTS</span><textarea rows={3} value={competition.joinInstructions} maxLength={4000} onChange={(e) => setCompetition({ ...competition, joinInstructions: e.target.value })} /></label>
      <label className="form-field"><span>DEADLINE DETAILS / SOURCE TIMEZONE</span><textarea rows={3} value={competition.deadlineNotes} maxLength={4000} onChange={(e) => setCompetition({ ...competition, deadlineNotes: e.target.value })} /></label>
    </fieldset>}
    <fieldset className="color-field"><legend>DISPLAY TAG</legend><div>{colorNames.map((name) => <button key={name} type="button" className={`color-choice ${name} ${color === name ? "chosen" : ""}`} aria-label={`${name} display tag`} aria-pressed={color === name} onClick={() => setColor(name)} />)}</div></fieldset>
    <div className="dialog-actions">
      {event && <button className="delete-button" type="button" onClick={remove} disabled={busy}><Trash2 size={16} />{confirmDelete ? "CONFIRM DELETE" : "DELETE"}</button>}
      {confirmDelete && <button className="secondary-button" type="button" onClick={() => setConfirmDelete(false)}>KEEP</button>}
      <span className="dialog-spacer" />
      <button className="secondary-button" type="button" onClick={close}>CANCEL</button>
      <button className="save-button" type="submit" disabled={busy}>{busy ? "SAVING..." : event ? "SAVE" : "CREATE"}</button>
    </div>
  </form>;
}

function timePreview(value: string, zone: string, localZone: string, original?: string): string {
  try {
    const instant = original && localDateTime(original, zone) === value
      ? new Date(original)
      : localDateTimeToDate(value, zone);
    return dualTime(instant.toISOString(), localZone);
  } catch {
    return "INVALID OR AMBIGUOUS TIME // USE UTC IF NEEDED";
  }
}
