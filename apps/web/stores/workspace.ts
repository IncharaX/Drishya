import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { PlanRequest } from "@drishya/contracts";

type WorkspaceState = {
  topic: string;
  language: PlanRequest["language"];
  level: PlanRequest["level"];
  approach: PlanRequest["approach"];
  targetDurationSeconds: number;
  activeProjectId: string | null;
  savedAt: string | null;
  setTopic: (topic: string) => void;
  setLanguage: (language: PlanRequest["language"]) => void;
  setLevel: (level: PlanRequest["level"]) => void;
  setApproach: (approach: PlanRequest["approach"]) => void;
  setTargetDuration: (seconds: number) => void;
  openProject: (id: string | null) => void;
  saveDraft: () => void;
  reset: () => void;
};

export const createWorkspaceStore = (userId: string) =>
  createStore<WorkspaceState>()(
    persist(
      (set) => ({
        topic: "",
        language: "en",
        level: "beginner",
        approach: "lesson",
        targetDurationSeconds: 60,
        activeProjectId: null,
        savedAt: null,
        setTopic: (topic) => set({ topic, savedAt: null }),
        setLanguage: (language) => set({ language, savedAt: null }),
        setLevel: (level) => set({ level, savedAt: null }),
        setApproach: (approach) => set({ approach, savedAt: null }),
        setTargetDuration: (targetDurationSeconds) =>
          set({ targetDurationSeconds, savedAt: null }),
        openProject: (activeProjectId) => set({ activeProjectId }),
        saveDraft: () => set({ savedAt: new Date().toISOString() }),
        reset: () =>
          set({
            topic: "",
            language: "en",
            level: "beginner",
            approach: "lesson",
            targetDurationSeconds: 60,
            activeProjectId: null,
            savedAt: null,
          }),
      }),
      {
        name: `drishya-workspace:${userId}`,
        skipHydration: true,
        partialize: ({
          topic,
          language,
          level,
          approach,
          targetDurationSeconds,
          activeProjectId,
          savedAt,
        }) => ({
          topic,
          language,
          savedAt,
          level,
          approach,
          targetDurationSeconds,
          activeProjectId,
        }),
      },
    ),
  );
