/**
 * Voice Module Index
 *
 * Exports all voice-related functionality.
 */

export {
  // Voice Client
  joinVoiceChannelSafe,
  leaveVoiceChannel,
  getActiveConnection,
  getConnectionInfo,
  isConnectedToVoice,
  getAllConnections,
  disconnectAll,
  getMemberVoiceChannel,
  joinMemberChannel,
  type VoiceConnectionInfo,
} from "./voice-client.ts";

export {
  // Audio Receiver
  setAudioCompleteCallback,
  subscribeToUser,
  setupSpeakingListener,
  pcmToWav,
  clearAllBuffers,
  clearAudioCallback,
  getActiveBufferCount,
  type AudioBuffer,
  type CompletedAudio,
  type AudioCompleteCallback,
} from "./audio-receiver.ts";

export {
  // Transcription (STT)
  configureWhisperSTT,
  isWhisperConfigured,
  transcribeAudio,
  transcribeAudioBase64,
  storeTempAudio,
  getTempAudio,
  type TranscriptionResult,
  type WhisperConfig,
} from "./transcription.ts";

export {
  // Voice Commands (Main Integration)
  // Note: TTS uses ElevenLabs if configured, otherwise Discord's native TTS
  configureVoiceCommands,
  clearVoiceCommands,
  configureVoiceWhisper,
  configureElevenLabs,
  isElevenLabsConfigured,
  isVoiceEnabled,
  startVoiceSession,
  stopVoiceSession,
  hasActiveSession,
  getSessionInfo,
  getAllSessions,
  stopAllSessions,
  joinUserChannel,
  isTTSEnabled,
  configureTTS,
  type VoiceConfig,
  type VoiceCommandHandler,
} from "./voice-commands.ts";
