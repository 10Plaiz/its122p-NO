import { Alert, Loading, formatDateTime } from "./ui.js";
import { useApi } from "../lib/useApi.js";
import { FEEDBACK_SUMMARY_PATH, RATINGS, feedbackPath, ratingLabel } from "../lib/feedback.js";
import type { Feedback, FeedbackSummary as Summary } from "../lib/feedback.js";
import type { Report } from "../lib/types.js";

// The reporter's rating of a resolved report, read-only, for the assigned staff
// member and admins (FB-1). The API decides who may read it.
export function FeedbackSummary({ report }: { report: Pick<Report, "id" | "status"> }) {
  const resolved = report.status === "resolved";
  const { data, error, loading } = useApi<{ feedback: Feedback | null }>(resolved ? feedbackPath(report.id) : null);

  // Only a resolved report can be rated, so there is nothing to show before then.
  if (!resolved) return null;

  return (
    <section aria-labelledby="feedback-summary-title" className="flex flex-col gap-3">
      <h6 id="feedback-summary-title" className="!m-0">
        Reporter&rsquo;s rating
      </h6>
      {loading ? (
        <Loading label="Loading the rating" />
      ) : error ? (
        <Alert title="Could not load the rating">{error.message}</Alert>
      ) : data?.feedback ? (
        <RatingDisplay feedback={data.feedback} />
      ) : (
        <p className="text-muted text-[13px] !m-0">
          The reporter has not rated this report yet. You will be notified when they do.
        </p>
      )}
    </section>
  );
}

// One rating as text first ("4 out of 5 · Very good"), with a row of five squares
// beside it as a quick visual read. The squares are hidden from screen readers
// because the text already says everything they show.
export function RatingDisplay({ feedback }: { feedback: Feedback }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-3 flex-wrap">
        <RatingMeter rating={feedback.rating} />
        <p className="!m-0 text-[14px]">
          <strong className="tabular-nums">{feedback.rating} out of 5</strong>
          <span className="text-muted"> &middot; {ratingLabel(feedback.rating)}</span>
        </p>
      </div>
      {feedback.comment ? (
        <blockquote className="m-0 border-l-2 border-divider pl-3 text-[13px] leading-relaxed whitespace-pre-line break-words">
          {feedback.comment}
        </blockquote>
      ) : (
        <p className="text-muted text-[13px] !m-0">No comment was left.</p>
      )}
      <p className="font-mono text-[10px] text-muted !m-0">Rated {formatDateTime(feedback.created_at)}</p>
    </div>
  );
}

function RatingMeter({ rating }: { rating: number }) {
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {RATINGS.map((step) => (
        <span
          key={step}
          className={`block size-3 border border-neutral-800 ${step <= rating ? "bg-neutral-800" : ""}`.trim()}
        />
      ))}
    </span>
  );
}

const averageFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

// A staff member's average rating. Staff always see their own; an admin passes
// `staffId` for one staff member or leaves it out for every rating.
export function RatingAverage({ staffId }: { staffId?: string }) {
  const { data, error, loading } = useApi<{ summary: Summary }>(FEEDBACK_SUMMARY_PATH, { staff_id: staffId });

  if (loading) return <Loading label="Loading ratings" />;
  if (error) return <Alert title="Could not load ratings">{error.message}</Alert>;
  if (!data) return null;

  const { average, count } = data.summary;
  if (average === null || count === 0) {
    return <p className="text-muted text-[13px] !m-0">No ratings yet.</p>;
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <RatingMeter rating={Math.round(average)} />
      <p className="!m-0 text-[14px]">
        <strong className="tabular-nums">{averageFormat.format(average)} out of 5</strong>
        <span className="text-muted">
          {" "}
          &middot; average of {count} {count === 1 ? "rating" : "ratings"}
        </span>
      </p>
    </div>
  );
}
