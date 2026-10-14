-- KI-05: confirm the Makati demo citizens that the accounts migration left pending.
-- Run once in the SQL editor of the documented presentation Supabase project,
-- after the read-only preview in docs/LOCAL_DEV.md. A second run changes nothing.
--
-- The PR 43 dataset predates the current generator, so seed:apply refuses it
-- (fingerprint check). This touches only accounts with the makati-demo-v1 Auth
-- marker, and only citizens with no status or pending without a proof. Rejected
-- citizens and uploaded proofs are left as they are.
begin;

create temporary table demo_citizen_ids on commit drop as
select u.id
from auth.users u
join profiles p on p.id = u.id
where u.raw_app_meta_data->>'demo_dataset' = 'makati-demo-v1'
  and p.role = 'citizen';

do $$
declare
  found integer := (select count(*) from demo_citizen_ids);
begin
  if found <> 30 then
    raise exception 'Expected the 30 makati-demo-v1 citizens, found %. Nothing was changed.', found;
  end if;
end;
$$;

update profiles p
set residency_status = 'verified'
from demo_citizen_ids d
where p.id = d.id
  and (p.residency_status is null
    or (p.residency_status = 'pending' and p.residency_proof_path is null));

-- Expected after the update: one row, verified | 30.
select p.residency_status, count(*)
from profiles p
join demo_citizen_ids d using (id)
group by p.residency_status;

commit;
