-- Allow the fiscal ledger to record an HTTP-success response that lacks a valid ATK transaction ID.
-- This is not an acceptance; it remains an unconfirmed state requiring reconciliation.
alter table public.fiskalo_atk_fiscal_events
  drop constraint if exists fiskalo_atk_fiscal_events_event_type_check;
alter table public.fiskalo_atk_fiscal_events
  add constraint fiskalo_atk_fiscal_events_event_type_check
  check (event_type = any (array[
    'created','queued','offline_saved','submission_started','accepted',
    'rejected','retry_scheduled','cancelled','response_unconfirmed'
  ]::text[]));
