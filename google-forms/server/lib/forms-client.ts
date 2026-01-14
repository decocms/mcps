/**
 * Google Forms API client
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  Form,
  FormResponse,
  Request,
  BatchUpdateResponse,
  Item,
} from "./types.ts";

export class FormsClient {
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
      throw new Error(`Forms API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // Form operations
  async createForm(title: string): Promise<Form> {
    return this.request<Form>(ENDPOINTS.FORMS, {
      method: "POST",
      body: JSON.stringify({ info: { title } }),
    });
  }

  async getForm(formId: string): Promise<Form> {
    return this.request<Form>(ENDPOINTS.FORM(formId));
  }

  async batchUpdate(
    formId: string,
    requests: Request[],
  ): Promise<BatchUpdateResponse> {
    return this.request<BatchUpdateResponse>(ENDPOINTS.BATCH_UPDATE(formId), {
      method: "POST",
      body: JSON.stringify({ requests, includeFormInResponse: true }),
    });
  }

  async updateFormInfo(
    formId: string,
    title?: string,
    description?: string,
  ): Promise<BatchUpdateResponse> {
    const info: any = {};
    const fields: string[] = [];
    if (title !== undefined) {
      info.title = title;
      fields.push("title");
    }
    if (description !== undefined) {
      info.description = description;
      fields.push("description");
    }
    return this.batchUpdate(formId, [
      { updateFormInfo: { info, updateMask: fields.join(",") } },
    ]);
  }

  // Question operations
  async addQuestion(
    formId: string,
    title: string,
    questionType:
      | "text"
      | "paragraph"
      | "radio"
      | "checkbox"
      | "dropdown"
      | "scale"
      | "date"
      | "time",
    options?: {
      choices?: string[];
      required?: boolean;
      lowLabel?: string;
      highLabel?: string;
      low?: number;
      high?: number;
    },
    index?: number,
  ): Promise<BatchUpdateResponse> {
    const question: any = { required: options?.required || false };

    switch (questionType) {
      case "text":
        question.textQuestion = { paragraph: false };
        break;
      case "paragraph":
        question.textQuestion = { paragraph: true };
        break;
      case "radio":
      case "checkbox":
      case "dropdown":
        question.choiceQuestion = {
          type:
            questionType === "radio"
              ? "RADIO"
              : questionType === "checkbox"
                ? "CHECKBOX"
                : "DROP_DOWN",
          options: (options?.choices || ["Option 1"]).map((value) => ({
            value,
          })),
        };
        break;
      case "scale":
        question.scaleQuestion = {
          low: options?.low ?? 1,
          high: options?.high ?? 5,
          lowLabel: options?.lowLabel,
          highLabel: options?.highLabel,
        };
        break;
      case "date":
        question.dateQuestion = { includeYear: true };
        break;
      case "time":
        question.timeQuestion = {};
        break;
    }

    const item: Item = {
      itemId: "",
      title,
      questionItem: { question: { questionId: "", ...question } },
    };

    return this.batchUpdate(formId, [
      { createItem: { item, location: { index: index ?? 0 } } },
    ]);
  }

  async updateQuestion(
    formId: string,
    index: number,
    title?: string,
    required?: boolean,
  ): Promise<BatchUpdateResponse> {
    const form = await this.getForm(formId);
    const existingItem = form.items?.[index];
    if (!existingItem) throw new Error(`No item at index ${index}`);

    const item: any = { ...existingItem };
    const fields: string[] = [];

    if (title !== undefined) {
      item.title = title;
      fields.push("title");
    }
    if (required !== undefined && item.questionItem?.question) {
      item.questionItem.question.required = required;
      fields.push("questionItem.question.required");
    }

    return this.batchUpdate(formId, [
      {
        updateItem: { item, location: { index }, updateMask: fields.join(",") },
      },
    ]);
  }

  async deleteQuestion(
    formId: string,
    index: number,
  ): Promise<BatchUpdateResponse> {
    return this.batchUpdate(formId, [{ deleteItem: { location: { index } } }]);
  }

  // Response operations
  async listResponses(formId: string): Promise<FormResponse[]> {
    const result = await this.request<{ responses?: FormResponse[] }>(
      ENDPOINTS.RESPONSES(formId),
    );
    return result.responses || [];
  }

  async getResponse(formId: string, responseId: string): Promise<FormResponse> {
    return this.request<FormResponse>(ENDPOINTS.RESPONSE(formId, responseId));
  }
}

export { getAccessToken } from "./env.ts";
