-- ATK transaction_id is an unsigned 64-bit integer. PostgreSQL BIGINT is signed
-- and JavaScript Number cannot represent all uint64 values exactly.
ALTER TABLE public.fiskalo_atk_fiscal_documents
  ALTER COLUMN atk_transaction_id TYPE NUMERIC(20, 0)
  USING atk_transaction_id::NUMERIC(20, 0);
