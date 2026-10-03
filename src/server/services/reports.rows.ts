import { REPORT_FIELDS } from "./reports.common.js";

// The columns behind the report tables and their exports (B6): every report field,
// plus the reporter's rating. The rating is joined here, not in REPORT_FIELDS,
// because single-report reads have their own feedback endpoint and gain nothing
// from the extra join. report_feedback.report_id is unique, so PostgREST returns
// the rating as an object or null.
export const REPORT_ROW_FIELDS = `${REPORT_FIELDS},
  feedback:report_feedback ( rating )`;
