-- Finish checking rows that predate the existing Makati bounding-box rule.
-- This validates existing coordinates without moving or replacing report pins.
alter table public.reports
    validate constraint reports_within_makati_bbox;
