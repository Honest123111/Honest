-- notes.created_by is "on delete set null"; it must be nullable or deleting a
-- user who wrote notes fails. (Insert policy still requires created_by = auth.uid().)
alter table public.notes alter column created_by drop not null;
