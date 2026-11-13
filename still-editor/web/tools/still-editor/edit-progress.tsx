import { useEffect, useState } from "react";
import type { EditStatus } from "./api.ts";

const PHASE_LABEL = {
  preparing: "Preparando",
  generating: "Gerando a imagem",
  composing: "Montando o Still",
} as const;

/** The running edit's step and elapsed time, ticking every second. */
export function EditProgress({ status }: { status: EditStatus | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const startedAt = status?.startedAt ? Date.parse(status.startedAt) : now;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <p className="text-meta tnum" aria-live="polite">
      {PHASE_LABEL[status?.phase ?? "preparing"]} · {elapsed}
    </p>
  );
}
