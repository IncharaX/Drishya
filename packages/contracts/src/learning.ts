import { z } from "zod";
export const learningContentSchema = z.object({
  qna: z
    .array(
      z.object({
        question: z.string().min(5).max(350),
        answer: z.string().min(8).max(1500),
      }),
    )
    .min(3)
    .max(8),
  quiz: z
    .array(
      z.object({
        question: z.string().min(5).max(350),
        options: z.array(z.string().min(1).max(240)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(8).max(1200),
      }),
    )
    .min(3)
    .max(8),
});
export type LearningContent = z.infer<typeof learningContentSchema>;
