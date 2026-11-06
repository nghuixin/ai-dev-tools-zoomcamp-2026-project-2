export interface Garden {
  dropStar(message: (dogName: string) => string, forced?: number): string;
  setCoat(coat: string): void;
  readonly muted: boolean;
  readonly music: boolean;
  setMuted(v: boolean): void;
  setMusic(v: boolean): void;
  sakura(): void;
  destroy(): void;
}

export interface GardenPrefs {
  muted: boolean;
  music: boolean;
  lastDog: number;
  collapsed: boolean;
}

export function createGarden(
  canvas: HTMLCanvasElement,
  opts: { coat: string; caught: number; waiting: number; onCatch: () => void },
): Garden;
export function loadPrefs(): GardenPrefs;
export function savePrefs(p: GardenPrefs): void;
export const BRIDGE_DOG_NAMES: string[];
