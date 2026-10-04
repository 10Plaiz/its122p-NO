// Response shapes of the report submission endpoints (S3). Kept out of types.ts
// while other streams edit it; fold in during integration.

// src/server/services/reports.submission.ts — listProblemTypes
export type ProblemType = { id: number; name: string };
export type ProblemTypeGroup = { category_id: number; problem_types: ProblemType[] };

// src/server/routes/reports.submission.routes.ts — GET /meta/problem-types
export type ProblemTypesResponse = { groups: ProblemTypeGroup[] };

// A report's saved problems, as the edit form reads them from Report.primary_problem
// and secondary_problem. Both are null on reports filed before problem types existed.
export type ReportProblems = { primary: ProblemType | null; secondary: ProblemType | null };
