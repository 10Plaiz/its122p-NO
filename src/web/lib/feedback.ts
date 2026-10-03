import { api } from "./api.js";

// Citizen feedback on resolved reports (FB-1). Shapes mirror
// src/server/routes/feedback.routes.ts; fold into types.ts at integration.

// src/server/services/feedback.service.ts — FEEDBACK_FIELDS
export type Feedback = {
  id: string;
  report_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type FeedbackSummary = {
  staff_id: string | null;
  average: number | null;
  count: number;
};

export const RATINGS = [1, 2, 3, 4, 5] as const;
export type Rating = (typeof RATINGS)[number];

// A word for every number, so the scale reads the same to everyone and never
// depends on colour or a row of stars to carry its meaning.
export const RATING_LABEL: Record<Rating, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very good",
  5: "Excellent",
};

export const FEEDBACK_COMMENT_MAX = 500;

export function ratingLabel(rating: number) {
  return RATING_LABEL[rating as Rating] ?? "";
}

// Mirrors feedbackSchema on the server, message for message.
export function validateFeedback({ rating, comment }: { rating: number | null; comment: string }) {
  const errors: Record<string, string> = {};
  if (rating === null || !RATINGS.includes(rating as Rating)) errors.rating = "Choose a rating from 1 to 5.";
  if (comment.trim().length > FEEDBACK_COMMENT_MAX) errors.comment = "Keep the comment under 500 characters.";
  return errors;
}

export const feedbackPath = (reportId: string) => `/feedback/${reportId}`;
export const FEEDBACK_SUMMARY_PATH = "/feedback/summary/staff";

export function submitFeedback(reportId: string, input: { rating: number; comment?: string }) {
  return api.post<{ feedback: Feedback }>(feedbackPath(reportId), input);
}
