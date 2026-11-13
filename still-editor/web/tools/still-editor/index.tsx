import { Alert, AlertDescription } from "@decocms/ui/components/alert.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@decocms/ui/components/alert-dialog.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import { Button, buttonVariants } from "@decocms/ui/components/button.tsx";
import { IconButton } from "@decocms/ui/components/icon-button.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@decocms/ui/components/select.tsx";
import { toast } from "@decocms/ui/components/sonner.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { Textarea } from "@decocms/ui/components/textarea.tsx";
import { cn } from "@decocms/ui/lib/utils.ts";
import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Link01, Trash01 } from "@untitledui/icons";
import { useState } from "react";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { EditProgress } from "./edit-progress.tsx";
import appIcon from "../../../icon.svg";
import {
  callTool,
  describeError,
  describeProblem,
  type EditStatus,
  type Loaded,
  modelName,
  type Publication,
  type Version,
} from "./api.ts";

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const firstName = (author: { name: string | null; email: string }) =>
  author.name?.split(" ")[0] ?? author.email.split("@")[0];

export default function StillEditorPage() {
  const app = useMcpApp();
  const { toolInput } = useMcpState<{ link?: string }>();
  const search = useSearch({ strict: false }) as { link?: string };
  const navigate = useNavigate();
  const link = search.link ?? toolInput?.link ?? null;

  const open = (next: string | null) =>
    navigate({ to: "/", search: next ? { link: next } : {} });

  if (!app) return null;
  if (!link) return <OpenPiece onOpen={open} />;
  return <Editor app={app} link={link} onChangePiece={() => open(null)} />;
}

function OpenPiece({ onOpen }: { onOpen: (link: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form
        className="flex w-full max-w-xl flex-col items-center gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onOpen(value.trim());
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <img src={appIcon} alt="" className="size-14" />
          <h1 className="font-display text-2xl text-foreground">
            Editar Still
          </h1>
        </div>
        <div className="relative w-full">
          <Link01 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Cole o link da peça na loja"
            aria-label="Link da peça na loja"
            className="h-11 pr-20 pl-10"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!value.trim()}
            className="absolute top-1/2 right-2 -translate-y-1/2"
          >
            Abrir
          </Button>
        </div>
      </form>
    </div>
  );
}

function Editor({
  app,
  link,
  onChangePiece,
}: {
  app: App;
  link: string;
  onChangePiece: () => void;
}) {
  const queryClient = useQueryClient();
  const loaded = useQuery({
    queryKey: ["still_load", link],
    queryFn: () => callTool<Loaded>(app, "still_load", { link }),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"piece" | "outfit">("piece");
  const [showBefore, setShowBefore] = useState(false);

  if (loaded.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="sm" label="Carregando a peça" />
      </div>
    );
  }
  if (loaded.isError) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        <Alert variant="destructive">
          <AlertDescription>{describeError(loaded.error)}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="self-start"
          onClick={onChangePiece}
        >
          Abrir outra peça
        </Button>
      </div>
    );
  }

  const data = loaded.data;
  const selected = data.versions.find((version) => version.id === selectedId);
  const select = (id: string | null) => {
    setSelectedId(id);
    setShowBefore(false);
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["still_load", link] });
  const before = showBefore ? (selected?.beforeUrl ?? null) : null;
  const shownUrl =
    before ?? selected?.imageUrl ?? data.piece.still?.url ?? null;
  const canShowOutfit = Boolean(data.pair?.still?.url && shownUrl);
  const isBottom = data.piece.type === "bottom";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-display text-xl text-foreground">
            {data.piece.name}
          </h1>
          <p className="text-meta">
            {isBottom ? "Calcinha" : "Top"} · {data.piece.variantCount}{" "}
            variantes
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangePiece}>
          Trocar peça
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface flex flex-col gap-4 p-5">
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              {canShowOutfit && (
                <div className="flex gap-1">
                  <Button
                    variant="tab"
                    size="sm"
                    aria-pressed={view === "piece"}
                    onClick={() => setView("piece")}
                  >
                    Peça
                  </Button>
                  <Button
                    variant="tab"
                    size="sm"
                    aria-pressed={view === "outfit"}
                    onClick={() => setView("outfit")}
                  >
                    Conjunto
                  </Button>
                </div>
              )}
              {selected?.beforeUrl && (
                <div className="flex gap-1">
                  <Button
                    variant="tab"
                    size="sm"
                    aria-pressed={!showBefore}
                    onClick={() => setShowBefore(false)}
                  >
                    Depois
                  </Button>
                  <Button
                    variant="tab"
                    size="sm"
                    aria-pressed={showBefore}
                    onClick={() => setShowBefore(true)}
                  >
                    Antes
                  </Button>
                </div>
              )}
            </div>
            {selected && (
              <PublishButton
                app={app}
                data={data}
                version={selected}
                onDone={() => {
                  select(null);
                  refresh();
                }}
              />
            )}
          </div>

          {selected && !selected.check.ok && (
            // The variant's foreground is meant for a solid warning fill and
            // disappears on its own tint.
            <Alert
              variant="warning"
              className="text-foreground *:data-[slot=alert-description]:text-foreground [&>svg]:text-warning"
            >
              <AlertTriangle />
              <AlertDescription>
                Fora do padrão do Still:{" "}
                {selected.check.problems.map(describeProblem).join(" ")}
              </AlertDescription>
            </Alert>
          )}

          {view === "outfit" && canShowOutfit ? (
            <Outfit
              top={isBottom ? data.pair?.still?.url : shownUrl}
              bottom={isBottom ? shownUrl : data.pair?.still?.url}
            />
          ) : (
            <StillTile url={shownUrl} />
          )}
        </section>

        <div className="flex flex-col gap-6">
          <Composer
            app={app}
            data={data}
            parent={selected ?? null}
            onDone={(version) => {
              refresh();
              select(version.id);
            }}
          />
          <HistoryPanel
            versions={
              data.versions.length > 0 && (
                <Versions
                  app={app}
                  data={data}
                  selectedId={selectedId}
                  onSelect={select}
                  onDeleted={() => {
                    select(null);
                    refresh();
                  }}
                />
              )
            }
            publications={
              data.publications.length > 0 && (
                <History app={app} data={data} onDone={refresh} />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

/** Sized so the toolbar, a warning and the whole Still fit the viewport. */
function StillTile({ url }: { url: string | null }) {
  return (
    <div className="surface-inset relative mx-auto aspect-[4/5] w-full max-w-[calc((100dvh-18rem)*0.8)] min-w-64 overflow-hidden">
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
          Sem Still na loja
        </div>
      )}
    </div>
  );
}

/** Top over bottom, each in a square crop of its 4×5 Still, as Mix & Match
 *  shows a pair. */
function Outfit({
  top,
  bottom,
}: {
  top: string | null | undefined;
  bottom: string | null | undefined;
}) {
  const tile = (url: string | null | undefined) => (
    <div className="surface-inset relative mx-auto aspect-square w-full max-w-[calc((100dvh-18rem)/2)] min-w-48 overflow-hidden">
      {url && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {tile(top)}
      {tile(bottom)}
    </div>
  );
}

function PublishButton({
  app,
  data,
  version,
  onDone,
}: {
  app: App;
  data: Loaded;
  version: Version;
  onDone: () => void;
}) {
  const publish = useMutation({
    mutationFn: () =>
      callTool<Publication>(app, "still_publish", {
        productId: data.piece.productId,
        versionId: version.id,
        expectedStillId: data.piece.still?.imageId ?? null,
      }),
    onSuccess: (publication) => {
      if (publication.status === "published") {
        toast.success(`Publicado em ${publication.variants.length} variantes`);
      } else {
        toast.error(`Nada mudou na loja: ${publication.error}`);
      }
      onDone();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={!version.check.ok || publish.isPending}>
          {publish.isPending && <Spinner size="2xs" />}
          Publicar na loja
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publicar este Still?</AlertDialogTitle>
          <AlertDialogDescription>
            Ele substitui o Still atual nas {data.piece.variantCount} variantes
            de {data.piece.name}. O atual fica no histórico e pode ser
            restaurado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => publish.mutate()}>
            Publicar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Composer({
  app,
  data,
  parent,
  onDone,
}: {
  app: App;
  data: Loaded;
  parent: Version | null;
  onDone: (version: Version) => void;
}) {
  const [request, setRequest] = useState("");
  const [model, setModel] = useState(data.defaultModel);
  const [failure, setFailure] = useState<string | null>(null);
  // The running edit lives in the route, which Studio keeps in its URL and
  // hands back when it reloads the app, so the edit is still followed.
  const search = useSearch({ strict: false }) as {
    link?: string;
    job?: string;
  };
  const navigate = useNavigate();
  const jobId = search.job ?? null;
  const setJobId = (job: string | null) =>
    navigate({
      to: "/",
      search: {
        ...(search.link ? { link: search.link } : {}),
        ...(job ? { job } : {}),
      },
      replace: true,
    });

  const start = useMutation({
    mutationFn: () =>
      callTool<{ jobId: string }>(app, "still_edit_start", {
        productId: data.piece.productId,
        parentId: parent?.id ?? null,
        request,
        model,
      }),
    onMutate: () => setFailure(null),
    onSuccess: ({ jobId }) => setJobId(jobId),
    onError: (error) => setFailure(describeError(error)),
  });

  const status = useQuery({
    queryKey: ["still_edit_status", jobId],
    enabled: jobId !== null,
    refetchInterval: 3000,
    queryFn: async () => {
      const status = await callTool<EditStatus>(app, "still_edit_status", {
        jobId,
      });
      if (status.status === "done" && status.version) {
        setJobId(null);
        setRequest("");
        onDone(status.version);
      } else if (status.status === "failed") {
        setJobId(null);
        setFailure(describeError(status.error));
      }
      return status;
    },
  });

  const running = start.isPending || jobId !== null;
  const base = parent
    ? "Edita a versão selecionada"
    : data.hasSource
      ? "Edita a geração original"
      : "Edita o Still atual";

  return (
    <form
      className="surface flex flex-col gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (request.trim().length >= 3 && !running) start.mutate();
      }}
    >
      <label htmlFor="request" className="text-sm font-medium text-foreground">
        O que mudar?
      </label>
      <Textarea
        id="request"
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder="Ex.: alça mais fina, sem o regulador dourado"
        className="max-h-40 overflow-y-auto"
        disabled={running}
      />
      {running ? (
        <EditProgress status={status.data} />
      ) : (
        <p className="text-meta">{base}</p>
      )}
      <div className="flex gap-2">
        <Select value={model} onValueChange={setModel} disabled={running}>
          <SelectTrigger className="min-w-0 flex-1" aria-label="Modelo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.models.map((id) => (
              <SelectItem key={id} value={id}>
                {modelName(id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          variant="special"
          disabled={running || request.trim().length < 3}
        >
          {running && <Spinner size="2xs" />}
          {running ? "Gerando" : "Gerar"}
        </Button>
      </div>
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/** The store's Still, then every version, newest first. The selected row
 *  opens to what the edit asked for, and its removal. */
/** Versions and publications in one card, so both stay in view: the card
 *  takes the column's remaining height and its list scrolls. */
function HistoryPanel({
  versions,
  publications,
}: {
  versions: React.ReactNode;
  publications: React.ReactNode;
}) {
  const [tab, setTab] = useState<"versions" | "publications">("versions");
  if (!versions && !publications) return null;
  const shown =
    tab === "publications" && publications
      ? "publications"
      : versions
        ? "versions"
        : "publications";
  return (
    <section className="surface flex min-h-0 flex-col overflow-hidden lg:max-h-[calc(100dvh-26rem)]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        {versions && (
          <Button
            variant="tab"
            size="sm"
            aria-pressed={shown === "versions"}
            onClick={() => setTab("versions")}
          >
            Versões
          </Button>
        )}
        {publications && (
          <Button
            variant="tab"
            size="sm"
            aria-pressed={shown === "publications"}
            onClick={() => setTab("publications")}
          >
            Publicações
          </Button>
        )}
      </div>
      <div className="always-scrollbar min-h-0 flex-1 overflow-y-auto">
        {shown === "versions" ? versions : publications}
      </div>
    </section>
  );
}

function Versions({
  app,
  data,
  selectedId,
  onSelect,
  onDeleted,
}: {
  app: App;
  data: Loaded;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDeleted: () => void;
}) {
  return (
    <ul className="divide-y divide-border/70">
      <li>
        <VersionRow
          url={data.piece.still?.url ?? null}
          selected={selectedId === null}
          onSelect={() => onSelect(null)}
        >
          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <span className="size-1.5 rounded-full bg-brand" />
            Na loja
          </span>
        </VersionRow>
      </li>
      {data.versions.map((version) => (
        <li key={version.id}>
          <VersionRow
            url={version.imageUrl}
            selected={selectedId === version.id}
            onSelect={() => onSelect(version.id)}
          >
            <span
              className={cn(
                "text-sm text-foreground",
                selectedId !== version.id && "line-clamp-2",
              )}
            >
              {version.prompt}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-meta">{formatWhen(version.createdAt)}</span>
              {!version.check.ok && (
                <Badge variant="outline">Fora do padrão</Badge>
              )}
            </span>
          </VersionRow>
          {selectedId === version.id && (
            <VersionDetails
              app={app}
              data={data}
              version={version}
              onDeleted={onDeleted}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function VersionRow({
  url,
  selected,
  onSelect,
  children,
}: {
  url: string | null;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "focus-ring flex w-full items-start gap-3 px-5 py-3 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <span className="surface-inset relative aspect-[4/5] w-12 shrink-0 overflow-hidden">
        {url && (
          <img
            src={url}
            alt=""
            className="absolute inset-0 size-full object-contain"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        {children}
      </span>
    </button>
  );
}

/** The facts the row leaves out — model, author, what the edit started
 *  from — and the version's removal. */
function VersionDetails({
  app,
  data,
  version,
  onDeleted,
}: {
  app: App;
  data: Loaded;
  version: Version;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      callTool<{ deleted: boolean }>(app, "still_version_delete", {
        productId: data.piece.productId,
        versionId: version.id,
      }),
    onSuccess: () => {
      toast.success("Versão apagada");
      onDeleted();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const parent = data.versions.find((v) => v.id === version.parentId);
  const startedFrom =
    version.base === "original"
      ? "sobre a geração original"
      : version.base === "store"
        ? "sobre o Still da loja"
        : version.parentId
          ? parent
            ? `sobre a versão de ${formatWhen(parent.createdAt)}`
            : "sobre uma versão apagada"
          : null;
  const facts = [
    modelName(version.model),
    firstName(version.author),
    startedFrom,
  ].filter(Boolean);

  return (
    <div className="flex items-center justify-between gap-3 -mt-2 bg-accent pr-3 pb-2 pl-20">
      <p className="text-meta min-w-0">{facts.join(" · ")}</p>
      <IconButton
        label="Apagar versão"
        className="shrink-0"
        disabled={remove.isPending}
        onClick={() => setConfirming(true)}
      >
        {remove.isPending ? <Spinner size="2xs" /> : <Trash01 />}
      </IconButton>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta versão?</AlertDialogTitle>
            <AlertDialogDescription>
              A imagem e o pedido saem do histórico. A loja não muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => remove.mutate()}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function History({
  app,
  data,
  onDone,
}: {
  app: App;
  data: Loaded;
  onDone: () => void;
}) {
  const restore = useMutation({
    mutationFn: (publicationId: string) =>
      callTool<Publication>(app, "still_restore", {
        productId: data.piece.productId,
        publicationId,
        expectedStillId: data.piece.still?.imageId ?? null,
      }),
    onSuccess: (publication) => {
      if (publication.status === "published") {
        toast.success("Still anterior restaurado");
      } else {
        toast.error(`Nada mudou na loja: ${publication.error}`);
      }
      onDone();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const label = {
    publish: "Publicado",
    restore: "Restaurado",
  } as const;
  return (
    <ul className="divide-y divide-border/70">
      {data.publications.map((publication) => (
        <li
          key={publication.id}
          className="flex items-center justify-between gap-3 px-5 py-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm text-foreground">
              {publication.status === "published"
                ? label[publication.kind]
                : "Desfeito, nada mudou"}
            </p>
            <p className="text-meta">
              {formatWhen(publication.at)} · {firstName(publication.author)}
            </p>
          </div>
          {publication.status === "published" && publication.before && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={restore.isPending}
                >
                  Restaurar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Restaurar o Still anterior?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Volta o Still que esta publicação substituiu, nas{" "}
                    {data.piece.variantCount} variantes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => restore.mutate(publication.id)}
                  >
                    Restaurar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </li>
      ))}
    </ul>
  );
}
