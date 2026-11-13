import { useEffect, useState } from "react";
import type { EditStatus } from "./api.ts";

const PHASE_LABEL = {
  preparing: "Preparando",
  generating: "Gerando a imagem",
  composing: "Montando o Still",
} as const;

/** The running edit's step and elapsed time, ticking every second. */
export function EditProgress({
  status,
  opening = false,
}: {
  status: EditStatus | undefined;
  /** The job is done and the editor is loading the new version. */
  opening?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const startedAt = status?.startedAt ? Date.parse(status.startedAt) : now;
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <p className="text-meta tnum">
      {/* Announced on a step change only; the ticking time stays out of it. */}
      <span aria-live="polite">
        {opening
          ? "Abrindo a nova versão"
          : PHASE_LABEL[status?.phase ?? "preparing"]}
      </span>{" "}
      · {elapsed}
    </p>
  );
}
