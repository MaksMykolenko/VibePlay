export { VibePlayGameSdk, initVibePlaySdk } from './sdk-entry.js';
export type { SaveSetOptions, VibePlaySaveApi, LocalSaveProvider } from './sdk-entry.js';
export { GameBridge } from './host.js';
export type { GameBridgeEvents, GameBridgeOptions, HostSaveAdapter } from './host.js';
// Re-export the save protocol types games/host commonly need.
export type {
  SaveResultPayload,
  SaveResultCode,
  SaveStatusInfo,
  SaveSetPayload,
  LocalSaveAvailablePayload,
  LocalSaveProvidedPayload,
  ProgressPayload,
} from '@vibeplay/shared/sdk-protocol';
