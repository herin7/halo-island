import { requireOptionalNativeModule } from 'expo';

export interface Shared { text?: string | null; uri?: string | null; name?: string | null; size?: number; mime?: string | null }

interface HaloDaily {
  pkce(): { verifier: string; challenge: string; state: string };
  load(key: string): string | null;
  save(key: string, value: string): void;
  hasStepSensor(): boolean;
  watchSteps(on: boolean): boolean;
  keepAlive(): void;
  copy(text: string): Promise<void>;
  paste(): Promise<string | null>;
  download(url: string, token: string, name: string, mime: string): Promise<string>;
  upload(uri: string, url: string, token: string): Promise<void>;
  open(uri: string, mime?: string | null): boolean;
  takeShared(): Shared | null;
  addListener(event: 'onSteps', fn: (e: { total: number }) => void): { remove(): void };
  addListener(event: 'onShare', fn: (e: Shared) => void): { remove(): void };
}

/** Null in Expo Go / web: features that need it switch off instead of crashing. */
export const native = requireOptionalNativeModule<HaloDaily>('HaloDaily');
