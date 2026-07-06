import { Loader2, UserCircle2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToolCaller } from "@/hooks/use-tool.ts";

const ORG = "deco-sites";

interface GhRepo {
  name: string;
  full_name: string;
  homepage: string | null;
}

interface GhUser {
  login: string;
  avatar_url: string;
}

function useRepoSearch(query: string) {
  const [results, setResults] = useState<GhRepo[]>([]);
  const [searching, setSearching] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      setRateLimited(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      setRateLimited(false);
      try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+org:${ORG}&sort=updated&per_page=8`;
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (res.status === 403 || res.status === 429) {
          setRateLimited(true);
          return;
        }
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
        // ignore network errors
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { results, searching, rateLimited };
}

function useUserSearch(query: string) {
  const [results, setResults] = useState<GhUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      setRateLimited(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      setRateLimited(false);
      try {
        const url = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=8`;
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (res.status === 403 || res.status === 429) {
          setRateLimited(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { items?: GhUser[] };
        setResults(
          (json.items ?? []).map((u: GhUser) => ({
            login: u.login,
            avatar_url: u.avatar_url,
          })),
        );
      } catch {
        // ignore network errors
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { results, searching, rateLimited };
}

export function RegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const callTool = useToolCaller();

  // repo field
  const [repoName, setRepoName] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [repoActiveIndex, setRepoActiveIndex] = useState(-1);
  const repoDropdownRef = useRef<HTMLDivElement>(null);
  const repoInputRef = useRef<HTMLInputElement>(null);
  const {
    results: repoResults,
    searching: repoSearching,
    rateLimited: repoRateLimited,
  } = useRepoSearch(repoName);

  // assignee field
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeLogin, setAssigneeLogin] = useState<string | null>(null);
  const [assigneeAvatarUrl, setAssigneeAvatarUrl] = useState<string | null>(
    null,
  );
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userActiveIndex, setUserActiveIndex] = useState(-1);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const {
    results: userResults,
    searching: userSearching,
    rateLimited: userRateLimited,
  } = useUserSearch(assigneeQuery);

  // other form fields
  const [prodUrl, setProdUrl] = useState("");
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [startNow, setStartNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceRepo = repoName.trim()
    ? repoName.includes("/")
      ? repoName.trim()
      : `${ORG}/${repoName.trim()}`
    : "";

  // close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!repoDropdownRef.current?.contains(e.target as Node)) {
        setShowRepoDropdown(false);
        setRepoActiveIndex(-1);
      }
      if (!userDropdownRef.current?.contains(e.target as Node)) {
        setShowUserDropdown(false);
        setUserActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Escape closes modal (only when no dropdown is open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showRepoDropdown && !showUserDropdown) {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showRepoDropdown, showUserDropdown]);

  // reset active indices when results change
  useEffect(() => {
    setRepoActiveIndex(-1);
  }, [repoResults]);
  useEffect(() => {
    setUserActiveIndex(-1);
  }, [userResults]);

  const pickRepo = (repo: GhRepo) => {
    setRepoName(repo.name);
    setShowRepoDropdown(false);
    setRepoActiveIndex(-1);
    if (repo.homepage && !prodUrl) {
      const url = repo.homepage.startsWith("http")
        ? repo.homepage
        : `https://${repo.homepage}`;
      setProdUrl(url);
    }
    repoInputRef.current?.focus();
  };

  const pickUser = (user: GhUser) => {
    setAssigneeLogin(user.login);
    setAssigneeAvatarUrl(user.avatar_url);
    setAssigneeQuery("");
    setShowUserDropdown(false);
    setUserActiveIndex(-1);
  };

  const clearAssignee = () => {
    setAssigneeLogin(null);
    setAssigneeAvatarUrl(null);
    setAssigneeQuery("");
  };

  const handleRepoKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setShowRepoDropdown(false);
      setRepoActiveIndex(-1);
      return;
    }
    if (!showRepoDropdown || repoResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setRepoActiveIndex((i) => (i + 1) % repoResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setRepoActiveIndex((i) => (i <= 0 ? repoResults.length - 1 : i - 1));
    } else if (e.key === "Enter" && repoActiveIndex >= 0) {
      e.preventDefault();
      pickRepo(repoResults[repoActiveIndex]);
    }
  };

  const handleUserKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setShowUserDropdown(false);
      setUserActiveIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (userActiveIndex >= 0 && userResults[userActiveIndex]) {
        pickUser(userResults[userActiveIndex]);
      } else if (assigneeQuery.trim()) {
        // fallback: use the typed login directly (no avatar)
        setAssigneeLogin(assigneeQuery.trim());
        setAssigneeAvatarUrl(null);
        setAssigneeQuery("");
        setShowUserDropdown(false);
        setUserActiveIndex(-1);
      }
      return;
    }
    if (!showUserDropdown || userResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setUserActiveIndex((i) => (i + 1) % userResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setUserActiveIndex((i) => (i <= 0 ? userResults.length - 1 : i - 1));
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
      const result = await callTool<{ siteId: string }>("SITE_REGISTER", {
        sourceRepo,
        prodUrl: prodUrl.trim(),
        alreadyDone,
        startNow: alreadyDone ? false : startNow,
      });
      if (assigneeLogin && result?.siteId) {
        await callTool("SITE_ASSIGN", {
          siteId: result.siteId,
          login: assigneeLogin,
          avatarUrl: assigneeAvatarUrl,
        });
      }
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
          {/* repo */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Repo de origem (Fresh/Deno)</span>
            <div className="relative" ref={repoDropdownRef}>
              <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="flex items-center bg-muted px-2.5 text-xs text-muted-foreground select-none">
                  deco-sites/
                </span>
                <input
                  ref={repoInputRef}
                  value={repoName}
                  onChange={(e) => {
                    setRepoName(e.target.value);
                    setShowRepoDropdown(true);
                  }}
                  onFocus={() => setShowRepoDropdown(true)}
                  onKeyDown={handleRepoKeyDown}
                  placeholder="granadobr"
                  aria-autocomplete="list"
                  aria-expanded={showRepoDropdown && repoResults.length > 0}
                  aria-activedescendant={
                    repoActiveIndex >= 0
                      ? `repo-option-${repoActiveIndex}`
                      : undefined
                  }
                  className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                  autoFocus
                />
                {repoSearching && (
                  <span className="flex items-center pr-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </span>
                )}
              </div>

              {showRepoDropdown &&
                repoName.trim() &&
                !repoSearching &&
                (repoResults.length > 0 || repoRateLimited) && (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                  >
                    {repoRateLimited ? (
                      <li className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                        GitHub rate limit — use o nome exato no campo acima
                      </li>
                    ) : (
                      repoResults.map((r, idx) => (
                        <li
                          key={r.name}
                          role="option"
                          aria-selected={idx === repoActiveIndex}
                          id={`repo-option-${idx}`}
                        >
                          <button
                            type="button"
                            onMouseDown={() => pickRepo(r)}
                            className={`flex w-full flex-col px-3 py-2 text-left hover:bg-muted ${
                              idx === repoActiveIndex ? "bg-muted" : ""
                            }`}
                          >
                            <span className="text-xs font-medium">
                              {r.name}
                            </span>
                            {r.homepage && (
                              <span className="truncate text-[10px] text-muted-foreground">
                                {r.homepage}
                              </span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
            </div>
          </label>

          {/* prod URL */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">URL de produção</span>
            <input
              value={prodUrl}
              onChange={(e) => setProdUrl(e.target.value)}
              placeholder="https://www.granado.com.br"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {/* assignee */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Responsável (opcional)</span>
            {assigneeLogin ? (
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                {assigneeAvatarUrl ? (
                  <img
                    src={assigneeAvatarUrl}
                    alt={assigneeLogin}
                    className="h-5 w-5 rounded-full"
                  />
                ) : (
                  <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="flex-1 text-sm">@{assigneeLogin}</span>
                <button
                  type="button"
                  onClick={clearAssignee}
                  className="text-muted-foreground hover:text-foreground"
                  title="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative" ref={userDropdownRef}>
                <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <span className="flex items-center pl-2.5">
                    <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <input
                    value={assigneeQuery}
                    onChange={(e) => {
                      setAssigneeQuery(e.target.value);
                      setShowUserDropdown(true);
                    }}
                    onFocus={() => {
                      if (assigneeQuery.trim()) setShowUserDropdown(true);
                    }}
                    onKeyDown={handleUserKeyDown}
                    placeholder="Buscar por login ou nome…"
                    aria-autocomplete="list"
                    aria-expanded={showUserDropdown && userResults.length > 0}
                    aria-activedescendant={
                      userActiveIndex >= 0
                        ? `user-option-${userActiveIndex}`
                        : undefined
                    }
                    className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                  {userSearching && (
                    <span className="flex items-center pr-2">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </span>
                  )}
                </div>

                {showUserDropdown && assigneeQuery.trim() && !userSearching && (
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                  >
                    {userRateLimited ? (
                      <>
                        <li className="px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                          GitHub rate limit — pressione Enter para usar como
                          está
                        </li>
                        <li>
                          <button
                            type="button"
                            onMouseDown={() => {
                              setAssigneeLogin(assigneeQuery.trim());
                              setAssigneeAvatarUrl(null);
                              setAssigneeQuery("");
                              setShowUserDropdown(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                          >
                            <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                            <span className="text-xs font-medium">
                              @{assigneeQuery.trim()}
                            </span>
                          </button>
                        </li>
                      </>
                    ) : userResults.length === 0 ? (
                      <li>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setAssigneeLogin(assigneeQuery.trim());
                            setAssigneeAvatarUrl(null);
                            setAssigneeQuery("");
                            setShowUserDropdown(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                        >
                          <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                          <span className="text-xs font-medium">
                            @{assigneeQuery.trim()}
                          </span>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            usar assim
                          </span>
                        </button>
                      </li>
                    ) : (
                      userResults.map((u, idx) => (
                        <li
                          key={u.login}
                          role="option"
                          aria-selected={idx === userActiveIndex}
                          id={`user-option-${idx}`}
                        >
                          <button
                            type="button"
                            onMouseDown={() => pickUser(u)}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted ${
                              idx === userActiveIndex ? "bg-muted" : ""
                            }`}
                          >
                            <img
                              src={u.avatar_url}
                              alt={u.login}
                              className="h-5 w-5 rounded-full"
                            />
                            <span className="text-xs font-medium">
                              {u.login}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* checkboxes */}
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
