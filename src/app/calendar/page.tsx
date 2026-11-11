import { CalendarApp } from "@/components/calendar/calendar-app";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ local?: string; group?: string }> }) {
  const params = await searchParams;
  const local = params.local === "1";
  return <CalendarApp key={`${local}-${params.group ?? ""}`} local={local} groupId={local ? null : params.group ?? null} />;
}
