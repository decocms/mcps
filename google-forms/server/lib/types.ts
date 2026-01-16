/**
 * Google Forms API types
 */

export interface Form {
  formId: string;
  info: FormInfo;
  settings?: FormSettings;
  items?: Item[];
  revisionId?: string;
  responderUri?: string;
  linkedSheetId?: string;
}

export interface FormInfo {
  title: string;
  description?: string;
  documentTitle?: string;
}

export interface FormSettings {
  quizSettings?: QuizSettings;
}

export interface QuizSettings {
  isQuiz: boolean;
}

export interface Item {
  itemId: string;
  title?: string;
  description?: string;
  questionItem?: QuestionItem;
  questionGroupItem?: QuestionGroupItem;
  pageBreakItem?: PageBreakItem;
  textItem?: TextItem;
  imageItem?: ImageItem;
  videoItem?: VideoItem;
}

export interface QuestionItem {
  question: Question;
  image?: Image;
}

export interface Question {
  questionId: string;
  required?: boolean;
  grading?: Grading;
  textQuestion?: TextQuestion;
  choiceQuestion?: ChoiceQuestion;
  scaleQuestion?: ScaleQuestion;
  dateQuestion?: DateQuestion;
  timeQuestion?: TimeQuestion;
  fileUploadQuestion?: FileUploadQuestion;
}

export interface TextQuestion {
  paragraph?: boolean;
}

export interface ChoiceQuestion {
  type: "RADIO" | "CHECKBOX" | "DROP_DOWN";
  options: Option[];
  shuffle?: boolean;
}

export interface Option {
  value: string;
  image?: Image;
  isOther?: boolean;
  goToAction?: "NEXT_SECTION" | "RESTART_FORM" | "SUBMIT_FORM";
  goToSectionId?: string;
}

export interface ScaleQuestion {
  low: number;
  high: number;
  lowLabel?: string;
  highLabel?: string;
}

export interface DateQuestion {
  includeTime?: boolean;
  includeYear?: boolean;
}

export interface TimeQuestion {
  duration?: boolean;
}

export interface FileUploadQuestion {
  folderId?: string;
  maxFiles?: number;
  maxFileSize?: string;
  types?: string[];
}

export interface Grading {
  pointValue: number;
  correctAnswers?: CorrectAnswers;
  whenRight?: Feedback;
  whenWrong?: Feedback;
  generalFeedback?: Feedback;
}

export interface CorrectAnswers {
  answers: CorrectAnswer[];
}

export interface CorrectAnswer {
  value: string;
}

export interface Feedback {
  text: string;
  material?: ExtraMaterial[];
}

export interface ExtraMaterial {
  link?: TextLink;
  video?: VideoLink;
}

export interface TextLink {
  uri: string;
  displayText?: string;
}

export interface VideoLink {
  youtubeUri: string;
  displayText?: string;
}

export interface Image {
  contentUri?: string;
  altText?: string;
  sourceUri?: string;
}

export interface QuestionGroupItem {
  questions: Question[];
  image?: Image;
  grid?: Grid;
}

export interface Grid {
  columns: ChoiceQuestion;
  shuffleQuestions?: boolean;
}

export interface PageBreakItem {}

export interface TextItem {}

export interface ImageItem {
  image: Image;
}

export interface VideoItem {
  video: Video;
  caption?: string;
}

export interface Video {
  youtubeUri: string;
}

export interface FormResponse {
  responseId: string;
  createTime: string;
  lastSubmittedTime: string;
  respondentEmail?: string;
  answers?: Record<string, Answer>;
  totalScore?: number;
}

export interface Answer {
  questionId: string;
  grade?: Grade;
  textAnswers?: TextAnswers;
  fileUploadAnswers?: FileUploadAnswers;
}

export interface Grade {
  score: number;
  correct?: boolean;
  feedback?: Feedback;
}

export interface TextAnswers {
  answers: TextAnswer[];
}

export interface TextAnswer {
  value: string;
}

export interface FileUploadAnswers {
  answers: FileUploadAnswer[];
}

export interface FileUploadAnswer {
  fileId: string;
  fileName: string;
  mimeType: string;
}

export interface BatchUpdateRequest {
  includeFormInResponse?: boolean;
  requests: Request[];
}

export interface Request {
  createItem?: CreateItemRequest;
  updateItem?: UpdateItemRequest;
  deleteItem?: DeleteItemRequest;
  moveItem?: MoveItemRequest;
  updateFormInfo?: UpdateFormInfoRequest;
  updateSettings?: UpdateSettingsRequest;
}

export interface CreateItemRequest {
  item: Item;
  location: Location;
}

export interface UpdateItemRequest {
  item: Item;
  location: Location;
  updateMask: string;
}

export interface DeleteItemRequest {
  location: Location;
}

export interface MoveItemRequest {
  originalLocation: Location;
  newLocation: Location;
}

export interface UpdateFormInfoRequest {
  info: FormInfo;
  updateMask: string;
}

export interface UpdateSettingsRequest {
  settings: FormSettings;
  updateMask: string;
}

export interface Location {
  index: number;
}

export interface BatchUpdateResponse {
  form?: Form;
  replies: any[];
  writeControl?: WriteControl;
}

export interface WriteControl {
  requiredRevisionId?: string;
  targetRevisionId?: string;
}
