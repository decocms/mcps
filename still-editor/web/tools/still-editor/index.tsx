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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@decocms/ui/components/collapsible.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@decocms/ui/components/select.tsx";
import { Slider } from "@decocms/ui/components/slider.tsx";
import { toast } from "@decocms/ui/components/sonner.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { Textarea } from "@decocms/ui/components/textarea.tsx";
import { cn } from "@decocms/ui/lib/utils.ts";
import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown } from "@untitledui/icons";
import { useState } from "react";
import { useMcpApp, useMcpState } from "@/context.tsx";
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
        className="surface flex w-full max-w-lg flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onOpen(value.trim());
        }}
      >
        <h1 className="font-display text-2xl">Editar Still</h1>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Link da peça na loja"
            aria-label="Link da peça na loja"
          />
          <Button type="submit" disabled={!value.trim()}>
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
  const [sizeFactor, setSizeFactor] = useState(1);
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
    setSizeFactor(1);
    setShowBefore(false);
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["still_load", link] });
  const before = showBefore ? (selected?.beforeUrl ?? null) : null;
  const shownUrl =
    before ?? selected?.imageUrl ?? data.piece.still?.url ?? null;
  const canShowOutfit = Boolean(data.pair?.still?.url && shownUrl);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium text-foreground">
            {data.piece.name}
          </h1>
          <p className="text-meta">
            {data.piece.type === "bottom" ? "Calcinha" : "Top"} ·{" "}
            {data.piece.variantCount} variantes
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onChangePiece}>
          Trocar peça
        </Button>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="surface flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1">
              <Button
                variant="tab"
                size="sm"
                aria-pressed={view === "piece"}
                onClick={() => setView("piece")}
              >
                Peça
              </Button>
              {canShowOutfit && (
                <Button
                  variant="tab"
                  size="sm"
                  aria-pressed={view === "outfit"}
                  onClick={() => setView("outfit")}
                >
                  Conjunto
                </Button>
              )}
            </div>
            {selected ? (
              <PublishButton
                app={app}
                data={data}
                version={selected}
                sizeFactor={sizeFactor}
                onDone={() => {
                  select(null);
                  refresh();
                }}
              />
            ) : (
              <span className="text-meta">Atual na loja</span>
            )}
          </div>

          {view === "outfit" && canShowOutfit ? (
            <Outfit
              top={
                data.piece.type === "bottom" ? data.pair?.still?.url : shownUrl
              }
              bottom={
                data.piece.type === "bottom" ? shownUrl : data.pair?.still?.url
              }
              sizeFactor={sizeFactor}
              scaled={data.piece.type === "bottom" ? "bottom" : "top"}
            />
          ) : (
            <StillTile url={shownUrl} sizeFactor={before ? 1 : sizeFactor} />
          )}

          {selected && (
            <div className="flex flex-col gap-3">
              <VersionDetails
                app={app}
                data={data}
                version={selected}
                showBefore={showBefore}
                onShowBefore={setShowBefore}
                onDeleted={() => {
                  select(null);
                  refresh();
                }}
              />
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Tamanho</span>
                <Slider
                  className="flex-1"
                  min={80}
                  max={120}
                  step={1}
                  value={[Math.round(sizeFactor * 100)]}
                  onValueChange={([value]) => setSizeFactor(value / 100)}
                  aria-label="Tamanho da peça"
                />
                <span className="text-meta w-10 text-right tnum">
                  {Math.round(sizeFactor * 100)}%
                </span>
              </div>
              {!selected.check.ok && (
                <Alert variant="warning">
                  <AlertDescription>
                    Fora do padrão do Still:{" "}
                    {selected.check.problems.map(describeProblem).join(" ")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
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
          <Versions data={data} selectedId={selectedId} onSelect={select} />
          <History app={app} data={data} onDone={refresh} />
        </div>
      </div>
    </div>
  );
}

function StillTile({
  url,
  sizeFactor,
}: {
  url: string | null;
  sizeFactor: number;
}) {
  return (
    <div className="surface-inset relative mx-auto aspect-[4/5] w-full max-w-[calc(70dvh*0.8)] overflow-hidden">
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-contain"
          style={{ transform: `scale(${sizeFactor})` }}
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
  sizeFactor,
  scaled,
}: {
  top: string | null | undefined;
  bottom: string | null | undefined;
  sizeFactor: number;
  scaled: "top" | "bottom";
}) {
  const tile = (url: string | null | undefined, factor: number) => (
    <div className="surface-inset relative mx-auto aspect-square w-full max-w-[34dvh] overflow-hidden">
      {url && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ transform: `scale(${factor})` }}
        />
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {tile(top, scaled === "top" ? sizeFactor : 1)}
      {tile(bottom, scaled === "bottom" ? sizeFactor : 1)}
    </div>
  );
}

function PublishButton({
  app,
  data,
  version,
  sizeFactor,
  onDone,
}: {
  app: App;
  data: Loaded;
  version: Version;
  sizeFactor: number;
  onDone: () => void;
}) {
  const publish = useMutation({
    mutationFn: () =>
      callTool<Publication>(app, "still_publish", {
        productId: data.piece.productId,
        versionId: version.id,
        sizeFactor,
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

/** What was asked for a version, what it started from, and its removal. */
function VersionDetails({
  app,
  data,
  version,
  showBefore,
  onShowBefore,
  onDeleted,
}: {
  app: App;
  data: Loaded;
  version: Version;
  showBefore: boolean;
  onShowBefore: (show: boolean) => void;
  onDeleted: () => void;
}) {
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
    formatWhen(version.createdAt),
    startedFrom,
  ].filter(Boolean);

  return (
    <div className="surface-inset flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-foreground">{version.prompt}</p>
          <p className="text-meta">{facts.join(" · ")}</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={remove.isPending}
            >
              {remove.isPending && <Spinner size="2xs" />}
              Apagar
            </Button>
          </AlertDialogTrigger>
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
      {version.beforeUrl && (
        <div className="flex gap-1">
          <Button
            variant="tab"
            size="sm"
            aria-pressed={!showBefore}
            onClick={() => onShowBefore(false)}
          >
            Depois
          </Button>
          <Button
            variant="tab"
            size="sm"
            aria-pressed={showBefore}
            onClick={() => onShowBefore(true)}
          >
            Antes
          </Button>
        </div>
      )}
    </div>
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

  useQuery({
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
    ? `Edita a versão de ${formatWhen(parent.createdAt)}`
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
      <p className="text-meta">{base}</p>
      <div className="flex gap-2">
        <Select value={model} onValueChange={setModel} disabled={running}>
          <SelectTrigger className="flex-1" aria-label="Modelo">
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
      {running && <p className="text-meta">Leva até 2 minutos.</p>}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

function Versions({
  data,
  selectedId,
  onSelect,
}: {
  data: Loaded;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (data.versions.length === 0) return null;
  const thumb = (
    key: string,
    id: string | null,
    url: string | null,
    caption: string,
    when: string | null,
    flagged: boolean,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={selectedId === id}
      onClick={() => onSelect(id)}
      className={cn(
        "surface surface-interactive focus-ring flex flex-col gap-1.5 p-1.5 text-left",
        selectedId === id && "outline-2 outline-offset-2 outline-primary",
      )}
    >
      <div className="surface-inset relative aspect-[4/5] overflow-hidden">
        {url && (
          <img
            src={url}
            alt=""
            className="absolute inset-0 size-full object-contain"
          />
        )}
      </div>
      <span className="line-clamp-2 px-0.5 text-sm text-foreground">
        {caption}
      </span>
      {when && <span className="text-meta px-0.5">{when}</span>}
      {flagged && (
        <Badge variant="outline" className="mx-0.5 self-start">
          Fora do padrão
        </Badge>
      )}
    </button>
  );
  return (
    <section className="surface flex flex-col gap-3 p-5">
      <h2 className="text-sm font-medium text-foreground">Versões</h2>
      <div className="grid grid-cols-3 gap-3">
        {thumb(
          "current",
          null,
          data.piece.still?.url ?? null,
          "Na loja",
          null,
          false,
        )}
        {data.versions.map((version) =>
          thumb(
            version.id,
            version.id,
            version.imageUrl,
            version.prompt,
            formatWhen(version.createdAt),
            !version.check.ok,
          ),
        )}
      </div>
    </section>
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
  if (data.publications.length === 0) return null;
  const label = {
    publish: "Publicado",
    restore: "Restaurado",
  } as const;
  return (
    <Collapsible className="surface p-5">
      <CollapsibleTrigger className="focus-ring flex w-full items-center justify-between text-sm font-medium text-foreground">
        Publicações
        <ChevronDown className="size-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 flex flex-col divide-y divide-border">
        {data.publications.map((publication) => (
          <div
            key={publication.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
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
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
