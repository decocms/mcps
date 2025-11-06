import LoggedProvider from "@/components/logged-provider";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/components/user-button";
import { useOptionalUser } from "@/lib/hooks";
import { client } from "@/lib/rpc";
import { createRoute, type RootRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Circle,
  Crop,
  Download,
  Eraser,
  Eye,
  Image as ImageIcon,
  Minus,
  MoreHorizontal,
  MousePointer,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Interface principal do editor de imagem
function ImageEditor() {
  const [currentImage, setCurrentImage] = useState<string | null>(
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop",
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [tool, setTool] = useState<
    | "select"
    | "pencil"
    | "eraser"
    | "square"
    | "circle"
    | "text"
    | "crop"
    | "arrow"
  >("select");
  const [color, setColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(5);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setCurrentImage(e.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [],
  );

  const combineImageWithCanvas = useCallback(async (): Promise<
    string | null
  > => {
    if (!currentImage || !canvasRef.current) return null;

    return new Promise((resolve) => {
      // Criar um canvas temporário para combinar imagem + edições
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        resolve(null);
        return;
      }

      const img = new Image();
      img.onload = () => {
        // Definir tamanho do canvas temporário baseado na imagem
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;

        // Desenhar a imagem original primeiro
        tempCtx.drawImage(img, 0, 0);

        // Desenhar o canvas com as edições por cima
        const editCanvas = canvasRef.current;
        if (editCanvas) {
          tempCtx.drawImage(editCanvas, 0, 0, img.width, img.height);
        }

        // Converter para base64
        const combinedDataUrl = tempCanvas.toDataURL("image/png");
        resolve(combinedDataUrl);
      };

      img.onerror = () => resolve(null);
      img.src = currentImage;
    });
  }, [currentImage]);

  const handleApplyChanges = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    try {
      // Combinar imagem original + edições do canvas
      const combinedImageDataUrl = await combineImageWithCanvas();

      if (!combinedImageDataUrl) {
        throw new Error("Falha ao combinar imagem com edições");
      }

      const result = await client.GENERATE_IMAGE({
        prompt,
        baseImageUrl: combinedImageDataUrl,
        aspectRatio: aspectRatio,
      });

      if (result.image) {
        setCurrentImage(result.image);
      }
      setShowPrompt(false);

      console.log(
        "Imagem combinada enviada para IA:",
        combinedImageDataUrl ? "Sim" : "Não",
      );
      console.log("Prompt:", prompt);
    } catch (error) {
      console.error("Erro ao aplicar alterações:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, combineImageWithCanvas]);

  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [showTextInput, setShowTextInput] = useState(false);
  const [textToAdd, setTextToAdd] = useState("Texto");
  const [fontSize, setFontSize] = useState(24);
  const [textPosition, setTextPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool === "select") return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);

      // Para texto, mostrar modal de edição
      if (tool === "text") {
        setTextPosition({ x, y });
        setShowTextInput(true);
        return;
      }

      setIsDrawing(true);
      setStartPos({ x, y });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = tool === "eraser" ? "white" : color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";

      if (tool === "pencil" || tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    },
    [tool, color, brushSize],
  );

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || tool === "select" || !startPos) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (tool === "pencil" || tool === "eraser") {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    },
    [isDrawing, tool, startPos],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing || !startPos) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Para formas, desenhar apenas no final
    if (tool === "square" || tool === "circle" || tool === "arrow") {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.fillStyle = color;

      if (tool === "square") {
        const size = brushSize * 10;
        ctx.strokeRect(
          startPos.x - size / 2,
          startPos.y - size / 2,
          size,
          size,
        );
      } else if (tool === "circle") {
        const radius = brushSize * 5;
        ctx.beginPath();
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === "arrow") {
        // Desenhar seta
        const arrowLength = brushSize * 8;
        const arrowHeadLength = brushSize * 3;
        const arrowHeadAngle = Math.PI / 6; // 30 graus

        // Linha principal da seta (diagonal para cima e direita)
        const endX = startPos.x + arrowLength * 0.7;
        const endY = startPos.y - arrowLength * 0.7;

        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Cabeça da seta
        const angle = Math.atan2(endY - startPos.y, endX - startPos.x);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowHeadLength * Math.cos(angle - arrowHeadAngle),
          endY - arrowHeadLength * Math.sin(angle - arrowHeadAngle),
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowHeadLength * Math.cos(angle + arrowHeadAngle),
          endY - arrowHeadLength * Math.sin(angle + arrowHeadAngle),
        );
        ctx.stroke();
      }
    }

    setIsDrawing(false);
    setStartPos(null);
  }, [isDrawing, startPos, tool, color, brushSize]);

  // Função para adicionar texto
  const addText = useCallback(() => {
    if (!textPosition || !textToAdd.trim()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(textToAdd, textPosition.x, textPosition.y);

    // Limpar estado
    setShowTextInput(false);
    setTextPosition(null);
    setTextToAdd("Texto");
  }, [textPosition, textToAdd, color, fontSize]);

  // Inicializar canvas quando a imagem muda
  useEffect(() => {
    if (currentImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
      };
      img.src = currentImage;
    }
  }, [currentImage]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
          <h1 className="text-white font-medium">Editor de Imagens IA</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        {currentImage ? (
          <div className="relative">
            <img
              src={currentImage}
              alt="Imagem atual"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              style={{ maxHeight: "calc(100vh - 200px)" }}
            />

            {/* Canvas overlay para desenho */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              style={{
                cursor: tool === "select" ? "default" : "crosshair",
                pointerEvents: tool === "select" ? "none" : "auto",
                width: "100%",
                height: "100%",
              }}
            />
          </div>
        ) : (
          <div className="text-center">
            <ImageIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma imagem carregada</p>
            <Button
              onClick={() => setShowPrompt(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Gerar Imagem com IA
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="bg-gray-900 border-t border-gray-700 px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          {/* Ferramentas de seleção */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("select")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "select"
                ? "bg-blue-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <MousePointer className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("crop")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "crop"
                ? "bg-blue-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Crop className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Ferramentas de desenho */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("pencil")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "pencil"
                ? "bg-blue-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("eraser")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "eraser"
                ? "bg-red-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Eraser className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("square")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "square"
                ? "bg-purple-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Square className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("circle")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "circle"
                ? "bg-purple-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Circle className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("text")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "text"
                ? "bg-yellow-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <Type className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTool("arrow")}
            className={`h-10 w-10 p-0 transition-all duration-200 ${
              tool === "arrow"
                ? "bg-orange-600 text-white shadow-lg scale-105"
                : "text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Seletor de cor */}
          <div className="relative">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded border-2 border-gray-600 cursor-pointer bg-transparent"
            />
          </div>

          {/* Controle de tamanho do pincel */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBrushSize(Math.max(1, brushSize - 1))}
              className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700 transition-all duration-200"
            >
              <Minus className="h-3 w-3" />
            </Button>

            <span className="text-gray-400 text-sm w-6 text-center">
              {brushSize}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBrushSize(Math.min(20, brushSize + 1))}
              className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700 transition-all duration-200"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* Controle de tamanho da fonte (apenas para texto) */}
          {tool === "text" && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-gray-400 text-xs">Fonte:</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFontSize(Math.max(12, fontSize - 4))}
                className="h-8 w-8 p-0 text-yellow-400 hover:text-white hover:bg-yellow-600 transition-all duration-200"
              >
                <Minus className="h-3 w-3" />
              </Button>

              <span className="text-yellow-400 text-sm w-8 text-center">
                {fontSize}
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFontSize(Math.min(72, fontSize + 4))}
                className="h-8 w-8 p-0 text-yellow-400 hover:text-white hover:bg-yellow-600 transition-all duration-200"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Ações */}
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-700 transition-all duration-200"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-700 transition-all duration-200"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx) {
                  ctx.clearRect(
                    0,
                    0,
                    canvasRef.current.width,
                    canvasRef.current.height,
                  );
                }
              }
            }}
            className="h-10 w-10 p-0 text-red-400 hover:text-white hover:bg-red-600 transition-all duration-200"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Upload de imagem */}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="image-upload"
          />
          <label htmlFor="image-upload">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-blue-400 hover:text-white hover:bg-blue-600 cursor-pointer transition-all duration-200"
              asChild
            >
              <div>
                <ImageIcon className="h-4 w-4" />
              </div>
            </Button>
          </label>

          {/* Aplicar alterações com IA */}
          <Button
            onClick={() => setShowPrompt(true)}
            disabled={!currentImage}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white ml-4 h-10 px-4 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {currentImage ? "Aplicar Alterações" : "Gerar Imagem"}
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (canvasRef.current) {
                const link = document.createElement("a");
                link.download = "imagem-editada.png";
                link.href = canvasRef.current.toDataURL();
                link.click();
              }
            }}
            className="h-10 w-10 p-0 text-gray-400 hover:text-white hover:bg-gray-700 ml-2 transition-all duration-200"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Modal de Edição de Texto */}
      {showTextInput && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Type className="h-5 w-5 text-yellow-500" />
                Adicionar Texto
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowTextInput(false);
                  setTextPosition(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm block mb-2">
                  Texto:
                </label>
                <input
                  type="text"
                  value={textToAdd}
                  onChange={(e) => setTextToAdd(e.target.value)}
                  placeholder="Digite o texto aqui..."
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm block mb-2">
                  Tamanho da Fonte:
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(Math.max(12, fontSize - 4))}
                    className="h-8 w-8 p-0 text-yellow-400 hover:text-white hover:bg-yellow-600"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>

                  <span className="text-yellow-400 font-medium w-12 text-center">
                    {fontSize}px
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFontSize(Math.min(72, fontSize + 4))}
                    className="h-8 w-8 p-0 text-yellow-400 hover:text-white hover:bg-yellow-600"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>

                  <input
                    type="range"
                    min="12"
                    max="72"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-1 ml-3"
                  />
                </div>
              </div>

              <div className="text-center p-4 bg-gray-800 rounded-lg border border-gray-600">
                <p className="text-gray-400 text-xs mb-2">Preview:</p>
                <div
                  style={{
                    fontSize: `${Math.min(fontSize, 32)}px`,
                    color: color,
                    fontFamily: "Arial",
                  }}
                  className="text-center"
                >
                  {textToAdd || "Digite o texto..."}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowTextInput(false);
                  setTextPosition(null);
                }}
                variant="outline"
                className="flex-1 text-gray-400 border-gray-600 hover:text-white hover:border-gray-500"
              >
                Cancelar
              </Button>
              <Button
                onClick={addText}
                disabled={!textToAdd.trim()}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                <Type className="h-4 w-4 mr-2" />
                Adicionar Texto
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prompt para IA */}
      {showPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-green-500" />
                {currentImage
                  ? "Aplicar Alterações com IA"
                  : "Gerar Imagem com IA"}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPrompt(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                currentImage
                  ? "Descreva as alterações que você quer aplicar na imagem..."
                  : "Descreva a imagem que você quer gerar..."
              }
              className="w-full h-24 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            {/* Aspect Ratio Selector */}
            <div className="mt-4">
              <label className="text-gray-400 text-sm block mb-2">
                Aspect Ratio:
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="1:1">1:1 (Square - 1024x1024)</option>
                <option value="16:9">16:9 (Landscape - 1344x768)</option>
                <option value="9:16">9:16 (Portrait - 768x1344)</option>
                <option value="4:3">4:3 (Landscape - 1184x864)</option>
                <option value="3:4">3:4 (Portrait - 864x1184)</option>
                <option value="3:2">3:2 (Landscape - 1248x832)</option>
                <option value="2:3">2:3 (Portrait - 832x1248)</option>
                <option value="5:4">5:4 (Landscape - 1152x896)</option>
                <option value="4:5">4:5 (Portrait - 896x1152)</option>
                <option value="21:9">21:9 (Ultra Wide - 1536x672)</option>
              </select>
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => setShowPrompt(false)}
                variant="outline"
                className="flex-1 text-gray-400 border-gray-600 hover:text-white hover:border-gray-500"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApplyChanges}
                disabled={!prompt.trim() || isGenerating}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    {currentImage ? "Aplicando..." : "Gerando..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {currentImage ? "Aplicar" : "Gerar"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicLeft() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-white">
        Editor de Imagens Profissional
      </h2>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-sm text-slate-300">
        <p className="mb-3">Interface profissional de edição de imagens com:</p>
        <ul className="space-y-2 text-xs">
          <li>
            • <strong>Ferramentas completas</strong> de desenho e edição
          </li>
          <li>
            • <strong>Interface moderna</strong> inspirada em editores
            profissionais
          </li>
          <li>
            • <strong>Geração de imagens</strong> com IA integrada
          </li>
          <li>
            • <strong>Controles intuitivos</strong> e responsivos
          </li>
          <li>
            • <strong>Suporte completo</strong> para upload e download
          </li>
        </ul>
      </div>
    </div>
  );
}

function LoggedInContent() {
  return <ImageEditor />;
}

function PublicFallback() {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-slate-400">
        Faça login para acessar o editor
      </h2>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
        <h3 className="text-sm font-medium text-white mb-2">
          Login Necessário
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Entre para acessar o editor de imagens profissional.
        </p>
        <UserButton />
      </div>
    </div>
  );
}

function HomePage() {
  const user = useOptionalUser();

  if (user.data) {
    return (
      <LoggedProvider>
        <LoggedInContent />
      </LoggedProvider>
    );
  }

  return (
    <div className="bg-slate-900 min-h-screen p-6">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Deco"
              className="w-8 h-8 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">
                Editor de Imagens Profissional
              </h1>
              <p className="text-sm text-slate-400">
                Interface moderna para criação e edição de imagens com IA
              </p>
            </div>
          </div>

          <UserButton />
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Public Content */}
          <div className="lg:col-span-1">
            <PublicLeft />
          </div>

          {/* Right Column - Auth Content */}
          <div className="lg:col-span-2">
            <PublicFallback />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            Editor Profissional • Interface Moderna • IA Integrada • Ferramentas
            Completas
          </p>
        </div>
      </div>
    </div>
  );
}

export default (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/",
    component: HomePage,
    getParentRoute: () => parentRoute,
  });
