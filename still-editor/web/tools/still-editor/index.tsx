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
import { useRef, useState } from "react";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { EditProgress } from "./edit-progress.tsx";
import appIcon from "../../../icon.svg";
import {
  BLOCK_MESSAGE,
  type Creation,
  callTool,
  describeError,
  describeProblem,
  type EditStatus,
  type Facts,
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

/** What the user came to do; the editor follows the piece when they differ
 *  (a piece with a Still is edited, one without gets a Still created). */
type Mode = "editar" | "criar";

/** The route's search: the piece, the mode, the pair chosen for a new Still
 *  ("none" for none) and the running edit or creation job. */
interface Search {
  link?: string;
  mode?: Mode;
  pair?: string;
  job?: string;
  createJob?: string;
}

const useEditorSearch = () => useSearch({ strict: false }) as Search;

export default function StillEditorPage() {
  const app = useMcpApp();
  const { toolInput } = useMcpState<{ link?: string }>();
  const search = useEditorSearch();
  const navigate = useNavigate();
  const link = search.link ?? toolInput?.link ?? null;

  const open = (next: string | null, mode?: Mode) =>
    navigate({
      to: "/",
      search: next ? { link: next, ...(mode ? { mode } : {}) } : {},
    });

  if (!app) return null;
  if (!link) return <OpenPiece onOpen={open} />;
  return (
    <Editor
      app={app}
      link={link}
      mode={search.mode ?? "editar"}
      onChangePiece={() => open(null)}
    />
  );
}

function OpenPiece({ onOpen }: { onOpen: (link: string, mode: Mode) => void }) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<Mode>("editar");
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form
        className="flex w-full max-w-xl flex-col items-center gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onOpen(value.trim(), mode);
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <img src={appIcon} alt="" className="size-14" />
          <h1 className="font-display text-2xl text-foreground">
            {mode === "criar" ? "Criar Still" : "Editar Still"}
          </h1>
          <fieldset
            aria-label="O que fazer"
            className="surface-inset flex gap-1 rounded-full p-1"
          >
            <Button
              type="button"
              variant="tab"
              size="sm"
              aria-pressed={mode === "editar"}
              onClick={() => setMode("editar")}
            >
              Editar
            </Button>
            <Button
              type="button"
              variant="tab"
              size="sm"
              aria-pressed={mode === "criar"}
              onClick={() => setMode("criar")}
            >
              Criar
            </Button>
          </fieldset>
          <p className="text-meta text-center">
            {mode === "criar"
              ? "Gera o Still de um top ou de uma calcinha que ainda não tem, a partir das fotos da peça."
              : "Ajusta o Still de uma peça com um modelo de imagem e publica na loja."}
          </p>
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
  mode,
  onChangePiece,
}: {
  app: App;
  link: string;
  mode: Mode;
  onChangePiece: () => void;
}) {
  const queryClient = useQueryClient();
  const { pair } = useEditorSearch();
  const loaded = useQuery({
    queryKey: ["still_load", link, pair ?? null],
    queryFn: () =>
      callTool<Loaded>(app, "still_load", {
        link,
        ...(pair ? { pairLink: pair } : {}),
      }),
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
  // Something to edit: the live Still, a version, or a stored generation.
  const canEdit = Boolean(data.piece.still || selected || data.hasSource);
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
          Ver outra peça
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
            </div>
            {selected && (
              <PublishButton
                app={app}
                data={data}
                version={selected}
                onDone={async () => {
                  await refresh();
                  select(null);
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

          {selected?.beforeUrl && (
            <div
              role="group"
              aria-label="Comparar com a imagem de partida"
              className="surface-inset flex gap-1 self-center rounded-full p-1"
            >
              <Button
                variant="tab"
                size="sm"
                aria-pressed={showBefore}
                onClick={() => setShowBefore(true)}
              >
                Antes
              </Button>
              <Button
                variant="tab"
                size="sm"
                aria-pressed={!showBefore}
                onClick={() => setShowBefore(false)}
              >
                Depois
              </Button>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6">
          {mode === "criar" && data.piece.still && (
            <Alert>
              <AlertDescription>
                Esta peça já tem Still. Para mudar, edite o Still atual.
              </AlertDescription>
            </Alert>
          )}
          {data.create?.block && (
            <BlockNotice
              app={app}
              data={data}
              onDone={async () => {
                await refresh();
                select(null);
              }}
            />
          )}
          {data.create && !data.create.block && (
            <CreatePanel
              app={app}
              data={data}
              onDone={async (version) => {
                await refresh();
                select(version.id);
              }}
            />
          )}
          {canEdit && (
            <Composer
              app={app}
              data={data}
              parent={selected ?? null}
              onDone={async (version) => {
                await refresh();
                select(version.id);
              }}
            />
          )}
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
                <History
                  app={app}
                  data={data}
                  onDone={async () => {
                    await refresh();
                    select(null);
                  }}
                />
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

/** The storefront caches product data for up to 4 h (s-maxage=14400), so
 *  Mix & Match can show the previous Still that long. */
const STORE_DELAY = "A loja pode levar até 4 horas para mostrar a mudança.";

function PublishButton({
  app,
  data,
  version,
  onDone,
}: {
  app: App;
  data: Loaded;
  version: Version;
  /** Resolves once the piece is reloaded, so the button stays busy until then. */
  onDone: () => Promise<void>;
}) {
  const publish = useMutation({
    mutationFn: async () => {
      const publication = await callTool<Publication>(app, "still_publish", {
        productId: data.piece.productId,
        versionId: version.id,
        expectedStillId: data.piece.still?.imageId ?? null,
      });
      await onDone();
      return publication;
    },
    onSuccess: (publication) => {
      if (publication.status === "published") {
        toast.success(`Publicado em ${publication.variants.length} variantes`, {
          description: STORE_DELAY,
        });
      } else {
        toast.error(`Nada mudou na loja: ${publication.error}`);
      }
    },
    onError: (error) => toast.error(describeError(error)),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={!version.check.ok || publish.isPending}>
          {publish.isPending && <Spinner size="2xs" />}
          {publish.isPending ? "Publicando" : "Publicar na loja"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publicar este Still?</AlertDialogTitle>
          <AlertDialogDescription>
            {data.piece.still
              ? `Ele substitui o Still atual nas ${data.piece.variantCount} variantes de ${data.piece.name}. O atual fica no histórico e pode ser restaurado.`
              : `Ele entra nas ${data.piece.variantCount} variantes de ${data.piece.name}, na posição do Still, e passa a aparecer no Mix & Match.`}{" "}
            {STORE_DELAY}
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

/**
 * A running edit or creation job. It lives in the route, which Studio keeps
 * in its URL and hands back when it reloads the app, so the job is still
 * followed. After "done" the editor reloads the piece; progress stays until
 * `onDone` has.
 */
function useJob({
  app,
  param,
  onDone,
  onFailed,
}: {
  app: App;
  param: "job" | "createJob";
  onDone: (version: Version) => Promise<void>;
  onFailed: (message: string) => void;
}) {
  const search = useEditorSearch();
  const navigate = useNavigate();
  const jobId = search[param] ?? null;
  const setJobId = (job: string | null) => {
    const next: Search = { ...search };
    if (job) next[param] = job;
    else delete next[param];
    navigate({ to: "/", search: next, replace: true });
  };
  const [opening, setOpening] = useState(false);
  const opened = useRef<string | null>(null);

  const status = useQuery({
    queryKey: ["still_edit_status", jobId],
    enabled: jobId !== null,
    refetchInterval: opening ? false : 3000,
    queryFn: async () => {
      const status = await callTool<EditStatus>(app, "still_edit_status", {
        jobId,
      });
      if (status.status === "done" && status.version) {
        if (opened.current === jobId) return status;
        opened.current = jobId;
        setOpening(true);
        try {
          await onDone(status.version);
        } finally {
          setOpening(false);
          setJobId(null);
        }
      } else if (status.status === "failed") {
        setJobId(null);
        onFailed(describeError(status.error));
      }
      return status;
    },
  });
  return { jobId, setJobId, status: status.data, opening };
}

/** Why this piece cannot get a new Still, and the way out when there is one
 *  (a Still that left its order is put back). */
function BlockNotice({
  app,
  data,
  onDone,
}: {
  app: App;
  data: Loaded;
  onDone: () => Promise<void>;
}) {
  const block = data.create?.block;
  const reposition = useMutation({
    mutationFn: async () => {
      const publication = await callTool<Publication>(app, "still_reposition", {
        productId: data.piece.productId,
      });
      await onDone();
      return publication;
    },
    onSuccess: (publication) => {
      if (publication.status !== "published") {
        toast.error(`Nada mudou na loja: ${publication.error}`);
      } else if (publication.error) {
        toast.warning("O Still voltou para o lugar", {
          description: publication.error,
        });
      } else {
        toast.success(
          `O Still voltou para o lugar em ${publication.variants.length} variantes`,
          { description: STORE_DELAY },
        );
      }
    },
    onError: (error) => toast.error(describeError(error)),
  });
  if (!block || block === "has-still") return null;
  return (
    <section className="surface flex flex-col gap-3 p-5">
      <p className="text-sm text-foreground">{BLOCK_MESSAGE[block]}</p>
      {block === "still-moved" && (
        <>
          <p className="text-meta">
            Ele está na posição {data.create?.movedOrder}. Isso acontece quando
            as imagens são reordenadas no admin.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="self-start"
                disabled={reposition.isPending}
              >
                {reposition.isPending && <Spinner size="2xs" />}
                {reposition.isPending ? "Corrigindo" : "Pôr de volta"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Pôr o Still de volta?</AlertDialogTitle>
                <AlertDialogDescription>
                  A mesma imagem entra na posição do Still nas{" "}
                  {data.piece.variantCount} variantes de {data.piece.name}, e a
                  cópia na posição {data.create?.movedOrder} é apagada.{" "}
                  {STORE_DELAY}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => reposition.mutate()}>
                  Pôr de volta
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}

const NO_PAIR = "none";

/** A new Still from the product photos: the pair to generate with, the
 *  product facts (folded away) and the model. */
function CreatePanel({
  app,
  data,
  onDone,
}: {
  app: App;
  data: Loaded;
  /** Resolves once the new version is loaded, so progress shows until then. */
  onDone: (version: Version) => Promise<void>;
}) {
  const create = data.create as Creation;
  const search = useEditorSearch();
  const navigate = useNavigate();
  const [model, setModel] = useState(data.defaultModel);
  const [failure, setFailure] = useState<string | null>(null);
  const job = useJob({
    app,
    param: "createJob",
    onDone,
    onFailed: setFailure,
  });
  const pairId = data.pair ? String(data.pair.productId) : NO_PAIR;
  const choosePair = (value: string) =>
    navigate({ to: "/", search: { ...search, pair: value }, replace: true });

  const start = useMutation({
    mutationFn: () =>
      callTool<{ jobId: string }>(app, "still_create_start", {
        productId: data.piece.productId,
        pairProductId: data.pair?.productId ?? null,
        model,
      }),
    onMutate: () => setFailure(null),
    onSuccess: ({ jobId }) => job.setJobId(jobId),
    onError: (error) => setFailure(describeError(error)),
  });
  const running = start.isPending || job.jobId !== null;
  const pairType = data.piece.type === "bottom" ? "top" : "calcinha";
  const created = data.versions.some((version) => version.base === "created");

  const note = !data.pair
    ? `Sem ${pairType} para gerar junto, o Still sai no tamanho padrão.${create.pairs.length === 0 ? " Esta peça ainda não tem par no Mix & Match." : ""}`
    : !data.pair.still
      ? `${data.pair.name} ainda não tem Still: o tamanho segue o do conjunto gerado.`
      : `Sai na mesma escala do Still de ${data.pair.name}.`;

  return (
    <form
      className="surface flex flex-col gap-3 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!running) start.mutate();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">
          {created ? "Criar outro Still" : "Esta peça ainda não tem Still"}
        </h2>
        <p className="text-meta">
          Gerado a partir das fotos da peça, junto com o par, como os Stills do
          Mix & Match.
        </p>
      </div>
      <label
        htmlFor="create-pair"
        className="text-sm font-medium text-foreground"
      >
        Par
      </label>
      <Select value={pairId} onValueChange={choosePair} disabled={running}>
        <SelectTrigger id="create-pair" className="min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {data.pair &&
            !create.pairs.some((p) => p.productId === data.pair?.productId) && (
              <SelectItem value={String(data.pair.productId)}>
                {data.pair.name}
              </SelectItem>
            )}
          {create.pairs.map((candidate) => (
            <SelectItem
              key={candidate.productId}
              value={String(candidate.productId)}
            >
              {candidate.name}
              {candidate.isLook ? " (Look complementar)" : ""}
            </SelectItem>
          ))}
          <SelectItem value={NO_PAIR}>Sem par</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-meta">{note}</p>
      <FactsDetails app={app} data={data} disabled={running} />
      {running && <EditProgress status={job.status} opening={job.opening} />}
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
        <Button type="submit" variant="special" disabled={running}>
          {running && <Spinner size="2xs" />}
          {running ? "Criando" : "Criar Still"}
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

const FACT_FIELDS = [
  ["color", "Cor"],
  ["fabric", "Tecido"],
  ["shape", "Formato"],
  ["hardware", "Reguladores e fechos"],
] as const;

/** The product facts the image model gets, folded away: written from the
 *  photos on the first creation, and correctable for the next one. */
function FactsDetails({
  app,
  data,
  disabled,
}: {
  app: App;
  data: Loaded;
  disabled: boolean;
}) {
  const create = data.create as Creation;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Facts | null>(null);
  const facts = draft ?? create.facts;
  const save = useMutation({
    mutationFn: (value: Facts) =>
      callTool<Facts>(app, "still_facts_save", {
        productId: data.piece.productId,
        color: value.color,
        fabric: value.fabric,
        shape: value.shape,
        hardware: value.hardware,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["still_load"] });
      setDraft(null);
      toast.success("Detalhes salvos para o próximo Still");
    },
    onError: (error) => toast.error(describeError(error)),
  });
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-meta">Detalhes da peça</summary>
      <div className="flex flex-col gap-3 pt-3">
        {!facts ? (
          <p className="text-meta">
            Os detalhes (cor, tecido, formato, reguladores) são lidos das fotos
            na primeira criação e aparecem aqui para corrigir.
          </p>
        ) : (
          <>
            <p className="text-meta">
              Em inglês, como o modelo de imagem lê. Valem para o próximo Still
              criado desta peça.
            </p>
            {FACT_FIELDS.map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label
                  htmlFor={`fact-${key}`}
                  className="text-xs font-medium text-foreground"
                >
                  {label}
                </label>
                <Textarea
                  id={`fact-${key}`}
                  value={facts[key]}
                  disabled={disabled || save.isPending}
                  onChange={(event) =>
                    setDraft({ ...facts, [key]: event.target.value })
                  }
                  className="max-h-32 min-h-16 overflow-y-auto text-xs"
                />
              </div>
            ))}
            {draft && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={disabled || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending && <Spinner size="2xs" />}
                Salvar detalhes
              </Button>
            )}
          </>
        )}
      </div>
    </details>
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
  /** Resolves once the new version is loaded, so progress shows until then. */
  onDone: (version: Version) => Promise<void>;
}) {
  const [request, setRequest] = useState("");
  const [model, setModel] = useState(data.defaultModel);
  const [failure, setFailure] = useState<string | null>(null);
  const job = useJob({
    app,
    param: "job",
    onDone: async (version) => {
      await onDone(version);
      setRequest("");
    },
    onFailed: setFailure,
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
    onSuccess: ({ jobId }) => job.setJobId(jobId),
    onError: (error) => setFailure(describeError(error)),
  });

  const running = start.isPending || job.jobId !== null;
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
        <EditProgress status={job.status} opening={job.opening} />
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
      {data.piece.still && (
        <li>
          <VersionRow
            url={data.piece.still.url}
            selected={selectedId === null}
            onSelect={() => onSelect(null)}
          >
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <span className="size-1.5 rounded-full bg-brand" />
              Na loja
            </span>
            <span className="text-meta">{liveSince(data)}</span>
          </VersionRow>
        </li>
      )}
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
              {version.base === "created"
                ? "Criado a partir das fotos"
                : version.prompt}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-meta">{formatWhen(version.createdAt)}</span>
              {!version.check.ok && (
                <Badge variant="outline">Fora do padrão</Badge>
              )}
              {version.outOfPairScale && (
                <Badge variant="outline">Menor que a escala do par</Badge>
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

const PUBLICATION_LABEL = {
  publish: "Publicado",
  restore: "Restaurado",
  reposition: "Posição corrigida",
} as const;

/** When the live Still went up, from the latest publication that changed it. */
function liveSince(data: Loaded): string {
  const last = data.publications.find((p) => p.status === "published");
  if (!last) return "Still original";
  const verb = PUBLICATION_LABEL[last.kind];
  return `${verb} em ${formatWhen(last.at)} · ${firstName(last.author)}`;
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
    version.base === "created"
      ? data.pair && data.pair.productId === version.pairProductId
        ? `gerado com ${data.pair.name}`
        : version.pairProductId
          ? "gerado com o par"
          : "gerado sem par"
      : version.base === "original"
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
  /** Resolves once the piece is reloaded, so the button stays busy until then. */
  onDone: () => Promise<void>;
}) {
  const restore = useMutation({
    mutationFn: async (publicationId: string) => {
      const publication = await callTool<Publication>(app, "still_restore", {
        productId: data.piece.productId,
        publicationId,
        expectedStillId: data.piece.still?.imageId ?? null,
      });
      await onDone();
      return publication;
    },
    onSuccess: (publication) => {
      if (publication.status === "published") {
        toast.success("Still anterior restaurado", {
          description: STORE_DELAY,
        });
      } else {
        toast.error(`Nada mudou na loja: ${publication.error}`);
      }
    },
    onError: (error) => toast.error(describeError(error)),
  });
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
                ? PUBLICATION_LABEL[publication.kind]
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
                  {restore.isPending &&
                    restore.variables === publication.id && (
                      <Spinner size="2xs" />
                    )}
                  {restore.isPending && restore.variables === publication.id
                    ? "Restaurando"
                    : "Restaurar"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Restaurar o Still anterior?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Volta o Still que esta publicação substituiu, nas{" "}
                    {data.piece.variantCount} variantes. {STORE_DELAY}
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
