"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, Trophy, X } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { competitionCatalog, competitionEvent, competitionResearchDate, milestoneEndTime, recommendedCompetitionIds } from "@/lib/calendar/competitions";
import { useCalendarStore } from "@/stores/calendar-store";
import { CompetitionLogo } from "./competition-logo";

const hkLabels = { online: "HK / ONLINE OPTION", conditional: "HK / CONDITIONS APPLY", confirm: "HK / CONFIRM ELIGIBILITY" };

export function CompetitionCatalog() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState("all");
  const [filter, setFilter] = useState("all");
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const openTemplate = useCalendarStore((s) => s.openTemplate);
  const available = useCalendarStore((s) => s.storageAvailable);
  const importing = useCalendarStore((s) => s.importingCompetitions);
  const busy = useCalendarStore((s) => s.busy);
  const mode = useCalendarStore((s) => s.mode);
  const groupName = useCalendarStore((s) => s.groupName);
  const addRecommended = useCalendarStore((s) => s.addRecommendedCompetitions);
  const templates = competitionCatalog.filter((item) =>
    (provider === "all" || item.details.provider === provider) &&
    (filter !== "online" || item.hk === "online") &&
    (filter !== "recommended" || recommendedCompetitionIds.includes(item.id)) &&
    (filter !== "upcoming" || item.milestones.some((milestone) => milestoneEndTime(milestone) > Date.now())));

  async function addAll() {
    const result = await addRecommended();
    if (!result.complete) toast.error(`Import stopped. ${result.added} entries added; retry skips saved entries.`);
    else toast.success(result.added ? `Added ${result.added} calendar entries for the seven recommendations.` : "All recommended competition entries are already saved.");
  }

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="competition-trigger"><Trophy size={17} /> COMPETITIONS / HK</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="event-dialog competition-catalog">
        <Dialog.Title className="dialog-title">COMPETITION PLANNER</Dialog.Title>
        <Dialog.Description className="dialog-description">Hong Kong participation guide / researched {competitionResearchDate}. Not a live feed. Check official rules before registering. All previews below use HKT (UTC+8).</Dialog.Description>
        <Dialog.Close asChild><button className="dialog-close icon-button" aria-label="Close competition planner"><X size={19} /></button></Dialog.Close>
        <div className="time-fields competition-filters">
          <label className="form-field"><span>PLATFORM</span><select aria-label="Competition platform" value={provider} onChange={(e) => setProvider(e.target.value)}><option value="all">All platforms</option>{Array.from(new Set(competitionCatalog.map((item) => item.details.provider))).map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="form-field"><span>SHOW</span><select aria-label="Competition filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All / include conditional and past</option><option value="recommended">Seven new recommendations</option><option value="online">HK online options</option><option value="upcoming">Confirmed upcoming dates</option></select></label>
        </div>
        <div className="competition-import">
          <button type="button" className="save-button" disabled={!available || busy || importing} onClick={() => void addAll()}>{importing ? "ADDING..." : "ADD ALL 7 RECOMMENDATIONS"}</button>
          <p className="competition-notice">Adds every dated milestone for the seven new competitions to {mode === "local" ? "this browser calendar" : groupName ? `the shared group ${groupName} (visible to all members)` : "your private calendar"}. Existing imported entries and your edits are kept. This does not register you with organizers.</p>
        </div>
        <p className="competition-notice">Choose a dated milestone to place its logo on the calendar. Undated options create a clearly labelled personal target on {selectedDate}. Review and save the editor to add it. Add registration and submission cutoffs as separate entries; no invented deadlines.</p>
        {!available && <p role="alert" className="competition-notice">Calendar storage is unavailable. You can browse official information but cannot add entries.</p>}
        <div className="competition-list">
          {!templates.length && <p role="status">No matching competitions. Try another filter.</p>}
          {templates.map((item) => <article key={item.id} className="competition-card">
            <header><CompetitionLogo competition={item.details} /><h2>{item.title}</h2></header>
            <p className={`competition-eligibility hk-${item.hk}`}>{hkLabels[item.hk]}</p>
            <p>{item.schedule}</p>
            <details><summary>Information details / how to join</summary>
              <h3>HONG KONG ELIGIBILITY</h3><p>{item.details.eligibility}</p>
              <h3>HOW TO JOIN</h3><p>{item.details.joinInstructions}</p>
              <h3>DEADLINES</h3><p>{item.details.deadlineNotes}</p>
            </details>
            <a href={item.details.website} target="_blank" rel="noopener noreferrer" className="competition-link">OFFICIAL EVENT / RULES <ExternalLink size={13} /></a>
            <div className="competition-milestones">
              {item.milestones.map((milestone) => <button key={milestone.label} className="secondary-button" disabled={!available || importing} onClick={() => { setOpen(false); openTemplate(competitionEvent(item, selectedDate, milestone)); }}>
                <strong>{milestoneEndTime(milestone) <= Date.now() ? "PAST / " : "ADD / "}{milestone.label}</strong>
                <small>{milestone.allDay ? `${milestone.startDate} / DATE ONLY` : `${formatInTimeZone(milestone.start, "Asia/Hong_Kong", "dd MMM yyyy HH:mm")} HKT`}</small>
              </button>)}
              <button className="secondary-button" disabled={!available || importing} onClick={() => { setOpen(false); openTemplate(competitionEvent(item, selectedDate)); }}>CUSTOMIZE / PERSONAL TARGET</button>
            </div>
          </article>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
