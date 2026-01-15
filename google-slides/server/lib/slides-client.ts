/**
 * Google Slides API client
 */

import { ENDPOINTS, PREDEFINED_LAYOUT } from "../constants.ts";
import type { Presentation, Request, BatchUpdateResponse } from "./types.ts";

export class SlidesClient {
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
      throw new Error(`Slides API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // Presentation operations
  async createPresentation(title: string): Promise<Presentation> {
    return this.request<Presentation>(ENDPOINTS.PRESENTATIONS, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async getPresentation(presentationId: string): Promise<Presentation> {
    return this.request<Presentation>(ENDPOINTS.PRESENTATION(presentationId));
  }

  async batchUpdate(
    presentationId: string,
    requests: Request[],
  ): Promise<BatchUpdateResponse> {
    return this.request<BatchUpdateResponse>(
      ENDPOINTS.BATCH_UPDATE(presentationId),
      {
        method: "POST",
        body: JSON.stringify({ requests }),
      },
    );
  }

  // Slide operations
  async addSlide(
    presentationId: string,
    layout: keyof typeof PREDEFINED_LAYOUT = "BLANK",
    insertionIndex?: number,
  ): Promise<BatchUpdateResponse> {
    const request: Request = {
      createSlide: {
        insertionIndex,
        slideLayoutReference: { predefinedLayout: PREDEFINED_LAYOUT[layout] },
      },
    };
    return this.batchUpdate(presentationId, [request]);
  }

  async deleteSlide(
    presentationId: string,
    slideId: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      { deleteObject: { objectId: slideId } },
    ]);
  }

  async duplicateSlide(
    presentationId: string,
    slideId: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      { duplicateObject: { objectId: slideId } },
    ]);
  }

  async moveSlide(
    presentationId: string,
    slideId: string,
    newIndex: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      {
        updateSlidesPosition: {
          slideObjectIds: [slideId],
          insertionIndex: newIndex,
        },
      },
    ]);
  }

  // Element operations - EMU = English Metric Units (914400 EMU = 1 inch)
  private toEmu(pt: number): number {
    return Math.round(pt * 12700); // 1 PT = 12700 EMU
  }

  async insertTextBox(
    presentationId: string,
    slideId: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<BatchUpdateResponse> {
    const objectId = `textbox_${Date.now()}`;
    return this.batchUpdate(presentationId, [
      {
        createShape: {
          objectId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: this.toEmu(width), unit: "EMU" },
              height: { magnitude: this.toEmu(height), unit: "EMU" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: this.toEmu(x),
              translateY: this.toEmu(y),
              unit: "EMU",
            },
          },
        },
      },
      { insertText: { objectId, text } },
    ]);
  }

  async insertImage(
    presentationId: string,
    slideId: string,
    imageUrl: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      {
        createImage: {
          url: imageUrl,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: this.toEmu(width), unit: "EMU" },
              height: { magnitude: this.toEmu(height), unit: "EMU" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: this.toEmu(x),
              translateY: this.toEmu(y),
              unit: "EMU",
            },
          },
        },
      },
    ]);
  }

  async insertShape(
    presentationId: string,
    slideId: string,
    shapeType: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      {
        createShape: {
          shapeType,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: this.toEmu(width), unit: "EMU" },
              height: { magnitude: this.toEmu(height), unit: "EMU" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: this.toEmu(x),
              translateY: this.toEmu(y),
              unit: "EMU",
            },
          },
        },
      },
    ]);
  }

  async insertTable(
    presentationId: string,
    slideId: string,
    rows: number,
    columns: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      {
        createTable: {
          rows,
          columns,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: this.toEmu(width), unit: "EMU" },
              height: { magnitude: this.toEmu(height), unit: "EMU" },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: this.toEmu(x),
              translateY: this.toEmu(y),
              unit: "EMU",
            },
          },
        },
      },
    ]);
  }

  async deleteElement(
    presentationId: string,
    elementId: string,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      { deleteObject: { objectId: elementId } },
    ]);
  }

  async replaceAllText(
    presentationId: string,
    find: string,
    replace: string,
    matchCase = false,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(presentationId, [
      {
        replaceAllText: {
          containsText: { text: find, matchCase },
          replaceText: replace,
        },
      },
    ]);
  }
}

export { getAccessToken } from "./env.ts";
