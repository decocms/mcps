/**
 * Google Meet API types
 */

export interface Space {
  name: string;
  meetingUri?: string;
  meetingCode?: string;
  config?: SpaceConfig;
  activeConference?: ActiveConference;
}

export interface SpaceConfig {
  accessType?: "ACCESS_TYPE_UNSPECIFIED" | "OPEN" | "TRUSTED" | "RESTRICTED";
  entryPointAccess?:
    | "ENTRY_POINT_ACCESS_UNSPECIFIED"
    | "ALL"
    | "CREATOR_APP_ONLY";
}

export interface ActiveConference {
  conferenceRecord?: string;
}

export interface ConferenceRecord {
  name: string;
  startTime?: string;
  endTime?: string;
  expireTime?: string;
  space?: string;
}

export interface Participant {
  name: string;
  signedinUser?: SignedinUser;
  anonymousUser?: AnonymousUser;
  phoneUser?: PhoneUser;
  earliestStartTime?: string;
  latestEndTime?: string;
}

export interface SignedinUser {
  user?: string;
  displayName?: string;
}

export interface AnonymousUser {
  displayName?: string;
}

export interface PhoneUser {
  displayName?: string;
}

export interface ParticipantSession {
  name: string;
  startTime?: string;
  endTime?: string;
}

export interface Recording {
  name: string;
  state?: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
  startTime?: string;
  endTime?: string;
  driveDestination?: DriveDestination;
}

export interface DriveDestination {
  file?: string;
  exportUri?: string;
}

export interface Transcript {
  name: string;
  state?: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
  startTime?: string;
  endTime?: string;
  docsDestination?: DocsDestination;
}

export interface DocsDestination {
  document?: string;
  exportUri?: string;
}

export interface TranscriptEntry {
  name: string;
  participant?: string;
  text?: string;
  languageCode?: string;
  startTime?: string;
  endTime?: string;
}

export interface ListResponse<T> {
  [key: string]: T[] | string | undefined;
  nextPageToken?: string;
}
