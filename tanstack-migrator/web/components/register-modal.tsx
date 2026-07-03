import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { useToolCaller } from "@/hooks/use-tool.ts";

export function RegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const callTool = useToolCaller();
  const [sourceRepo, setSourceRepo] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!sourceRepo.trim() || !prodUrl.trim()) {
      setError("Preencha o repo e a URL de produção");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await callTool("SITE_REGISTER", {
        sourceRepo: sourceRepo.trim(),
        prodUrl: prodUrl.trim(),
        alreadyDone,
      });
      onRegistered();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Cadastrar site pra migrar</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Repo de origem (Fresh/Deno)</span>
            <input
              value={sourceRepo}
              onChange={(e) => setSourceRepo(e.target.value)}
              placeholder="deco-sites/granadobr"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">URL de produção</span>
            <input
              value={prodUrl}
              onChange={(e) => setProdUrl(e.target.value)}
              placeholder="https://www.granado.com.br"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alreadyDone}
              onChange={(e) => setAlreadyDone(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span>
              Migração já concluída (entra direto na lista 100% TanStack)
            </span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {alreadyDone ? "Cadastrar como concluído" : "Entrar na fila"}
          </button>
        </div>
      </div>
    </div>
  );
}
