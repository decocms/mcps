/**
 * Google Docs API client
 */

import { ENDPOINTS } from "../constants.ts";
import type { Document, Request, BatchUpdateResponse } from "./types.ts";

export class DocsClient {
  private accessToken: string;

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Docs API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // Document operations
  async createDocument(title: string): Promise<Document> {
    return this.request<Document>(ENDPOINTS.DOCUMENTS, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async getDocument(documentId: string): Promise<Document> {
    return this.request<Document>(ENDPOINTS.DOCUMENT(documentId));
  }

  async batchUpdate(
    documentId: string,
    requests: Request[],
  ): Promise<BatchUpdateResponse> {
    return this.request<BatchUpdateResponse>(
      ENDPOINTS.BATCH_UPDATE(documentId),
      {
        method: "POST",
        body: JSON.stringify({ requests }),
      },
    );
  }

  // Text operations
  async insertText(
    documentId: string,
    text: string,
    index: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      { insertText: { text, location: { index } } },
    ]);
  }

  async deleteContent(
    documentId: string,
    startIndex: number,
    endIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      { deleteContentRange: { range: { startIndex, endIndex } } },
    ]);
  }

  async replaceAllText(
    documentId: string,
    find: string,
    replace: string,
    matchCase = false,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      {
        replaceAllText: {
          containsText: { text: find, matchCase },
          replaceText: replace,
        },
      },
    ]);
  }

  // Formatting
  async formatText(
    documentId: string,
    startIndex: number,
    endIndex: number,
    style: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSize?: number;
    },
  ): Promise<BatchUpdateResponse> {
    const textStyle: any = {};
    const fields: string[] = [];

    if (style.bold !== undefined) {
      textStyle.bold = style.bold;
      fields.push("bold");
    }
    if (style.italic !== undefined) {
      textStyle.italic = style.italic;
      fields.push("italic");
    }
    if (style.underline !== undefined) {
      textStyle.underline = style.underline;
      fields.push("underline");
    }
    if (style.fontSize !== undefined) {
      textStyle.fontSize = { magnitude: style.fontSize, unit: "PT" };
      fields.push("fontSize");
    }

    return this.batchUpdate(documentId, [
      {
        updateTextStyle: {
          textStyle,
          range: { startIndex, endIndex },
          fields: fields.join(","),
        },
      },
    ]);
  }

  async setParagraphStyle(
    documentId: string,
    startIndex: number,
    endIndex: number,
    namedStyleType: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      {
        updateParagraphStyle: {
          paragraphStyle: { namedStyleType },
          range: { startIndex, endIndex },
          fields: "namedStyleType",
        },
      },
    ]);
  }

  async createBulletList(
    documentId: string,
    startIndex: number,
    endIndex: number,
    bulletPreset: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      {
        createParagraphBullets: {
          range: { startIndex, endIndex },
          bulletPreset,
        },
      },
    ]);
  }

  async removeBulletList(
    documentId: string,
    startIndex: number,
    endIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      { deleteParagraphBullets: { range: { startIndex, endIndex } } },
    ]);
  }

  // Elements
  async insertTable(
    documentId: string,
    rows: number,
    columns: number,
    index: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      { insertTable: { rows, columns, location: { index } } },
    ]);
  }

  async insertImage(
    documentId: string,
    uri: string,
    index: number,
    width?: number,
    height?: number,
  ): Promise<BatchUpdateResponse> {
    const request: any = { uri, location: { index } };
    if (width || height) {
      request.objectSize = {};
      if (width) request.objectSize.width = { magnitude: width, unit: "PT" };
      if (height) request.objectSize.height = { magnitude: height, unit: "PT" };
    }
    return this.batchUpdate(documentId, [{ insertInlineImage: request }]);
  }

  async insertPageBreak(
    documentId: string,
    index: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(documentId, [
      { insertPageBreak: { location: { index } } },
    ]);
  }

  // Helper to get document text content
  extractText(document: Document): string {
    if (!document.body?.content) return "";
    let text = "";
    for (const element of document.body.content) {
      if (element.paragraph?.elements) {
        for (const el of element.paragraph.elements) {
          if (el.textRun?.content) {
            text += el.textRun.content;
          }
        }
      }
    }
    return text;
  }

  // Helper to get end index
  getEndIndex(document: Document): number {
    if (!document.body?.content?.length) return 1;
    const lastElement = document.body.content[document.body.content.length - 1];
    return lastElement.endIndex || 1;
  }
}

export { getAccessToken } from "./env.ts";
