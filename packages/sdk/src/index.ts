export { VibePlayGameSdk, initVibePlaySdk } from './sdk-entry.js';
export type {
  SaveSetOptions,
  VibePlaySaveApi,
  VibePlayAnalyticsApi,
  VibePlayRoomsApi,
  LocalSaveProvider,
} from './sdk-entry.js';
export { GameBridge } from './host.js';
export type {
  GameBridgeEvents,
  GameBridgeOptions,
  HostSaveAdapter,
  RoomTokenProvider,
} from './host.js';
// Re-export the save + room protocol types games/host commonly need.
export type {
  SaveResultPayload,
  SaveResultCode,
  SaveStatusInfo,
  SaveSetPayload,
  LocalSaveAvailablePayload,
  LocalSaveProvidedPayload,
  ProgressPayload,
  AnalyticsErrorPayload,
  AnalyticsCustomEventPayload,
  RoomContextPayload,
  RoomTokenPayload,
} from '@vibeplay/shared/sdk-protocol';
