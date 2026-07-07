import { Loader2, UserCircle2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

interface CatalogSite {
  name: string;
  repo: string | null;
  prodUrl: string | null;
  thumbUrl: string | null;
}

/** Unified repo suggestion (catalog or GitHub) shown in the repo dropdown. */
interface RepoSuggestion {
  name: string;
  repo: string;
  prodUrl: string | null;
  thumbUrl: string | null;
  source: "catalog" | "github";
}

type CallTool = ReturnType<typeof useToolCaller>;

/** Search the decocms site catalog via the MCP tool (our own DB — no rate limit). */
function useCatalogSearch(query: string, callTool: CallTool) {
  const [results, setResults] = useState<CatalogSite[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
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
        const r = await callTool<{
          configured: boolean;
          sites: CatalogSite[];
        }>("SITE_CATALOG_SEARCH", { query: query.trim() });
        setConfigured(!!r?.configured);
        setResults(r?.sites ?? []);
      } catch {
        // ignore — GitHub fallback still works
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, callTool]);

  return { results, configured, searching };
}

function useRepoSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<GhRepo[]>([]);
  const [searching, setSearching] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || !enabled) {
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
  }, [query, enabled]);

  return { results, searching, rateLimited };
}

// Cache GitHub user-search results per query across the modal's lifetime so
// re-typing the same prefix never re-hits the (10/min unauthenticated) API.
const userSearchCache = new Map<string, GhUser[]>();

function useUserSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<GhUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    // need ≥2 chars — 1-char queries burn the tiny search quota for nothing
    if (q.length < 2 || !enabled) {
      setResults([]);
      setRateLimited(false);
      return;
    }
    const cached = userSearchCache.get(q.toLowerCase());
    if (cached) {
      setResults(cached);
      setRateLimited(false);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    // hard timeout so a hung request never leaves the dropdown stuck on "searching"
    const timeout = setTimeout(() => controller.abort(), 8000);

    timerRef.current = setTimeout(async () => {
      setSearching(true);
      setRateLimited(false);
      try {
        const url = `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=8`;
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (res.status === 403 || res.status === 429) {
          setRateLimited(true);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as { items?: GhUser[] };
        const mapped = (json.items ?? []).map((u: GhUser) => ({
          login: u.login,
          avatar_url: u.avatar_url,
        }));
        userSearchCache.set(q.toLowerCase(), mapped);
        setResults(mapped);
      } catch {
        // aborted / network error — leave prior results, fallback handles it
      } finally {
        clearTimeout(timeout);
        setSearching(false);
      }
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, enabled]);

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

  // catalog first (our DB — no rate limit); GitHub only when catalog is off
  const {
    results: catalogResults,
    configured: catalogConfigured,
    searching: catalogSearching,
  } = useCatalogSearch(repoName, callTool);
  const {
    results: githubRepoResults,
    searching: githubSearching,
    rateLimited: repoRateLimited,
  } = useRepoSearch(repoName, catalogConfigured === false);

  const repoSearching = catalogSearching || githubSearching;

  // unified suggestions: catalog (repo + prod URL + thumb) preferred over GitHub
  const repoResults = useMemo<RepoSuggestion[]>(() => {
    if (catalogResults.length > 0) {
      return catalogResults
        .filter((c) => c.repo)
        .map((c) => ({
          name: c.name,
          repo: c.repo as string,
          prodUrl: c.prodUrl,
          thumbUrl: c.thumbUrl,
          source: "catalog" as const,
        }));
    }
    return githubRepoResults.map((g) => ({
      name: g.name,
      repo: g.full_name,
      prodUrl: g.homepage
        ? g.homepage.startsWith("http")
          ? g.homepage
          : `https://${g.homepage}`
        : null,
      thumbUrl: null,
      source: "github" as const,
    }));
  }, [catalogResults, githubRepoResults]);

  // assignee field
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneeLogin, setAssigneeLogin] = useState<string | null>(null);
  const [assigneeAvatarUrl, setAssigneeAvatarUrl] = useState<string | null>(
    null,
  );
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userActiveIndex, setUserActiveIndex] = useState(-1);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // cached team (rate-limit-free) — people already assigned across this connection
  const [team, setTeam] = useState<GhUser[]>([]);
  useEffect(() => {
    let cancelled = false;
    callTool<{ assignees: Array<{ login: string; avatarUrl: string | null }> }>(
      "ASSIGNEE_LIST",
      {},
    )
      .then((r) => {
        if (cancelled) return;
        setTeam(
          (r?.assignees ?? []).map((a) => ({
            login: a.login,
            avatar_url: a.avatarUrl ?? "",
          })),
        );
      })
      .catch(() => {
        /* ignore — GitHub search still works */
      });
    return () => {
      cancelled = true;
    };
  }, [callTool]);

  const q = assigneeQuery.trim().toLowerCase();
  const localMatches = useMemo(
    () => (q ? team.filter((u) => u.login.toLowerCase().includes(q)) : team),
    [team, q],
  );

  // Always search GitHub for ≥2 chars (cached + debounced) so new people always
  // show up; the cached team just gets merged in first.
  const {
    results: githubResults,
    searching: userSearching,
    rateLimited: userRateLimited,
  } = useUserSearch(assigneeQuery, true);

  // merged suggestions: cached team first, then GitHub results (deduped by login)
  const userResults = useMemo(() => {
    const seen = new Set(localMatches.map((u) => u.login.toLowerCase()));
    const merged = [...localMatches];
    for (const u of githubResults) {
      if (!seen.has(u.login.toLowerCase())) {
        seen.add(u.login.toLowerCase());
        merged.push(u);
      }
    }
    return merged.slice(0, 8);
  }, [localMatches, githubResults]);

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

  const pickRepo = (s: RepoSuggestion) => {
    // display the slug under the fixed "deco-sites/" prefix; keep the full
    // owner/repo when it's a different org (sourceRepo stays correct)
    const slug = s.repo.startsWith(`${ORG}/`)
      ? s.repo.slice(ORG.length + 1)
      : s.repo;
    setRepoName(slug);
    setShowRepoDropdown(false);
    setRepoActiveIndex(-1);
    if (s.prodUrl && !prodUrl) setProdUrl(s.prodUrl);
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
                          key={`${r.repo}-${idx}`}
                          role="option"
                          aria-selected={idx === repoActiveIndex}
                          id={`repo-option-${idx}`}
                        >
                          <button
                            type="button"
                            onMouseDown={() => pickRepo(r)}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted ${
                              idx === repoActiveIndex ? "bg-muted" : ""
                            }`}
                          >
                            {r.thumbUrl ? (
                              <img
                                src={r.thumbUrl}
                                alt=""
                                className="h-7 w-7 shrink-0 rounded object-cover"
                              />
                            ) : null}
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-xs font-medium">
                                {r.name}
                              </span>
                              <span className="truncate text-[10px] text-muted-foreground">
                                {r.prodUrl ?? r.repo}
                              </span>
                            </span>
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
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.login}
                                className="h-5 w-5 rounded-full"
                              />
                            ) : (
                              <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                            )}
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
