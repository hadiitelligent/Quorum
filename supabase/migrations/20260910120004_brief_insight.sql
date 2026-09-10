-- =============================================================================
-- Quorum — the insight
-- =============================================================================
-- When a standing brief is saved, the app extracts a structured snapshot of
-- the business from it (lib/board/insight.ts): overview, assets, liabilities,
-- cash and runway, overheads, targets, pipeline, valuation. The Business page
-- renders it. Kept with the brief; private to the person like the brief.
-- =============================================================================

alter table public.briefs
  add column insight jsonb not null default '{}'::jsonb check (jsonb_typeof(insight) = 'object'),
  add column insight_model text,
  add column insight_error text not null default '';
