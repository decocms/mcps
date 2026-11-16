import { useCallback, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import { extractCanvas, sha256Hex, toBase64 } from "@/lib/fig-zip.ts";
import { cn } from "@/lib/utils.ts";

// Mirrors api/tools/import.ts CHUNK_BYTES and api/lib/files.ts Info.
const CHUNK_BYTES = 2 * 1024 * 1024;
type Info = {
  id: string;
  name: string;
  importedAt: string;
  nodes: number;
  pages: { id: string; name?: string; frames: number }[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string; pct: number }
  | { kind: "done"; info: Info }
  | { kind: "error"; message: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function useToolCaller() {
  const app = useMcpApp();
  return useCallback(
    async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
      if (!app) throw new Error("Conexão com o host ainda não está pronta");
      const r = await app.callServerTool({ name, arguments: args });
      if (r.isError) {
        const text = r.content?.find((c) => c.type === "text");
        throw new Error(text?.type === "text" ? text.text : "Erro na tool");
      }
      return r.structuredContent as T;
    },
    [app],
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list
        <li key={i} className="flex gap-3">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

const Menu = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded border bg-muted px-1.5 py-0.5 font-medium">
    {children}
  </span>
);

function Guide() {
  return (
    <Tabs defaultValue="desktop">
      <TabsList>
        <TabsTrigger value="desktop">App desktop</TabsTrigger>
        <TabsTrigger value="web">Navegador</TabsTrigger>
      </TabsList>
      <TabsContent value="desktop" className="pt-2">
        <Steps
          items={[
            "Abra o arquivo no Figma desktop.",
            <>
              No menu do Figma (ícone no canto superior esquerdo) vá em{" "}
              <Menu>Arquivo</Menu> → <Menu>Salvar cópia local…</Menu> (
              <i>File → Save local copy</i>).
            </>,
            <>
              Espere o aviso <Menu>Baixando conteúdos…</Menu> terminar.{" "}
              <b>Não clique em “Salvar arquivo parcial”</b>: o arquivo sai
              incompleto.
            </>,
            "Salve o .fig e arraste ele aqui embaixo.",
          ]}
        />
      </TabsContent>
      <TabsContent value="web" className="pt-2">
        <Steps
          items={[
            "Abra o arquivo em figma.com.",
            <>
              Clique no ícone do Figma (canto superior esquerdo) →{" "}
              <Menu>Arquivo</Menu> → <Menu>Salvar cópia local…</Menu> (
              <i>File → Save local copy</i>).
            </>,
            "O navegador baixa um arquivo .fig (pode demorar: as imagens vêm junto).",
            "Arraste o .fig aqui embaixo.",
          ]}
        />
      </TabsContent>
      <p className="mt-3 text-xs text-muted-foreground">
        Não aparece “Salvar cópia local”? O dono do arquivo bloqueou cópias para
        quem só visualiza — peça para ele liberar ou exportar. Só o documento
        (alguns MB) é enviado; as imagens ficam no seu computador.
      </p>
    </Tabs>
  );
}

export default function ImportPage() {
  const app = useMcpApp();
  const { toolResult } = useMcpState<unknown, { files?: Info[] }>();
  const call = useToolCaller();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = toolResult?.files ?? [];

  const upload = async (file: File) => {
    try {
      setPhase({ kind: "working", label: "Lendo o documento…", pct: 2 });
      const { canvas } = await extractCanvas(file);
      const id = (await sha256Hex(canvas)).slice(0, 16);
      const parts = Math.ceil(canvas.length / CHUNK_BYTES);
      for (let i = 0; i < parts; i++) {
        setPhase({
          kind: "working",
          label: `Enviando ${mb(Math.min((i + 1) * CHUNK_BYTES, canvas.length))} de ${mb(canvas.length)}…`,
          pct: 5 + (85 * i) / parts,
        });
        const data = toBase64(
          canvas.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES),
        );
        await call("figma_upload_chunk", { id, index: i, data });
      }
      setPhase({ kind: "working", label: "Processando no servidor…", pct: 92 });
      const name = file.name.replace(/\.fig$/i, "");
      const info = await call<Info>("figma_register", { id, name, parts });
      setPhase({ kind: "done", info });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (f) upload(f);
  };

  const tellAgent = (info: Info) =>
    app?.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text: `Importei o arquivo do Figma "${info.name}" (id ${info.id}, ${info.pages.length} páginas). Pode usar as tools figma_* com file="${info.id}".`,
        },
      ],
    });

  const busy = phase.kind === "working";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 p-5">
      <div>
        <h1 className="text-base font-semibold">Importar arquivo do Figma</h1>
        <p className="text-sm text-muted-foreground">
          Exporte o arquivo como <code>.fig</code> e envie aqui. Depois o agente
          consegue ler páginas, camadas, textos, estilos e componentes — sem API
          nem limite de uso.
        </p>
      </div>

      <Guide />

      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed p-8 text-sm transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/50",
          busy && "cursor-wait opacity-60",
        )}
      >
        <span className="font-medium">Arraste o .fig aqui</span>
        <span className="text-muted-foreground">ou clique para escolher</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".fig"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {phase.kind === "working" && (
        <div className="space-y-2">
          <Progress value={phase.pct} />
          <p className="text-xs text-muted-foreground">{phase.label}</p>
        </div>
      )}

      {phase.kind === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Não deu para importar</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === "done" && (
        <Alert>
          <AlertTitle>
            “{phase.info.name}” importado — {phase.info.pages.length} páginas,{" "}
            {phase.info.nodes.toLocaleString("pt-BR")} camadas
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {phase.info.pages.map((p) => (
                <Badge key={p.id} variant="secondary">
                  {p.name}
                </Badge>
              ))}
            </div>
            <Button size="sm" onClick={() => tellAgent(phase.info)}>
              Avisar o agente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Já importados
          </p>
          {files.map((f) => (
            <div key={f.id} className="flex justify-between text-sm">
              <span>{f.name}</span>
              <span className="text-muted-foreground">
                {f.pages.length} páginas ·{" "}
                {new Date(f.importedAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
