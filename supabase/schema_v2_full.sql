-- 2KC Centre de Santé - Supabase/PostgreSQL schema (v2, complete)
-- Copy/paste into Supabase SQL editor.

create extension if not exists pgcrypto;
create schema if not exists app;

-- ===================== ENUMS =====================

do $$ begin
  create type app.user_role as enum (
    'admin','medecin','infirmier','secretaire','comptable','pharmacien','directeur','patient'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.appointment_status as enum ('en_attente','confirme','annule','termine');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.invoice_status as enum ('brouillon','emise','partielle','payee','annulee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.payment_method as enum ('cash','mobile_money','card','bank_transfer');
exception when duplicate_object then null; end $$;

-- ===================== HELPERS =====================

create or replace function app.uid() returns uuid
language sql stable as $$
  select auth.uid();
$$;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ===================== PROFILES (AUTH -> APP) =====================

create table if not exists app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app.user_role not null,
  full_name text not null,
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on app.profiles(role);

drop trigger if exists set_profiles_updated_at on app.profiles;
create trigger set_profiles_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

create or replace function app.current_role() returns app.user_role
language sql stable security definer
set search_path = app, public
as $$
  select coalesce(
    (select p.role from app.profiles p where p.user_id = auth.uid()),
    nullif((current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'), '')::app.user_role,
    'patient'::app.user_role
  );
$$;

grant execute on function app.current_role() to anon, authenticated;

create or replace function app.is_admin() returns boolean
language sql stable as $$
  select app.current_role() = 'admin'::app.user_role;
$$;

create or replace function app.has_role(r app.user_role) returns boolean
language sql stable as $$
  select app.current_role() = r;
$$;

create or replace function app.has_any_role(roles app.user_role[]) returns boolean
language sql stable as $$
  select app.current_role() = any(roles);
$$;

-- Auto-create profile on signup
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer as $$
declare
  v_first text;
  v_last text;
  v_sex text;
  v_birth date;
  v_blood text;
  v_pid uuid;
  v_full_name text;
  v_role app.user_role;
begin
  insert into app.profiles (user_id, role, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'role','')::app.user_role, 'patient'::app.user_role),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  v_role := coalesce(nullif(new.raw_user_meta_data->>'role','')::app.user_role, 'patient'::app.user_role);
  if v_role = 'patient'::app.user_role then
    if not exists (select 1 from app.patient_accounts pa where pa.user_id = new.id) then
      v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
      v_first := coalesce(nullif(new.raw_user_meta_data->>'first_name',''), split_part(v_full_name, ' ', 1), 'Patient');
      v_last := coalesce(nullif(new.raw_user_meta_data->>'last_name',''), nullif(regexp_replace(v_full_name, '^[^ ]+\s*', ''),''), 'Inscrit');
      v_sex := nullif(new.raw_user_meta_data->>'sex','');
      if v_sex not in ('M','F') then v_sex := null; end if;
      begin
        v_birth := nullif(new.raw_user_meta_data->>'birth_date','')::date;
      exception when others then
        v_birth := null;
      end;
      v_blood := nullif(new.raw_user_meta_data->>'blood_type','');
      if v_blood not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then v_blood := null; end if;

      insert into app.patients (
        first_name, last_name, sex, birth_date, blood_type, phone, address,
        allergies, chronic_conditions, emergency_contact_name, emergency_contact_phone, created_by
      )
      values (
        v_first, v_last, v_sex, v_birth, v_blood,
        nullif(new.raw_user_meta_data->>'phone',''),
        nullif(new.raw_user_meta_data->>'address',''),
        coalesce(array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'allergies', '[]'::jsonb))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'chronic_conditions', '[]'::jsonb))), '{}'),
        nullif(new.raw_user_meta_data->>'emergency_contact_name',''),
        nullif(new.raw_user_meta_data->>'emergency_contact_phone',''),
        new.id
      )
      returning id into v_pid;

      insert into app.patient_accounts (user_id, patient_id)
      values (new.id, v_pid)
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end $$;

-- NOTE: If your Supabase project forbids triggers on auth.users in SQL Editor,
-- create this trigger from a privileged migration or skip it and create profiles manually.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

-- ===================== AUTH SECURITY (LOCKOUT) =====================

create table if not exists app.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  attempts int not null default 0,
  locked_until timestamptz null,
  last_failed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

drop trigger if exists set_login_attempts_updated_at on app.login_attempts;
create trigger set_login_attempts_updated_at
before update on app.login_attempts
for each row execute function app.set_updated_at();

-- ===================== PATIENTS =====================

create table if not exists app.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null unique,
  first_name text not null,
  last_name text not null,
  sex text null check (sex in ('M','F')),
  birth_date date null,
  phone text null,
  address text null,
  emergency_contact_name text null,
  emergency_contact_phone text null,
  insurance_provider text null,
  insurance_number text null,
  allergies text[] not null default '{}',
  chronic_conditions text[] not null default '{}',
  created_by uuid null references app.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add blood group (if missing)
do $$ begin
  alter table app.patients add column blood_type text null check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-'));
exception when duplicate_column then null; end $$;

create index if not exists patients_name_idx on app.patients (last_name, first_name);
create index if not exists patients_phone_idx on app.patients (phone);

drop trigger if exists set_patients_updated_at on app.patients;
create trigger set_patients_updated_at
before update on app.patients
for each row execute function app.set_updated_at();

create or replace function app.gen_patient_code() returns trigger
language plpgsql as $$
declare
  yy text;
  mm text;
  seq int;
begin
  yy := to_char(now(), 'YY');
  mm := to_char(now(), 'MM');
  select coalesce(max(substring(patient_code from 8)::int),0) + 1
    into seq
  from app.patients
  where patient_code like ('2KC' || yy || mm || '%');

  new.patient_code := '2KC' || yy || mm || lpad(seq::text, 4, '0');
  return new;
end $$;

drop trigger if exists gen_patient_code on app.patients;
create trigger gen_patient_code
before insert on app.patients
for each row when (new.patient_code is null)
execute function app.gen_patient_code();

create table if not exists app.patient_accounts (
  user_id uuid primary key references app.profiles(user_id) on delete cascade,
  patient_id uuid not null unique references app.patients(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function app.ensure_patient_account_self()
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile app.profiles%rowtype;
  v_patient_id uuid;
  v_full_name text;
  v_first text;
  v_last text;
begin
  if v_uid is null then
    raise exception 'Utilisateur non connecté.';
  end if;

  select * into v_profile
  from app.profiles
  where user_id = v_uid;

  if not found or v_profile.role <> 'patient'::app.user_role then
    raise exception 'Ce compte n''est pas un compte patient.';
  end if;

  select patient_id into v_patient_id
  from app.patient_accounts
  where user_id = v_uid;

  if v_patient_id is not null then
    return v_patient_id;
  end if;

  v_full_name := coalesce(nullif(v_profile.full_name, ''), 'Patient Inscrit');
  v_first := coalesce(nullif(split_part(v_full_name, ' ', 1), ''), 'Patient');
  v_last := coalesce(nullif(regexp_replace(v_full_name, '^[^ ]+\s*', ''), ''), 'Inscrit');

  insert into app.patients (first_name, last_name, created_by)
  values (v_first, v_last, v_uid)
  returning id into v_patient_id;

  insert into app.patient_accounts (user_id, patient_id)
  values (v_uid, v_patient_id)
  on conflict (user_id) do update set patient_id = excluded.patient_id;

  return v_patient_id;
end $$;

grant execute on function app.ensure_patient_account_self() to authenticated;

-- ===================== APPOINTMENTS =====================

create table if not exists app.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid null references app.profiles(user_id),
  scheduled_at timestamptz not null,
  status app.appointment_status not null default 'en_attente',
  reason text null,
  created_by uuid null references app.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_unique_practitioner_time unique (practitioner_id, scheduled_at)
);

create index if not exists appointments_patient_idx on app.appointments(patient_id, scheduled_at desc);
create index if not exists appointments_practitioner_idx on app.appointments(practitioner_id, scheduled_at desc);

drop trigger if exists set_appointments_updated_at on app.appointments;
create trigger set_appointments_updated_at
before update on app.appointments
for each row execute function app.set_updated_at();

-- ===================== DME / CONSULTATIONS =====================

create table if not exists app.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid not null references app.profiles(user_id),
  appointment_id uuid null references app.appointments(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  symptoms text null,
  chief_complaint text null,
  diagnosis text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists consultations_patient_idx on app.consultations(patient_id, started_at desc);

create table if not exists app.vitals (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references app.consultations(id) on delete cascade,
  measured_by uuid not null references app.profiles(user_id),
  measured_at timestamptz not null default now(),
  temperature_c numeric(4,1) null,
  systolic int null,
  diastolic int null,
  pulse int null,
  weight_kg numeric(5,2) null,
  height_cm numeric(5,1) null,
  spo2 int null,
  comment text null
);

create index if not exists vitals_consultation_idx on app.vitals(consultation_id, measured_at desc);

-- ===================== PRESCRIPTIONS + DISPENSATIONS =====================

create table if not exists app.prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references app.consultations(id) on delete cascade,
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid not null references app.profiles(user_id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','fulfilled','cancelled'))
);

create index if not exists prescriptions_patient_idx on app.prescriptions(patient_id, created_at desc);

create table if not exists app.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references app.prescriptions(id) on delete cascade,
  medicine_name text not null,
  dosage text null,
  frequency text null,
  duration text null,
  instructions text null
);

create table if not exists app.dispensations (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references app.prescriptions(id) on delete cascade,
  dispensed_by uuid not null references app.profiles(user_id),
  dispensed_at timestamptz not null default now(),
  notes text null
);

-- ===================== EXAMS =====================

create table if not exists app.exam_orders (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references app.consultations(id) on delete cascade,
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid not null references app.profiles(user_id),
  exam_type text not null,
  priority text not null default 'routine' check (priority in ('routine','urgent')),
  status text not null default 'ordered' check (status in ('ordered','in_progress','done','cancelled')),
  notes text null,
  created_at timestamptz not null default now()
);

create table if not exists app.exam_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references app.exam_orders(id) on delete cascade,
  result_summary text null,
  result_payload jsonb null,
  file_url text null,
  created_at timestamptz not null default now()
);

-- ===================== STOCKS =====================

create table if not exists app.stock_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pharmacy','consumable')),
  name text not null,
  category text null,
  unit text null,
  stock int not null default 0,
  threshold int not null default 0,
  unit_price numeric(12,2) not null default 0,
  expiry_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_items_kind_idx on app.stock_items(kind);
create index if not exists stock_items_name_idx on app.stock_items(name);

drop trigger if exists set_stock_items_updated_at on app.stock_items;
create trigger set_stock_items_updated_at
before update on app.stock_items
for each row execute function app.set_updated_at();

create table if not exists app.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references app.stock_items(id) on delete cascade,
  moved_by uuid not null references app.profiles(user_id),
  moved_at timestamptz not null default now(),
  delta int not null,
  reason text null,
  meta jsonb null
);

create index if not exists stock_movements_item_idx on app.stock_movements(item_id, moved_at desc);

-- ===================== BILLING =====================

create table if not exists app.invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references app.patients(id) on delete cascade,
  consultation_id uuid null references app.consultations(id) on delete set null,
  invoice_no text not null unique,
  status app.invoice_status not null default 'emise',
  currency text not null default 'XAF',
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid null references app.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_patient_idx on app.invoices(patient_id, created_at desc);

drop trigger if exists set_invoices_updated_at on app.invoices;
create trigger set_invoices_updated_at
before update on app.invoices
for each row execute function app.set_updated_at();

create or replace function app.gen_invoice_no() returns trigger
language plpgsql as $$
declare
  yy text;
  mm text;
  seq int;
begin
  yy := to_char(now(), 'YY');
  mm := to_char(now(), 'MM');
  select coalesce(max(substring(invoice_no from 8)::int),0) + 1
    into seq
  from app.invoices
  where invoice_no like ('INV' || yy || mm || '%');

  new.invoice_no := 'INV' || yy || mm || lpad(seq::text, 5, '0');
  return new;
end $$;

drop trigger if exists gen_invoice_no on app.invoices;
create trigger gen_invoice_no
before insert on app.invoices
for each row when (new.invoice_no is null)
execute function app.gen_invoice_no();

create table if not exists app.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references app.invoices(id) on delete cascade,
  label text not null,
  qty int not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) generated always as (qty * unit_price) stored
);

create index if not exists invoice_items_invoice_idx on app.invoice_items(invoice_id);

create or replace function app.recalc_invoice_totals(p_invoice_id uuid) returns void
language plpgsql as $$
declare
  s numeric(12,2);
begin
  select coalesce(sum(line_total),0) into s
  from app.invoice_items
  where invoice_id = p_invoice_id;

  update app.invoices
  set subtotal = s,
      total = s
  where id = p_invoice_id;
end $$;

create or replace function app.invoice_items_after_change() returns trigger
language plpgsql as $$
begin
  perform app.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end $$;

drop trigger if exists invoice_items_after_ins on app.invoice_items;
drop trigger if exists invoice_items_after_upd on app.invoice_items;
drop trigger if exists invoice_items_after_del on app.invoice_items;

create trigger invoice_items_after_ins after insert on app.invoice_items
for each row execute function app.invoice_items_after_change();
create trigger invoice_items_after_upd after update on app.invoice_items
for each row execute function app.invoice_items_after_change();
create trigger invoice_items_after_del after delete on app.invoice_items
for each row execute function app.invoice_items_after_change();

create table if not exists app.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references app.invoices(id) on delete cascade,
  method app.payment_method not null,
  amount numeric(12,2) not null,
  currency text not null default 'XAF',
  transaction_ref text null,
  received_at timestamptz not null default now(),
  received_by uuid null references app.profiles(user_id)
);

create index if not exists payments_invoice_idx on app.payments(invoice_id, received_at desc);

-- ===================== AUDIT LOG =====================

create table if not exists app.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references app.profiles(user_id),
  actor_role app.user_role null,
  action text not null,
  target_table text null,
  target_id uuid null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on app.audit_logs(created_at desc);
create index if not exists audit_logs_action_idx on app.audit_logs(action);

create or replace function app.audit_log(action text, target_table text, target_id uuid, meta jsonb)
returns void
language plpgsql as $$
declare
  r app.user_role;
begin
  select role into r from app.profiles where user_id = auth.uid();
  insert into app.audit_logs(actor_user_id, actor_role, action, target_table, target_id, meta)
  values (auth.uid(), r, action, target_table, target_id, meta);
end $$;

-- ===================== RLS =====================

alter table app.profiles enable row level security;
alter table app.login_attempts enable row level security;
alter table app.patients enable row level security;
alter table app.patient_accounts enable row level security;
alter table app.appointments enable row level security;
alter table app.consultations enable row level security;
alter table app.vitals enable row level security;
alter table app.prescriptions enable row level security;
alter table app.prescription_items enable row level security;
alter table app.dispensations enable row level security;
alter table app.exam_orders enable row level security;
alter table app.exam_results enable row level security;
alter table app.stock_items enable row level security;
alter table app.stock_movements enable row level security;
alter table app.invoices enable row level security;
alter table app.invoice_items enable row level security;
alter table app.payments enable row level security;
alter table app.audit_logs enable row level security;
-- enable RLS for messages (declared below)
do $$ begin
  alter table app.messages enable row level security;
exception when undefined_table then null; end $$;

-- profiles: self read, admin write
drop policy if exists profiles_read_self on app.profiles;
create policy profiles_read_self on app.profiles
for select using (user_id = auth.uid() or app.is_admin());

drop policy if exists profiles_read_practitioners_for_staff on app.profiles;
create policy profiles_read_practitioners_for_staff on app.profiles
for select using (
  app.has_any_role(array['admin','secretaire','directeur']::app.user_role[])
  and role in ('medecin'::app.user_role, 'infirmier'::app.user_role)
);

drop policy if exists profiles_read_medecins_for_patients on app.profiles;
create policy profiles_read_medecins_for_patients on app.profiles
for select using (
  app.has_role('patient')
  and role = 'medecin'::app.user_role
);

drop policy if exists profiles_insert_self on app.profiles;
create policy profiles_insert_self on app.profiles
for insert with check (user_id = auth.uid());

drop policy if exists profiles_update_self on app.profiles;
create policy profiles_update_self on app.profiles
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists profiles_admin_write on app.profiles;
create policy profiles_admin_write on app.profiles
for all using (app.is_admin()) with check (app.is_admin());

-- login_attempts: admin only (used by edge function / server components later)
drop policy if exists login_attempts_admin_only on app.login_attempts;
create policy login_attempts_admin_only on app.login_attempts
for all using (app.is_admin()) with check (app.is_admin());

-- patients: staff read; admin+secretaire write
drop policy if exists patients_read_staff on app.patients;
drop policy if exists patients_read_staff_all on app.patients;
drop policy if exists patients_read_medecin_own on app.patients;

create policy patients_read_staff_all on app.patients
for select using (
  app.has_any_role(array['admin','infirmier','secretaire','directeur','comptable','pharmacien']::app.user_role[])
);

create policy patients_read_medecin_own on app.patients
for select using (
  app.has_role('medecin')
  and exists (
    select 1
    from app.appointments a
    where a.patient_id = app.patients.id
      and a.practitioner_id = auth.uid()
  )
);

-- patients: patient can read own record via patient_accounts mapping
drop policy if exists patients_read_self on app.patients;
create policy patients_read_self on app.patients
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.patients.id
  )
);

drop policy if exists patients_insert_staff on app.patients;
create policy patients_insert_staff on app.patients
for insert with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

drop policy if exists patients_update_staff on app.patients;
create policy patients_update_staff on app.patients
for update using (app.has_any_role(array['admin','secretaire']::app.user_role[]))
with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

drop policy if exists patients_update_self on app.patients;
create policy patients_update_self on app.patients
for update using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.patients.id
  )
)
with check (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.patients.id
  )
);

-- patient_accounts: admin only
drop policy if exists patient_accounts_admin_only on app.patient_accounts;
create policy patient_accounts_admin_only on app.patient_accounts
for all using (app.is_admin()) with check (app.is_admin());

-- patient_accounts: patient can read own mapping
drop policy if exists patient_accounts_read_self on app.patient_accounts;
create policy patient_accounts_read_self on app.patient_accounts
for select using (user_id = auth.uid());

-- appointments: staff read; secretaire/admin insert; secretaire/medecin/admin update
drop policy if exists appointments_read_staff on app.appointments;
drop policy if exists appointments_read_staff_all on app.appointments;
drop policy if exists appointments_read_medecin_own on app.appointments;

create policy appointments_read_staff_all on app.appointments
for select using (app.has_any_role(array['admin','infirmier','secretaire','directeur']::app.user_role[]));

create policy appointments_read_medecin_own on app.appointments
for select using (app.has_role('medecin') and practitioner_id = auth.uid());

drop policy if exists appointments_insert_staff on app.appointments;
create policy appointments_insert_staff on app.appointments
for insert with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

drop policy if exists appointments_update_staff on app.appointments;
create policy appointments_update_staff on app.appointments
for update using (app.has_any_role(array['admin','secretaire','medecin']::app.user_role[]))
with check (app.has_any_role(array['admin','secretaire','medecin']::app.user_role[]));

-- appointments: patient can read/insert own
drop policy if exists appointments_read_patient_self on app.appointments;
create policy appointments_read_patient_self on app.appointments
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.appointments.patient_id
  )
);

drop policy if exists appointments_insert_patient_self on app.appointments;
create policy appointments_insert_patient_self on app.appointments
for insert with check (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.appointments.patient_id
  )
);

-- consultations: read medecin/infirmier/directeur/admin; write medecin/admin
drop policy if exists consultations_read_staff on app.consultations;
drop policy if exists consultations_read_staff_all on app.consultations;
drop policy if exists consultations_read_medecin_own on app.consultations;

create policy consultations_read_staff_all on app.consultations
for select using (app.has_any_role(array['admin','infirmier','directeur']::app.user_role[]));

create policy consultations_read_medecin_own on app.consultations
for select using (app.has_role('medecin') and practitioner_id = auth.uid());

drop policy if exists consultations_insert_medecin on app.consultations;
create policy consultations_insert_medecin on app.consultations
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists consultations_update_medecin on app.consultations;
create policy consultations_update_medecin on app.consultations
for update using (app.has_any_role(array['admin','medecin']::app.user_role[]))
with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

-- vitals: read medecin/infirmier/admin; insert infirmier/admin
drop policy if exists vitals_read_staff on app.vitals;
create policy vitals_read_staff on app.vitals
for select using (app.has_any_role(array['admin','medecin','infirmier']::app.user_role[]));

drop policy if exists vitals_insert_infirmier on app.vitals;
create policy vitals_insert_infirmier on app.vitals
for insert with check (app.has_any_role(array['admin','infirmier']::app.user_role[]));

-- prescriptions/items: read medecin/pharmacien/admin; write medecin/admin
drop policy if exists prescriptions_read_staff on app.prescriptions;
drop policy if exists prescriptions_read_staff_all on app.prescriptions;
drop policy if exists prescriptions_read_medecin_own on app.prescriptions;

create policy prescriptions_read_staff_all on app.prescriptions
for select using (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

create policy prescriptions_read_medecin_own on app.prescriptions
for select using (app.has_role('medecin') and practitioner_id = auth.uid());

-- prescriptions: patient can read own
drop policy if exists prescriptions_read_patient_self on app.prescriptions;
create policy prescriptions_read_patient_self on app.prescriptions
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.prescriptions.patient_id
  )
);

drop policy if exists prescriptions_insert_medecin on app.prescriptions;
create policy prescriptions_insert_medecin on app.prescriptions
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists prescriptions_update_pharmacien on app.prescriptions;
create policy prescriptions_update_pharmacien on app.prescriptions
for update using (app.has_any_role(array['admin','pharmacien']::app.user_role[]))
with check (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

drop policy if exists prescription_items_read_staff on app.prescription_items;
drop policy if exists prescription_items_read_staff_all on app.prescription_items;
drop policy if exists prescription_items_read_medecin_own on app.prescription_items;

create policy prescription_items_read_staff_all on app.prescription_items
for select using (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

create policy prescription_items_read_medecin_own on app.prescription_items
for select using (
  app.has_role('medecin')
  and exists (
    select 1
    from app.prescriptions p
    where p.id = app.prescription_items.prescription_id
      and p.practitioner_id = auth.uid()
  )
);

-- prescription_items: patient can read items of own prescriptions
drop policy if exists prescription_items_read_patient_self on app.prescription_items;
create policy prescription_items_read_patient_self on app.prescription_items
for select using (
  exists (
    select 1
    from app.prescriptions p
    join app.patient_accounts pa on pa.patient_id = p.patient_id
    where p.id = app.prescription_items.prescription_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists prescription_items_insert_medecin on app.prescription_items;
create policy prescription_items_insert_medecin on app.prescription_items
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

-- dispensations: read medecin/pharmacien/admin; insert pharmacien/admin
drop policy if exists dispensations_read_staff on app.dispensations;
create policy dispensations_read_staff on app.dispensations
for select using (app.has_any_role(array['admin','medecin','pharmacien']::app.user_role[]));

drop policy if exists dispensations_insert_pharmacien on app.dispensations;
create policy dispensations_insert_pharmacien on app.dispensations
for insert with check (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

-- exams: read medecin/directeur/admin; insert medecin/admin; results insert lab/admin (not modeled) -> admin only
drop policy if exists exam_orders_read_staff on app.exam_orders;
drop policy if exists exam_orders_read_staff_all on app.exam_orders;
drop policy if exists exam_orders_read_medecin_own on app.exam_orders;

create policy exam_orders_read_staff_all on app.exam_orders
for select using (app.has_any_role(array['admin','directeur']::app.user_role[]));

create policy exam_orders_read_medecin_own on app.exam_orders
for select using (app.has_role('medecin') and practitioner_id = auth.uid());

-- exam_orders: patient can read own
drop policy if exists exam_orders_read_patient_self on app.exam_orders;
create policy exam_orders_read_patient_self on app.exam_orders
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.exam_orders.patient_id
  )
);

drop policy if exists exam_orders_insert_medecin on app.exam_orders;
create policy exam_orders_insert_medecin on app.exam_orders
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists exam_results_read_staff on app.exam_results;
drop policy if exists exam_results_read_staff_all on app.exam_results;
drop policy if exists exam_results_read_medecin_own on app.exam_results;

create policy exam_results_read_staff_all on app.exam_results
for select using (app.has_any_role(array['admin','directeur']::app.user_role[]));

create policy exam_results_read_medecin_own on app.exam_results
for select using (
  app.has_role('medecin')
  and exists (
    select 1
    from app.exam_orders o
    where o.id = app.exam_results.order_id
      and o.practitioner_id = auth.uid()
  )
);

-- exam_results: patient can read results of own orders
drop policy if exists exam_results_read_patient_self on app.exam_results;
create policy exam_results_read_patient_self on app.exam_results
for select using (
  exists (
    select 1
    from app.exam_orders o
    join app.patient_accounts pa on pa.patient_id = o.patient_id
    where o.id = app.exam_results.order_id
      and pa.user_id = auth.uid()
  )
);

drop policy if exists exam_results_admin_insert on app.exam_results;
create policy exam_results_admin_insert on app.exam_results
for insert with check (app.is_admin());

-- stock: read pharmacien/infirmier/directeur/admin; write pharmacien/admin
drop policy if exists stock_read_staff on app.stock_items;
create policy stock_read_staff on app.stock_items
for select using (app.has_any_role(array['admin','pharmacien','infirmier','directeur','medecin']::app.user_role[]));

drop policy if exists stock_write_admin_pharmacien on app.stock_items;
create policy stock_write_admin_pharmacien on app.stock_items
for all using (app.has_any_role(array['admin','pharmacien']::app.user_role[]))
with check (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

drop policy if exists stock_movements_read_staff on app.stock_movements;
create policy stock_movements_read_staff on app.stock_movements
for select using (app.has_any_role(array['admin','pharmacien','infirmier','directeur']::app.user_role[]));

drop policy if exists stock_movements_insert_staff on app.stock_movements;
create policy stock_movements_insert_staff on app.stock_movements
for insert with check (app.has_any_role(array['admin','pharmacien','infirmier']::app.user_role[]));

-- billing: invoices read secretaire/comptable/directeur/admin; payments read comptable/directeur/admin
drop policy if exists invoices_read_finance on app.invoices;
create policy invoices_read_finance on app.invoices
for select using (app.has_any_role(array['admin','comptable','secretaire','directeur']::app.user_role[]));

drop policy if exists invoices_insert_finance on app.invoices;
create policy invoices_insert_finance on app.invoices
for insert with check (app.has_any_role(array['admin','secretaire','comptable','medecin','pharmacien']::app.user_role[]));

drop policy if exists invoices_update_comptable on app.invoices;
create policy invoices_update_comptable on app.invoices
for update using (app.has_any_role(array['admin','comptable']::app.user_role[]))
with check (app.has_any_role(array['admin','comptable']::app.user_role[]));

-- invoices: patient can read own invoices
drop policy if exists invoices_read_patient on app.invoices;
create policy invoices_read_patient on app.invoices
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.invoices.patient_id
  )
);

drop policy if exists invoice_items_read_finance on app.invoice_items;
create policy invoice_items_read_finance on app.invoice_items
for select using (app.has_any_role(array['admin','comptable','secretaire','directeur']::app.user_role[]));

-- invoice items: patient can read items of own invoices
drop policy if exists invoice_items_read_patient on app.invoice_items;
create policy invoice_items_read_patient on app.invoice_items
for select using (
  exists (
    select 1
    from app.invoices i
    join app.patient_accounts pa on pa.patient_id = i.patient_id
    where i.id = app.invoice_items.invoice_id
      and pa.user_id = auth.uid()
  )
);
drop policy if exists invoice_items_insert_finance on app.invoice_items;
create policy invoice_items_insert_finance on app.invoice_items
for insert with check (app.has_any_role(array['admin','secretaire','comptable','medecin','pharmacien']::app.user_role[]));

drop policy if exists payments_read_finance on app.payments;
create policy payments_read_finance on app.payments
for select using (app.has_any_role(array['admin','comptable','directeur']::app.user_role[]));

drop policy if exists payments_insert_comptable on app.payments;
create policy payments_insert_comptable on app.payments
for insert with check (app.has_any_role(array['admin','comptable']::app.user_role[]));

-- audit: read admin only, insert any logged user
drop policy if exists audit_read_admin on app.audit_logs;
create policy audit_read_admin on app.audit_logs
for select using (app.is_admin());

drop policy if exists audit_insert_authenticated on app.audit_logs;
create policy audit_insert_authenticated on app.audit_logs
for insert with check (auth.uid() is not null);

-- ===================== SEEDS (DEMO DATA) =====================

insert into app.patients (patient_code, first_name, last_name, sex, birth_date, phone, address)
values
  ('2KC00000000', 'Chantal', 'Ndzi', 'F', '1994-06-12', '693904197', 'Douala'),
  ('2KC00000001', 'Junior', 'Kemajou', 'M', '1988-10-02', '693904197', 'Yaoundé'),
  ('2KC00000002', 'Estelle', 'Nkom', 'F', '2001-01-19', '693904197', 'Bafoussam'),
  ('2KC00000003', 'Arnaud', 'Mbida', 'M', '1979-04-21', '693904197', 'Garoua'),
  ('2KC00000004', 'Prudence', 'Etoa', 'F', '1999-09-09', '693904197', 'Bertoua')
on conflict do nothing;

insert into app.stock_items (kind, name, category, unit, stock, threshold, unit_price, expiry_date)
values
  ('pharmacy', 'Paracetamol 500mg', 'Antalgique', 'boite', 240, 50, 500, '2027-08-12'),
  ('pharmacy', 'Amoxicilline 1g', 'Antibiotique', 'boite', 38, 40, 2500, '2027-03-04'),
  ('pharmacy', 'Ibuprofene 400mg', 'Anti-inflammatoire', 'boite', 180, 60, 750, '2027-01-22'),
  ('pharmacy', 'Doliprane sirop', 'Antalgique', 'flacon', 64, 30, 1800, '2027-05-30'),
  ('pharmacy', 'Ventoline aerosol', 'Bronchodilatateur', 'unite', 22, 25, 3500, '2027-09-18'),
  ('pharmacy', 'Insuline rapide', 'Endocrinologie', 'unite', 14, 20, 9000, '2027-02-10'),
  ('pharmacy', 'Aspirine 100mg', 'Cardiologie', 'boite', 320, 80, 400, '2028-06-01'),
  ('pharmacy', 'Omeprazole 20mg', 'Gastro', 'boite', 110, 40, 1600, '2027-11-15'),
  ('pharmacy', 'Serum physiologique', 'Soins', 'unite', 540, 100, 300, '2028-01-01'),
  ('pharmacy', 'Artemether/Lumefantrine', 'Antipaludique', 'boite', 90, 25, 2200, '2027-12-01')
on conflict do nothing;

-- ===================== COMPAT VIEW (FRONTEND) =====================
-- Frontend expects `profiles` in public schema. This view preserves RLS by using security_invoker.

create or replace view public.profiles
with (security_invoker = true)
as
select
  user_id,
  role,
  full_name,
  phone,
  created_at,
  updated_at
from app.profiles;

grant select on public.profiles to anon, authenticated;

-- Grants required by Supabase clients and Edge Functions using the app schema.
grant usage on schema app to anon, authenticated, service_role;
grant all privileges on all tables in schema app to service_role;
grant all privileges on all sequences in schema app to service_role;
grant execute on all functions in schema app to service_role;
alter default privileges in schema app grant all privileges on tables to service_role;
alter default privileges in schema app grant all privileges on sequences to service_role;
alter default privileges in schema app grant execute on functions to service_role;

-- ===================== MESSAGES (PATIENT <-> PRATICIEN/SECRÉTARIAT) =====================

create table if not exists app.messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid null references app.profiles(user_id),
  sender text not null check (sender in ('patient','praticien','secretaire','system')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_patient_idx on app.messages(patient_id, created_at desc);
create index if not exists messages_practitioner_idx on app.messages(practitioner_id, created_at desc);

alter table app.messages enable row level security;

-- messages: patient read/insert own
drop policy if exists messages_read_patient on app.messages;
create policy messages_read_patient on app.messages
for select using (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.messages.patient_id
  )
);

drop policy if exists messages_insert_patient on app.messages;
create policy messages_insert_patient on app.messages
for insert with check (
  exists (
    select 1 from app.patient_accounts pa
    where pa.user_id = auth.uid()
      and pa.patient_id = app.messages.patient_id
  ) and sender = 'patient'
);

-- messages: medecin read/insert for assigned practitioner
drop policy if exists messages_read_medecin on app.messages;
create policy messages_read_medecin on app.messages
for select using (app.has_role('medecin') and practitioner_id = auth.uid());

drop policy if exists messages_insert_medecin on app.messages;
create policy messages_insert_medecin on app.messages
for insert with check (app.has_role('medecin') and practitioner_id = auth.uid() and sender = 'praticien');

-- messages: secretaire read/insert all (could be restricted later by service)
drop policy if exists messages_read_secretaire on app.messages;
create policy messages_read_secretaire on app.messages
for select using (app.has_role('secretaire'));

drop policy if exists messages_insert_secretaire on app.messages;
create policy messages_insert_secretaire on app.messages
for insert with check (app.has_role('secretaire') and sender = 'secretaire');
