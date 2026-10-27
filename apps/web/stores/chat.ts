"use client";
import { create } from "zustand";

type ComposerState = {
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  clear: (key: string) => void;
};
export const useComposer = create<ComposerState>((set) => ({
  drafts: {},
  setDraft: (key, text) =>
    set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
  clear: (key) => set((state) => ({ drafts: { ...state.drafts, [key]: "" } })),
}));
