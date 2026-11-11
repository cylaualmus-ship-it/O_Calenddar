"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  DndContext, KeyboardCode, KeyboardSensor, PointerSensor, useDraggable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { formatInTimeZone } from "date-fns-tz";
import { CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { atNoon, dualTime, getDayBounds, getWeekDays, shiftDay, toDayKey, todayKey } from "@/lib/calendar/dates";
import {
  isSpanning, layoutDay, layoutSpanning, moveSpanning, moveTimed, resizeSpanning, resizeTimed, SNAP_MS,
  type PositionedEvent, type SpanningEvent,
} from "@/lib/calendar/time-grid";
import { useCalendarStore } from "@/stores/calendar-store";
import type { CalendarEvent, TimedEvent } from "@/types/calendar";
import { CompetitionLogo } from "./competition-logo";

const SLOT_HEIGHT = 18;
const LANE_HEIGHT = 30;

export function TimeGridView() {
  const date = useCalendarStore((s) => s.selectedDate);
  const view = useCalendarStore((s) => s.view);
  const zone = useCalendarStore((s) => s.timeZone);
  const localZone = useCalendarStore((s) => s.localTimeZone);
  const events = useCalendarStore((s) => s.events);
  const setDate = useCalendarStore((s) => s.setSelectedDate);
  const openSlot = useCalendarStore((s) => s.openSlot);
  const openEditor = useCalendarStore((s) => s.openEditor);
  const saveEvent = useCalendarStore((s) => s.saveEvent);
  const storageAvailable = useCalendarStore((s) => s.storageAvailable);
  const columnsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; startX: number; startY: number; x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: string; kind: "time" | "span"; steps: number } | null>(null);

  const days = useMemo(() => view === "day" ? [date] : getWeekDays(date, zone), [date, view, zone]);
  const spanning = useMemo(() => layoutSpanning(events, days, zone), [events, days, zone]);
  const laneRows = Math.max(1, ...spanning.map((item) => item.row + 1));
  const bounds = useMemo(() => days.map((day) => getDayBounds(day, zone)), [days, zone]);
  const maxSlots = Math.max(...bounds.map((day) => Math.ceil((day.end - day.start) / SNAP_MS)));
  const today = todayKey(zone);
  const timedEvents = useMemo(() => events.filter((event): event is TimedEvent => !event.allDay && !isSpanning(event, zone)), [events, zone]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 32 * SLOT_HEIGHT;
  }, [view]);

  useEffect(() => {
    function trackPointer(event: PointerEvent) {
      if (pointerRef.current?.id === event.pointerId) {
        pointerRef.current.x = event.clientX;
        pointerRef.current.y = event.clientY;
      }
    }
    document.addEventListener("pointermove", trackPointer, true);
    document.addEventListener("pointerup", trackPointer, true);
    return () => {
      document.removeEventListener("pointermove", trackPointer, true);
      document.removeEventListener("pointerup", trackPointer, true);
    };
  }, []);

  const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const dayWidth = (columnsRef.current?.getBoundingClientRect().width ?? 0) / days.length;
    switch (event.code) {
      case KeyboardCode.Right: return { ...currentCoordinates, x: currentCoordinates.x + dayWidth };
      case KeyboardCode.Left: return { ...currentCoordinates, x: currentCoordinates.x - dayWidth };
      case KeyboardCode.Down: return { ...currentCoordinates, y: currentCoordinates.y + SLOT_HEIGHT };
      case KeyboardCode.Up: return { ...currentCoordinates, y: currentCoordinates.y - SLOT_HEIGHT };
      default: return undefined;
    }
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  function dragStart(event: DragStartEvent) {
    if (event.activatorEvent instanceof PointerEvent) {
      const pointer = event.activatorEvent;
      pointerRef.current = {
        id: pointer.pointerId, startX: pointer.clientX, startY: pointer.clientY,
        x: pointer.clientX, y: pointer.clientY,
        scrollX: scrollRef.current?.scrollLeft ?? 0, scrollY: scrollRef.current?.scrollTop ?? 0,
      };
    } else {
      pointerRef.current = null;
    }
  }

  function dragMove(event: DragMoveEvent) {
    const id = String(event.active.id);
    if (id.startsWith("resize-time:")) {
      setResizePreview({ id: id.slice("resize-time:".length), kind: "time", steps: Math.round(event.delta.y / SLOT_HEIGHT) });
    } else if (id.startsWith("resize-span:") && columnsRef.current) {
      const width = columnsRef.current.getBoundingClientRect().width / days.length;
      if (width) setResizePreview({ id: id.slice("resize-span:".length), kind: "span", steps: Math.round(event.delta.x / width) });
    }
  }

  async function dragEnd(event: DragEndEvent) {
    setResizePreview(null);
    const pointer = pointerRef.current;
    pointerRef.current = null;
    const activeId = String(event.active.id);
    const separator = activeId.indexOf(":");
    if (separator < 0) return;
    const action = activeId.slice(0, separator);
    const operation = events.find((item) => item.id === activeId.slice(separator + 1));
    if (!operation || !columnsRef.current) return;
    const width = columnsRef.current.getBoundingClientRect().width / days.length;
    if (!width) {
      toast.error("Unable to determine the time grid size.");
      return;
    }
    const delta = pointer ? {
      x: pointer.x - pointer.startX + (scrollRef.current?.scrollLeft ?? 0) - pointer.scrollX,
      y: pointer.y - pointer.startY + (scrollRef.current?.scrollTop ?? 0) - pointer.scrollY,
    } : event.delta;
    const dayShift = Math.round(delta.x / width);
    const stepShift = Math.round(delta.y / SLOT_HEIGHT);
    try {
      let updated: CalendarEvent;
      if (action === "move-time" && !operation.allDay) {
        if (!dayShift && !stepShift) return;
        const source = days.indexOf(toDayKey(new Date(operation.start), zone));
        if (source < 0 || source + dayShift < 0 || source + dayShift >= days.length) {
          throw new RangeError("Drop the operation within a visible day.");
        }
        updated = moveTimed(operation, dayShift, stepShift, zone);
      } else if (action === "resize-time" && !operation.allDay) {
        if (!stepShift) return;
        updated = resizeTimed(operation, stepShift, zone);
      } else if (action === "move-span") {
        if (!dayShift) return;
        const segment = spanning.find((item) => item.event.id === operation.id);
        if (!segment || segment.firstColumn + dayShift < 0 || segment.firstColumn + dayShift >= days.length) {
          throw new RangeError("Drop the operation within a visible day.");
        }
        updated = moveSpanning(operation, dayShift, zone);
      } else if (action === "resize-span") {
        if (!dayShift) return;
        updated = resizeSpanning(operation, dayShift, zone);
      } else {
        throw new Error("This operation cannot be moved in the selected lane.");
      }
      if (await saveEvent(updated)) toast.success(action.startsWith("resize") ? "Operation duration updated" : "Operation moved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update operation.");
    }
  }

  function navigateSlot(event: KeyboardEvent<HTMLButtonElement>, dayIndex: number, slot: number) {
    let nextDay = dayIndex;
    let nextSlot = slot;
    if (event.key === "ArrowUp") nextSlot--;
    else if (event.key === "ArrowDown") nextSlot++;
    else if (event.key === "ArrowLeft") nextDay--;
    else if (event.key === "ArrowRight") nextDay++;
    else return;
    event.preventDefault();
    columnsRef.current?.querySelector<HTMLButtonElement>(`[data-day-index="${nextDay}"][data-slot-index="${nextSlot}"]`)?.focus();
  }

  return <DndContext sensors={sensors} onDragStart={dragStart} onDragMove={dragMove} onDragEnd={dragEnd} onDragCancel={() => { pointerRef.current = null; setResizePreview(null); }}>
    <div className="time-grid-container">
      <div className="view-intro">
        <p className="intro-kicker">{view === "day" ? "DAY" : "WEEK"} / TACTICAL</p>
        <div className="timezone-label">TIME ZONE / {zone.replaceAll("_", " ")}</div>
      </div>
      <details className="grid-help"><summary><CircleHelp size={14} aria-hidden="true" /> GRID HELP</summary><p className="grid-instructions">Select a slot to create an operation. Drag to move or drag an edge to resize. Timed operations snap to 15 minutes; all-day and multi-day operations move and resize by day. Use arrows between slots. To move or resize with a keyboard, focus an operation or handle, press Space, use arrows, then press Space to drop or Escape to cancel.</p></details>
      <div ref={scrollRef} className="time-grid-scroll">
        <div className={`time-grid-inner ${view === "day" ? "single-day" : ""}`}>
          <div className="time-day-headers" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => <button key={day} className={`time-day-header ${day === today ? "today" : ""} ${day === date ? "selected" : ""}`} onClick={() => setDate(day)} aria-pressed={day === date}>
              <span>{format(atNoon(day, zone), "EEE", { in: tz(zone) }).toUpperCase()}</span>
              <strong>{format(atNoon(day, zone), "dd MMM", { in: tz(zone) }).toUpperCase()}</strong>
            </button>)}
          </div>
          <div className="span-label">ALL DAY / MULTI-DAY <span>DRAG TO MOVE OR RESIZE</span></div>
          <div className="span-lane" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${laneRows}, ${LANE_HEIGHT}px)` }}>
            {spanning.map((item) => {
              const endDay = item.event.allDay ? shiftDay(item.event.endDate, -1, zone) : toDayKey(new Date(Date.parse(item.event.end) - 1), zone);
              const canResize = endDay <= days[days.length - 1];
              return <SpanningCard key={item.event.id} item={item} dayCount={days.length} localZone={localZone} disabled={!storageAvailable} canResize={canResize} previewSteps={resizePreview?.kind === "span" && resizePreview.id === item.event.id ? resizePreview.steps : 0} openEditor={openEditor} />;
            })}
            {!spanning.length && <span className="span-empty">NO OPERATIONS</span>}
          </div>
          <div ref={columnsRef} className="time-columns" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, height: maxSlots * SLOT_HEIGHT }}>
            {days.map((day, index) => {
              const { start, end } = bounds[index];
              const slots = Math.ceil((end - start) / SNAP_MS);
              const dayItems = layoutDay(timedEvents, day, zone);
              return <div key={day} className="time-day-column" style={{ height: slots * SLOT_HEIGHT }}>
                {Array.from({ length: slots }, (_, slot) => {
                  const instant = start + slot * SNAP_MS;
                  const label = dualTime(new Date(instant).toISOString(), localZone);
                  return <button key={instant} className={`time-slot ${slot % 4 === 0 ? "hour-slot" : ""}`} style={{ height: SLOT_HEIGHT }} data-day-index={index} data-slot-index={slot} tabIndex={slot === 0 ? 0 : -1} onKeyDown={(event) => navigateSlot(event, index, slot)} aria-label={`New operation at ${label}`} onClick={() => { setDate(day); openSlot(new Date(instant).toISOString(), new Date(instant + 60 * 60_000).toISOString()); }}>
                    {slot % 4 === 0 && <span aria-hidden="true">{formatInTimeZone(instant, localZone, "HH:mm")} L | {formatInTimeZone(instant, "UTC", "HH:mm")} Z</span>}
                  </button>;
                })}
                <div className="time-events-layer">
                  {dayItems.map((item) => <TimedCard key={item.event.id} item={item} dayStart={start} localZone={localZone} disabled={!storageAvailable} previewSteps={resizePreview?.kind === "time" && resizePreview.id === item.event.id ? resizePreview.steps : 0} openEditor={openEditor} />)}
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  </DndContext>;
}

function TimedCard({ item, dayStart, localZone, disabled, previewSteps, openEditor }: {
  item: PositionedEvent; dayStart: number; localZone: string; disabled: boolean; previewSteps: number; openEditor: (id: string) => void;
}) {
  const { event, start, end, column, columns } = item;
  const move = useDraggable({ id: `move-time:${event.id}`, disabled });
  const resize = useDraggable({ id: `resize-time:${event.id}`, disabled });
  const dayWidth = move.node.current?.parentElement?.parentElement?.getBoundingClientRect().width ?? 0;
  const x = move.transform && dayWidth ? Math.round(move.transform.x / dayWidth) * dayWidth : 0;
  const y = move.transform ? Math.round(move.transform.y / SLOT_HEIGHT) * SLOT_HEIGHT : 0;
  const height = Math.max(2, (end - start) / SNAP_MS * SLOT_HEIGHT + previewSteps * SLOT_HEIGHT);
  const style: CSSProperties = {
    top: (start - dayStart) / SNAP_MS * SLOT_HEIGHT,
    height,
    left: `${column / columns * 100}%`,
    width: `${100 / columns}%`,
    transform: `translate(${x}px, ${y}px)`,
    zIndex: move.isDragging || resize.isDragging ? 10 : 1,
  };
  return <div ref={move.setNodeRef} className={`timed-operation ${move.isDragging || resize.isDragging ? "drag-active" : ""}`} style={style}>
    <button className="timed-operation-main" {...move.listeners} {...move.attributes} onClick={() => openEditor(event.id)} aria-label={`${event.title}, ${event.classification}, ${event.status}, ${dualTime(event.start, localZone)}. Press space and arrows to move.`}>
      <CompetitionLogo competition={event.competition} />
      <span className={`event-dot status-${event.status}`} /><span className="timed-operation-copy"><strong>{event.title}</strong><small>{dualTime(event.start, localZone)}</small></span>
    </button>
    <button ref={resize.setNodeRef} className="time-resize-handle" {...resize.listeners} {...resize.attributes} aria-label={`Resize ${event.title}. Press space and up or down arrows to change duration by 15 minutes.`} title="Drag to resize by 15 minutes" />
  </div>;
}

function SpanningCard({ item, dayCount, localZone, disabled, canResize, previewSteps, openEditor }: { item: SpanningEvent; dayCount: number; localZone: string; disabled: boolean; canResize: boolean; previewSteps: number; openEditor: (id: string) => void }) {
  const { event } = item;
  const move = useDraggable({ id: `move-span:${event.id}`, disabled });
  const resize = useDraggable({ id: `resize-span:${event.id}`, disabled: disabled || !canResize });
  const lane = move.node.current?.parentElement;
  const width = lane ? lane.getBoundingClientRect().width / dayCount : 0;
  const x = move.transform && width ? Math.round(move.transform.x / width) * width : 0;
  const visibleSpan = Math.max(1, Math.min(dayCount - item.firstColumn, item.span + previewSteps));
  const timing = event.allDay ? `All day, ${event.startDate} through ${event.endDate} exclusive` : `Start ${dualTime(event.start, localZone)}; end ${dualTime(event.end, localZone)}`;
  return <div ref={move.setNodeRef} className={`spanning-operation ${move.isDragging || resize.isDragging ? "drag-active" : ""}`} style={{ gridColumn: `${item.firstColumn + 1} / span ${visibleSpan}`, gridRow: item.row + 1, transform: `translateX(${x}px)` }}>
    <button className="spanning-operation-main" {...move.listeners} {...move.attributes} onClick={() => openEditor(event.id)} title={timing} aria-label={`${event.title}, ${event.classification}, ${event.status}, ${timing}. Press space and left or right arrows to move by day.`}><CompetitionLogo competition={event.competition} /><span className={`event-dot status-${event.status}`} /><span>{event.title}</span><small>{event.classification}</small></button>
    <button ref={resize.setNodeRef} className="span-resize-handle" {...resize.listeners} {...resize.attributes} disabled={disabled || !canResize} aria-label={`Resize ${event.title}. Press space and left or right arrows to change duration by day.`} title={canResize ? "Drag right edge to resize by day" : "Navigate to the operation's end to resize"} />
  </div>;
}
