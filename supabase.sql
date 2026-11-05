-- LRT Fleet v2: شغّل الملف ده كله مرة واحدة في Supabase > SQL Editor > New query > Run
-- (آمن لو شغلته تاني، مش هيمسح بيانات)

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  coll text not null,   -- vehicles, drivers, fines, kmlogs, trips, custody, allocs, expenses, returns
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists records_coll_idx on public.records (coll);

-- الجدول نفسه: للمدير المسجّل بس (الزائر العادي ما يقدرش يقراه)
alter table public.records enable row level security;
drop policy if exists "auth select" on public.records;
drop policy if exists "auth insert" on public.records;
drop policy if exists "auth update" on public.records;
drop policy if exists "auth delete" on public.records;
create policy "auth select" on public.records for select to authenticated using (true);
create policy "auth insert" on public.records for insert to authenticated with check (true);
create policy "auth update" on public.records for update to authenticated using (true) with check (true);
create policy "auth delete" on public.records for delete to authenticated using (true);

-- التقارير العامة: الزائر بيجيب نسخة مصغّرة من البيانات بدون أي حاجة حساسة
-- (من غير: تليفونات، رقم/انتهاء رخصة السواق، مبالغ المخالفات والبدلات، ملاحظات، العهدة، الفواتير)
create or replace function public.public_data() returns jsonb
language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_object_agg(coll, items), '{}'::jsonb) from (
    select coll,
      jsonb_agg(
        jsonb_build_object('id', id) ||
        case coll
          when 'drivers' then data - 'phone' - 'licNo' - 'licExp'
          when 'fines'   then data - 'amount' - 'notes'
          when 'trips'   then data - 'amount' - 'notes' - 'paid'
          else data end
      ) as items
    from public.records
    where coll in ('vehicles','drivers','fines','kmlogs','trips')
    group by coll
  ) t
$$;
revoke all on function public.public_data() from public;
grant execute on function public.public_data() to anon, authenticated;

-- التحديث اللحظي (آمن حتى لو الجدول مضاف قبل كده)
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when others then null;
end $$;

-- بعد التشغيل:
-- 1) Authentication > Providers > Email: اقفل "Allow new users to sign up".
-- 2) Authentication > Users > Add user: أضف إيميل وباسورد مدير التشغيل (فعّل Auto Confirm).
-- 3) Project Settings > API: انسخ Project URL و anon public key وحطهم في أول app.js.
--    استخدم anon key فقط. متستخدمش service_role أبدا.
