/**
 * Google Meet API constants
 */

export const MEET_API_BASE = "https://meet.googleapis.com/v2";

export const ENDPOINTS = {
  SPACES: `${MEET_API_BASE}/spaces`,
  SPACE: (spaceName: string) => `${MEET_API_BASE}/${spaceName}`,
  SPACE_END: (spaceName: string) =>
    `${MEET_API_BASE}/${spaceName}:endActiveConference`,
  CONFERENCE_RECORDS: `${MEET_API_BASE}/conferenceRecords`,
  CONFERENCE_RECORD: (name: string) => `${MEET_API_BASE}/${name}`,
  PARTICIPANTS: (parent: string) => `${MEET_API_BASE}/${parent}/participants`,
  PARTICIPANT: (name: string) => `${MEET_API_BASE}/${name}`,
  PARTICIPANT_SESSIONS: (parent: string) =>
    `${MEET_API_BASE}/${parent}/participantSessions`,
  RECORDINGS: (parent: string) => `${MEET_API_BASE}/${parent}/recordings`,
  RECORDING: (name: string) => `${MEET_API_BASE}/${name}`,
  TRANSCRIPTS: (parent: string) => `${MEET_API_BASE}/${parent}/transcripts`,
  TRANSCRIPT_ENTRIES: (parent: string) => `${MEET_API_BASE}/${parent}/entries`,
};

export const SPACE_TYPE = {
  SPACE_TYPE_UNSPECIFIED: "SPACE_TYPE_UNSPECIFIED",
  MEETING_SPACE: "MEETING_SPACE",
  PERSONAL_ROOM: "PERSONAL_ROOM",
} as const;

export const ACCESS_TYPE = {
  ACCESS_TYPE_UNSPECIFIED: "ACCESS_TYPE_UNSPECIFIED",
  OPEN: "OPEN",
  TRUSTED: "TRUSTED",
  RESTRICTED: "RESTRICTED",
} as const;

export const ENTRY_POINT_ACCESS = {
  ENTRY_POINT_ACCESS_UNSPECIFIED: "ENTRY_POINT_ACCESS_UNSPECIFIED",
  ALL: "ALL",
  CREATOR_APP_ONLY: "CREATOR_APP_ONLY",
} as const;
