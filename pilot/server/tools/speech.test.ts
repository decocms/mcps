/**
 * Speech Tools Tests
 */

import { describe, it, expect } from "bun:test";
import { detectLanguage, getVoiceForLanguage } from "./speech.ts";

describe("Speech Tools", () => {
  describe("detectLanguage", () => {
    it("detects Portuguese from common words", () => {
      expect(detectLanguage("Olá, como você está?")).toBe("pt");
      expect(detectLanguage("Isso é muito bom")).toBe("pt");
      expect(detectLanguage("Não sei o que fazer")).toBe("pt");
      expect(detectLanguage("Obrigado pela ajuda")).toBe("pt");
    });

    it("detects Portuguese from accented characters", () => {
      expect(detectLanguage("Está funcionando")).toBe("pt");
      expect(detectLanguage("Açúcar e café")).toBe("pt");
      expect(detectLanguage("Informação")).toBe("pt");
    });

    it("defaults to English for English text", () => {
      expect(detectLanguage("Hello, how are you?")).toBe("en");
      expect(detectLanguage("This is working great")).toBe("en");
      expect(detectLanguage("The quick brown fox")).toBe("en");
    });

    it("defaults to English for mixed/unclear text", () => {
      expect(detectLanguage("123456")).toBe("en");
      expect(detectLanguage("OK")).toBe("en");
      expect(detectLanguage("")).toBe("en");
    });
  });

  describe("getVoiceForLanguage", () => {
    it("returns Luciana for Portuguese", () => {
      expect(getVoiceForLanguage("pt")).toBe("Luciana");
    });

    it("returns Samantha for English", () => {
      expect(getVoiceForLanguage("en")).toBe("Samantha");
    });
  });
});
