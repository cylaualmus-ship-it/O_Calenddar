"use client";

import { useState } from "react";
import type { CompetitionDetails } from "@/types/calendar";

export function CompetitionLogo({ competition }: { competition?: CompetitionDetails }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!competition) return null;
  const { provider, logoUrl } = competition;
  return <span className="competition-logo" title={provider}>
    {logoUrl && failedUrl !== logoUrl
      ? <img src={logoUrl} alt={`${provider} logo`} width={20} height={20} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(logoUrl)} />
      : <span aria-label={`${provider} logo unavailable`}>{provider.slice(0, 2).toUpperCase()}</span>}
  </span>;
}
