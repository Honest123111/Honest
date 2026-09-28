-- Re-running an import preview replaces its staged rows; Acquisitions need to
-- delete staged (uncommitted) rows, not just admins.
create policy "import_rows: writer delete staged" on public.import_rows
  for delete to authenticated
  using (private.can_write() and committed_at is null);
