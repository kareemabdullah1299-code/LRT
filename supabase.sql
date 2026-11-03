-- LRT: إعداد قاعدة البيانات — شغّله مرة واحدة في Supabase > SQL Editor (قبل ملف import_all_linked.sql)
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  coll text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists records_coll_idx on public.records (coll);

alter table public.records enable row level security;
drop policy if exists "auth full access" on public.records;
create policy "auth full access" on public.records
  for all to authenticated using (true) with check (true);

-- التحديث اللحظي (Realtime)
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- بعد التشغيل: Authentication > Users > Add user (إيميل + كلمة سر) لكل واحد هيدخل التطبيق.
