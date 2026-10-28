"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { projectError } from "@/lib/projects";
export function FeedbackCard({ revisionId }: { revisionId: string }) {
  const client = useQueryClient(),
    [rating, setRating] = useState(0),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: ["feedback", revisionId],
    queryFn: async () =>
      (await api.get(`/projects/video-features/${revisionId}/feedback`))
        .data as { rating: number; message: string } | null,
  });
  useEffect(() => {
    if (query.data) {
      setRating(query.data.rating);
      setMessage(query.data.message);
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/projects/video-features/${revisionId}/feedback`, {
        rating,
        message,
      }),
    onSuccess: () => {
      setEditing(false);
      void client.invalidateQueries({ queryKey: ["feedback", revisionId] });
    },
  });
  return (
    <section className="v2-feature-card" aria-label="Video feedback">
      <h3>How was this video?</h3>
      {query.data && !editing ? (
        <p>
          Thanks for your feedback · {query.data.rating}/5{" "}
          <button
            className="v2-text-button"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit feedback
          </button>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="v2-stars" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                aria-pressed={rating === star}
                onClick={() => setRating(star)}
              >
                <Star size={25} fill={star <= rating ? "#ed718a" : "none"} />
              </button>
            ))}
          </fieldset>
          <label>
            Your feedback
            <textarea
              rows={2}
              maxLength={3000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What worked, and what could be better?"
            />
          </label>
          <button
            type="submit"
            className="v2-button"
            disabled={!rating || save.isPending}
          >
            {" "}
            {save.isPending ? "Saving…" : "Send feedback"}
          </button>
        </form>
      )}
      {(save.isError || query.isError) && (
        <p role="alert" className="v2-error">
          {projectError(save.error ?? query.error)}
        </p>
      )}
    </section>
  );
}
