-- KAMOTI: keep new report pins inside Makati (MP-2)
--
-- The API checks every pin against Makati's boundary polygon
-- (src/server/lib/makati.ts). Postgres cannot hold that polygon cheaply without
-- PostGIS, so this is the backstop for anything that reaches the table another way:
-- a bounding box around the polygon. A pin in Bataan or Manila fails it; a pin just
-- over the Taguig line can pass it, and the API refuses that one instead.
--
-- The box is MAKATI_BBOX (south 14.529651, west 120.998771, north 14.579500,
-- east 121.050072, from OpenStreetMap relation 103716 after the 2023 EMBO transfer)
-- widened by about 0.002 degrees (roughly 200 m) and rounded outward, so the
-- simplified polygon's rounding can never put a real Makati pin outside it.
-- tests/fast/makati.test.ts fails if these numbers stop containing MAKATI_BBOX.
--
-- NOT VALID: the constraint applies to every insert and update from now on, but
-- rows already in the table are not checked, so demo or test reports pinned
-- outside the city before this rule existed do not block the migration. An admin
-- can run `alter table reports validate constraint reports_within_makati_bbox;`
-- once those rows are corrected.

alter table reports
    add constraint reports_within_makati_bbox
    check (
        latitude  between 14.5276  and 14.5816
        and longitude between 120.9967 and 121.0521
    )
    not valid;
