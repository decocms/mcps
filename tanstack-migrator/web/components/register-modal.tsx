import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToolCaller } from "@/hooks/use-tool.ts";

const ORG = "deco-sites";

interface GhRepo {
  name: string;
  full_name: string;
  homepage: string | null;
}

function useRepoSearch(query: string) {
  const [results, setResults] = useState<GhRepo[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+org:${ORG}&sort=updated&per_page=8`;
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { items?: GhRepo[] };
        setResults(
          (json.items ?? []).map((r: GhRepo) => ({
            name: r.name,
            full_name: r.full_name,
            homepage: r.homepage ?? null,
          })),
        );
      } catch {
        // ignore network errors silently
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { results, searching };
}

export function RegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const callTool = useToolCaller();
  const [repoName, setRepoName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [startNow, setStartNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, searching } = useRepoSearch(repoName);

  const sourceRepo = repoName.trim()
    ? repoName.includes("/")
      ? repoName.trim()
      : `${ORG}/${repoName.trim()}`
    : "";

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset activeIndex when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  const pickRepo = (repo: GhRepo) => {
    setRepoName(repo.name);
    setShowDropdown(false);
    setActiveIndex(-1);
    if (repo.homepage && !prodUrl) {
      const url = repo.homepage.startsWith("http")
        ? repo.homepage
        : `https://${repo.homepage}`;
      setProdUrl(url);
    }
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pickRepo(results[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const submit = async () => {
    if (!sourceRepo || !prodUrl.trim()) {
      setError("Preencha o repo e a URL de produção");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await callTool("SITE_REGISTER", {
        sourceRepo,
        prodUrl: prodUrl.trim(),
        alreadyDone,
        startNow: alreadyDone ? false : startNow,
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
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center bg-muted px-2.5 text-xs text-muted-foreground select-none">
                  deco-sites/
                </span>
                <input
                  ref={inputRef}
                  value={repoName}
                  onChange={(e) => {
                    setRepoName(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="granadobr"
                  aria-autocomplete="list"
                  aria-expanded={showDropdown && results.length > 0}
                  aria-activedescendant={
                    activeIndex >= 0 ? `repo-option-${activeIndex}` : undefined
                  }
                  className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                  autoFocus
                />
                {searching && (
                  <span className="flex items-center pr-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </span>
                )}
              </div>

              {showDropdown && results.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                >
                  {results.map((r, idx) => (
                    <li
                      key={r.name}
                      role="option"
                      aria-selected={idx === activeIndex}
                      id={`repo-option-${idx}`}
                    >
                      <button
                        type="button"
                        onMouseDown={() => pickRepo(r)}
                        className={`flex w-full flex-col px-3 py-2 text-left hover:bg-muted ${
                          idx === activeIndex ? "bg-muted" : ""
                        }`}
                      >
                        <span className="text-xs font-medium">{r.name}</span>
                        {r.homepage && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {r.homepage}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
              onChange={(e) => {
                setAlreadyDone(e.target.checked);
                if (e.target.checked) setStartNow(false);
              }}
              className="h-4 w-4 rounded border-input"
            />
            <span>
              Migração já concluída (entra direto na lista 100% TanStack)
            </span>
          </label>

          {!alreadyDone && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>Iniciar migração agora (entra na fila imediatamente)</span>
            </label>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {alreadyDone
              ? "Cadastrar como concluído"
              : startNow
                ? "Entrar na fila agora"
                : "Adicionar ao backlog"}
          </button>
        </div>
      </div>
    </div>
  );
}
