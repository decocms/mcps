/**
 * Mock Grain client for testing without API key
 *
 * This provides fake data that mimics the Grain API structure
 * for development and testing purposes.
 */

import type {
  ListRecordingsParams,
  Recording,
  RecordingSummary,
  Transcript,
} from "./types.ts";

export class MockGrainClient {
  /**
   * Mock recordings data
   */
  private mockRecordings: Recording[] = [
    {
      id: "rec_001",
      title: "Sales Call - Acme Corp Q4 Discussion",
      meeting_url: "https://zoom.us/j/123456789",
      meeting_platform: "zoom",
      duration_seconds: 1845, // 30:45
      recorded_at: "2025-12-27T14:30:00Z",
      status: "ready",
      participants: [
        { name: "John Smith", email: "john@company.com", role: "Sales Rep" },
        { name: "Jane Doe", email: "jane@acme.com", role: "Customer" },
        {
          name: "Bob Johnson",
          email: "bob@acme.com",
          role: "Decision Maker",
        },
      ],
      transcript_available: true,
      video_url: "https://grain.com/recordings/rec_001/video",
      audio_url: "https://grain.com/recordings/rec_001/audio",
      created_at: "2025-12-27T14:30:00Z",
      updated_at: "2025-12-27T15:05:00Z",
      metadata: {
        meeting_type: "sales_call",
        tags: ["q4", "enterprise", "negotiation"],
      },
    },
    {
      id: "rec_002",
      title: "Customer Interview - Feature Feedback",
      meeting_url: "https://meet.google.com/abc-defg-hij",
      meeting_platform: "meet",
      duration_seconds: 2700, // 45:00
      recorded_at: "2025-12-26T10:00:00Z",
      status: "ready",
      participants: [
        {
          name: "Alice Research",
          email: "alice@company.com",
          role: "Researcher",
        },
        { name: "Customer User", email: "user@customer.com", role: "User" },
      ],
      transcript_available: true,
      video_url: "https://grain.com/recordings/rec_002/video",
      audio_url: "https://grain.com/recordings/rec_002/audio",
      created_at: "2025-12-26T10:00:00Z",
      updated_at: "2025-12-26T10:50:00Z",
      metadata: {
        meeting_type: "customer_interview",
        tags: ["user_research", "product_feedback"],
      },
    },
    {
      id: "rec_003",
      title: "Team Standup - Engineering",
      meeting_url: "https://teams.microsoft.com/l/meetup/...",
      meeting_platform: "teams",
      duration_seconds: 900, // 15:00
      recorded_at: "2025-12-27T09:00:00Z",
      status: "ready",
      participants: [
        { name: "Tech Lead", email: "lead@company.com", role: "Lead" },
        { name: "Dev 1", email: "dev1@company.com", role: "Developer" },
        { name: "Dev 2", email: "dev2@company.com", role: "Developer" },
      ],
      transcript_available: true,
      created_at: "2025-12-27T09:00:00Z",
      updated_at: "2025-12-27T09:20:00Z",
      metadata: {
        meeting_type: "team_meeting",
        tags: ["standup", "engineering"],
      },
    },
  ];

  /**
   * Mock transcript data
   */
  private mockTranscripts: Record<string, Transcript> = {
    rec_001: {
      id: "trans_001",
      recording_id: "rec_001",
      language: "en",
      status: "ready",
      segments: [
        {
          id: "seg_001",
          speaker: "John Smith",
          speaker_id: "spk_001",
          text: "Hi Jane and Bob, thanks for joining today. I wanted to discuss our Q4 pricing proposal.",
          start_time: 5.2,
          end_time: 11.8,
          confidence: 0.95,
        },
        {
          id: "seg_002",
          speaker: "Jane Doe",
          speaker_id: "spk_002",
          text: "Thanks John. We're very interested, but the pricing seems a bit high for our budget.",
          start_time: 12.5,
          end_time: 18.3,
          confidence: 0.93,
        },
        {
          id: "seg_003",
          speaker: "Bob Johnson",
          speaker_id: "spk_003",
          text: "I agree with Jane. Can we discuss volume discounts? We're planning to scale significantly.",
          start_time: 19.0,
          end_time: 25.7,
          confidence: 0.91,
        },
        {
          id: "seg_004",
          speaker: "John Smith",
          speaker_id: "spk_001",
          text: "Absolutely! Let me walk you through our enterprise tier which includes volume pricing.",
          start_time: 26.2,
          end_time: 32.1,
          confidence: 0.94,
        },
      ],
      created_at: "2025-12-27T14:35:00Z",
      updated_at: "2025-12-27T15:05:00Z",
    },
    rec_002: {
      id: "trans_002",
      recording_id: "rec_002",
      language: "en",
      status: "ready",
      segments: [
        {
          id: "seg_005",
          speaker: "Alice Research",
          speaker_id: "spk_004",
          text: "Thanks for joining. I'd love to hear your thoughts on our new checkout flow.",
          start_time: 3.5,
          end_time: 8.9,
          confidence: 0.96,
        },
        {
          id: "seg_006",
          speaker: "Customer User",
          speaker_id: "spk_005",
          text: "Honestly, I found it a bit confusing. The payment options weren't clear.",
          start_time: 10.2,
          end_time: 15.8,
          confidence: 0.92,
        },
        {
          id: "seg_007",
          speaker: "Customer User",
          speaker_id: "spk_005",
          text: "Also, the page was slow to load. I almost gave up and went to a competitor.",
          start_time: 16.5,
          end_time: 22.3,
          confidence: 0.94,
        },
      ],
      created_at: "2025-12-26T10:05:00Z",
      updated_at: "2025-12-26T10:50:00Z",
    },
  };

  async listRecordings(params: ListRecordingsParams = {}): Promise<{
    recordings: RecordingSummary[];
    total: number;
    hasMore: boolean;
  }> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    let filtered = [...this.mockRecordings];

    // Apply filters
    if (params.meeting_type) {
      filtered = filtered.filter(
        (r) => r.metadata?.meeting_type === params.meeting_type,
      );
    }

    if (params.meeting_platform) {
      filtered = filtered.filter(
        (r) => r.meeting_platform === params.meeting_platform,
      );
    }

    if (params.tags && params.tags.length > 0) {
      filtered = filtered.filter((r) =>
        params.tags?.some((tag) => r.metadata?.tags?.includes(tag)),
      );
    }

    if (params.participant_email) {
      filtered = filtered.filter((r) =>
        r.participants.some((p) => p.email === params.participant_email),
      );
    }

    if (params.status) {
      filtered = filtered.filter((r) => r.status === params.status);
    }

    // Sort
    if (params.sort_by === "recorded_at") {
      filtered.sort((a, b) => {
        const comparison =
          new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime();
        return params.sort_order === "desc" ? -comparison : comparison;
      });
    }

    // Pagination
    const limit = params.limit || 20;
    const offset = params.offset || 0;
    const paginated = filtered.slice(offset, offset + limit);

    const summaries: RecordingSummary[] = paginated.map((r) => ({
      id: r.id,
      title: r.title,
      duration_seconds: r.duration_seconds,
      recorded_at: r.recorded_at,
      status: r.status,
      participants_count: r.participants.length,
      transcript_available: r.transcript_available,
    }));

    return {
      recordings: summaries,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
    };
  }
}
