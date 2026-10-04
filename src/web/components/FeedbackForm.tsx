import { useCallback, useEffect, useState } from "react";
import type { FocusEvent, FormEvent } from "react";
import { Alert, Button, Field, Loading, Textarea } from "./ui.js";
import { RatingDisplay } from "./FeedbackSummary.js";
import { useAction, useApi } from "../lib/useApi.js";
import {
  FEEDBACK_COMMENT_MAX,
  RATINGS,
  RATING_LABEL,
  feedbackPath,
  submitFeedback,
  validateFeedback,
} from "../lib/feedback.js";
import type { Feedback, Rating } from "../lib/feedback.js";
import type { Report } from "../lib/types.js";

// FB-1: the reporter rates the repair of their resolved report. One rating per
// report and it cannot be changed, so once it exists the form gives way to a
// read-only view of it. Render it for the report's owner only; the API refuses
// anyone else.
export function FeedbackForm({ report }: { report: Pick<Report, "id" | "status" | "assigned_staff"> }) {
  const resolved = report.status === "resolved";
  const { data, error, loading, reload } = useApi<{ feedback: Feedback | null }>(
    resolved ? feedbackPath(report.id) : null,
  );
  const [saved, setSaved] = useState<Feedback | null>(null);
  // Mounted for as long as the section is, so the change from form to read-only
  // view is announced rather than happening silently.
  const [notice, setNotice] = useState<{ reportId: string; text: string } | null>(null);

  // Stable, because the form calls it from an effect.
  const handleAlreadyRated = useCallback(
    (message: string) => {
      setNotice({ reportId: report.id, text: message });
      reload();
    },
    [reload, report.id],
  );

  if (!resolved) return null;

  // The page stays mounted when only the report id in the URL changes, so local
  // state is used only while it still belongs to the report on screen.
  // useApi keeps the previous response while the next one loads.
  const ours = (item: Feedback | null | undefined) => (item?.report_id === report.id ? item : null);
  const feedback = ours(saved) ?? ours(data?.feedback);
  const announcement = notice?.reportId === report.id ? notice.text : "";

  return (
    <section aria-labelledby="feedback-title" className="flex flex-col gap-3 border-t border-divider pt-3">
      <h6 id="feedback-title" className="!m-0">
        {feedback ? "Your rating" : "Rate the repair"}
      </h6>

      <p role="status" aria-live="polite" className={announcement ? "text-[13px] !m-0" : "sr-only"}>
        {announcement}
      </p>

      {loading && !feedback ? (
        <Loading label="Loading your rating" />
      ) : error && !feedback ? (
        <Alert title="Could not load your rating">{error.message}</Alert>
      ) : feedback ? (
        <RatingDisplay feedback={feedback} />
      ) : (
        <RatingForm
          key={report.id}
          reportId={report.id}
          onSaved={(created) => {
            setSaved(created);
            setNotice({
              reportId: report.id,
              text: report.assigned_staff
                ? "Thank you. Your rating was sent to the staff member who handled this report."
                : "Thank you. Your rating was saved.",
            });
          }}
          onAlreadyRated={handleAlreadyRated}
        />
      )}
    </section>
  );
}

function RatingForm({
  reportId,
  onSaved,
  onAlreadyRated,
}: {
  reportId: string;
  onSaved: (feedback: Feedback) => void;
  onAlreadyRated: (message: string) => void;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState("");
  // The rating's error appears once focus leaves the group without a choice,
  // which is what explains the disabled button (the one form rule, KR-07).
  const [ratingLeft, setRatingLeft] = useState(false);

  const { run, pending, error } = useAction((input: { rating: number; comment?: string }) =>
    submitFeedback(reportId, input),
  );

  // Rated in another tab, or a double submit: show the rating that already exists.
  useEffect(() => {
    if (error?.status === 409) onAlreadyRated(error.message);
  }, [error, onAlreadyRated]);

  const errors = validateFeedback({ rating, comment });
  const invalid = Object.keys(errors).length > 0;
  const server = error?.fieldErrors ?? {};
  const ratingError = server.rating ?? (ratingLeft ? errors.rating : undefined);
  const commentError = server.comment ?? errors.comment;
  const formError = error && error.status !== 409 && !server.rating && !server.comment ? error : null;

  function handleGroupBlur(event: FocusEvent<HTMLFieldSetElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRatingLeft(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid || rating === null) {
      setRatingLeft(true);
      return;
    }
    const result = await run({ rating, comment: comment.trim() || undefined });
    if (result) onSaved(result.feedback);
  }

  const ratingNoteId = "feedback-rating-note";

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-muted text-[13px] !m-0">
        Tell the team how the repair turned out. You can rate this report once, and the rating cannot be changed
        later.
      </p>

      <fieldset
        className="flex flex-col gap-1.5 border-0 p-0 m-0 min-w-0"
        aria-describedby={ratingNoteId}
        onBlur={handleGroupBlur}
        disabled={pending}
      >
        <legend className="text-[12px] mb-[5px] p-0 text-text/70">How well was the problem fixed?</legend>
        <div className="grid grid-cols-5 border border-divider">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="seg-opt flex-col justify-center text-center min-w-0 !gap-0.5 !px-1 !py-2 [touch-action:manipulation]"
            >
              <input
                type="radio"
                name="feedback-rating"
                id={`feedback-rating-${value}`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                aria-invalid={ratingError ? true : undefined}
              />
              <span className="font-mono text-[15px] font-semibold tabular-nums leading-none">{value}</span>
              <span className="text-[11px] leading-tight break-words">{RATING_LABEL[value]}</span>
            </label>
          ))}
        </div>
        <span
          id={ratingNoteId}
          role={ratingError ? "alert" : undefined}
          className={ratingError ? "text-[11px] text-danger" : "text-muted text-[11px]"}
        >
          {ratingError ??
            (rating === null ? "1 is poor, 5 is excellent." : `Selected: ${rating} out of 5, ${RATING_LABEL[rating]}.`)}
        </span>
      </fieldset>

      <Field
        label="Comment"
        htmlFor="feedback-comment"
        hint="Optional. The staff member who handled your report will see this."
        error={commentError}
        count={comment.length}
        max={FEEDBACK_COMMENT_MAX}
      >
        <Textarea
          id="feedback-comment"
          name="comment"
          rows={3}
          maxLength={FEEDBACK_COMMENT_MAX}
          autoComplete="off"
          placeholder="e.g. The pothole was filled and the road is smooth again…"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={pending}
        />
      </Field>

      {formError && <Alert title="Could not send your rating">{formError.message}</Alert>}

      <Button type="submit" variant="primary" className="self-start" disabled={pending || invalid}>
        {pending ? "Sending rating…" : "Send rating"}
      </Button>
    </form>
  );
}
