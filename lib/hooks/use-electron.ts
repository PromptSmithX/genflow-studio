"use client";

declare global {
  interface Window {
    electronAPI?: {
      openDirectory: () => Promise<string | null>;
    };
  }
}

export function useOpenDirectory(): () => Promise<string | null> {
  return async () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      return window.electronAPI.openDirectory();
    }
    return null;
  };
}
