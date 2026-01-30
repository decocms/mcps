/**
 * Google Forms API constants
 */

export const FORMS_API_BASE = "https://forms.googleapis.com/v1/forms";

export const ENDPOINTS = {
  FORMS: FORMS_API_BASE,
  FORM: (formId: string) => `${FORMS_API_BASE}/${formId}`,
  BATCH_UPDATE: (formId: string) => `${FORMS_API_BASE}/${formId}:batchUpdate`,
  RESPONSES: (formId: string) => `${FORMS_API_BASE}/${formId}/responses`,
  RESPONSE: (formId: string, responseId: string) =>
    `${FORMS_API_BASE}/${formId}/responses/${responseId}`,
};

export const QUESTION_TYPE = {
  TEXT: "textQuestion",
  PARAGRAPH: "textQuestion",
  CHOICE: "choiceQuestion",
  SCALE: "scaleQuestion",
  DATE: "dateQuestion",
  TIME: "timeQuestion",
  FILE_UPLOAD: "fileUploadQuestion",
} as const;

export const CHOICE_TYPE = {
  RADIO: "RADIO",
  CHECKBOX: "CHECKBOX",
  DROP_DOWN: "DROP_DOWN",
} as const;

// Google OAuth scopes
export const GOOGLE_SCOPES = {
  FORMS_BODY: "https://www.googleapis.com/auth/forms.body",
  FORMS_RESPONSES_READONLY:
    "https://www.googleapis.com/auth/forms.responses.readonly",
  DRIVE_FILE: "https://www.googleapis.com/auth/drive.file",
} as const;
