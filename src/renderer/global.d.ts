import type { AuntieBridge } from '../preload/index';

declare global {
  interface Window {
    auntie: AuntieBridge;
  }
}

export {};
