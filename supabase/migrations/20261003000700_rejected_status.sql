-- KAMOTI: a report that cannot be fixed can be closed as rejected (SW-7)
--
-- Staff assigned to a report under review or in progress ask for it to be
-- rejected, with a required reason; an administrator approves or returns the
-- request, the same way as a resolution (SW-4). The request columns from
-- 20261003000400_workflow.sql already accept closure_outcome = 'rejected'.
--
-- Only the enum value is added here. Postgres refuses to use a new enum value in
-- the transaction that adds it, so the public view that reads it is in the next
-- migration. A rejected report keeps resolved_at null: the existing check ties
-- resolved_at to 'resolved' alone, and verified_at records when it was closed.

alter type report_status add value if not exists 'rejected';
