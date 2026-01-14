/**
 * Google Meet API client
 */

import { ENDPOINTS } from "../constants.ts";
import type {
  Space,
  SpaceConfig,
  ConferenceRecord,
  Participant,
  ParticipantSession,
  Recording,
  Transcript,
  TranscriptEntry,
} from "./types.ts";

export class MeetClient {
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
      throw new Error(`Meet API error: ${response.status} - ${error}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  // Space operations
  async createSpace(config?: SpaceConfig): Promise<Space> {
    return this.request<Space>(ENDPOINTS.SPACES, {
      method: "POST",
      body: JSON.stringify({ config }),
    });
  }

  async getSpace(spaceName: string): Promise<Space> {
    return this.request<Space>(ENDPOINTS.SPACE(spaceName));
  }

  async updateSpace(spaceName: string, config: SpaceConfig): Promise<Space> {
    const url = new URL(ENDPOINTS.SPACE(spaceName));
    url.searchParams.set("updateMask", "config");
    return this.request<Space>(url.toString(), {
      method: "PATCH",
      body: JSON.stringify({ config }),
    });
  }

  async endActiveConference(spaceName: string): Promise<void> {
    await this.request<void>(ENDPOINTS.SPACE_END(spaceName), {
      method: "POST",
    });
  }

  // Conference records
  async listConferenceRecords(
    filter?: string,
    pageSize = 100,
  ): Promise<ConferenceRecord[]> {
    const url = new URL(ENDPOINTS.CONFERENCE_RECORDS);
    if (filter) url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", String(pageSize));
    const result = await this.request<{
      conferenceRecords?: ConferenceRecord[];
    }>(url.toString());
    return result.conferenceRecords || [];
  }

  async getConferenceRecord(name: string): Promise<ConferenceRecord> {
    return this.request<ConferenceRecord>(ENDPOINTS.CONFERENCE_RECORD(name));
  }

  // Participants
  async listParticipants(
    conferenceRecord: string,
    pageSize = 100,
  ): Promise<Participant[]> {
    const url = new URL(ENDPOINTS.PARTICIPANTS(conferenceRecord));
    url.searchParams.set("pageSize", String(pageSize));
    const result = await this.request<{ participants?: Participant[] }>(
      url.toString(),
    );
    return result.participants || [];
  }

  async getParticipant(name: string): Promise<Participant> {
    return this.request<Participant>(ENDPOINTS.PARTICIPANT(name));
  }

  async listParticipantSessions(
    participant: string,
    pageSize = 100,
  ): Promise<ParticipantSession[]> {
    const url = new URL(ENDPOINTS.PARTICIPANT_SESSIONS(participant));
    url.searchParams.set("pageSize", String(pageSize));
    const result = await this.request<{
      participantSessions?: ParticipantSession[];
    }>(url.toString());
    return result.participantSessions || [];
  }

  // Recordings
  async listRecordings(conferenceRecord: string): Promise<Recording[]> {
    const url = new URL(ENDPOINTS.RECORDINGS(conferenceRecord));
    const result = await this.request<{ recordings?: Recording[] }>(
      url.toString(),
    );
    return result.recordings || [];
  }

  async getRecording(name: string): Promise<Recording> {
    return this.request<Recording>(ENDPOINTS.RECORDING(name));
  }

  // Transcripts
  async listTranscripts(conferenceRecord: string): Promise<Transcript[]> {
    const url = new URL(ENDPOINTS.TRANSCRIPTS(conferenceRecord));
    const result = await this.request<{ transcripts?: Transcript[] }>(
      url.toString(),
    );
    return result.transcripts || [];
  }

  async listTranscriptEntries(
    transcript: string,
    pageSize = 100,
  ): Promise<TranscriptEntry[]> {
    const url = new URL(ENDPOINTS.TRANSCRIPT_ENTRIES(transcript));
    url.searchParams.set("pageSize", String(pageSize));
    const result = await this.request<{
      transcriptEntries?: TranscriptEntry[];
    }>(url.toString());
    return result.transcriptEntries || [];
  }
}

export { getAccessToken } from "./env.ts";
