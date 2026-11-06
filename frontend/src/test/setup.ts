import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom has no canvas or ResizeObserver; the garden and charts only need them to exist.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
