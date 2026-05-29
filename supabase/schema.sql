-- 2KC Centre de Santé — Supabase/PostgreSQL schema
-- Copy/paste into Supabase SQL editor.

-- Extensions
create extension if not exists pgcrypto;

-- Schema
create schema if not exists app;

-- Enums
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

-- Helpers
create or replace function app.uid() returns uuid
language sql stable as $$
  select auth.uid();
$$;

create or replace function app.is_admin() returns boolean
language sql stable as $$
  select exists (
    select 1 from app.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function app.has_role(r app.user_role) returns boolean
language sql stable as $$
  select exists (
    select 1 from app.profiles p
    where p.user_id = auth.uid() and p.role = r
  );
$$;

create or replace function app.has_any_role(roles app.user_role[]) returns boolean
language sql stable as $$
  select exists (
    select 1 from app.profiles p
    where p.user_id = auth.uid() and p.role = any(roles)
  );
$$;

-- Profiles (maps auth.users -> app roles)
create table if not exists app.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app.user_role not null,
  full_name text not null,
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on app.profiles(role);

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists set_profiles_updated_at on app.profiles;
create trigger set_profiles_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

-- Patients
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
  created_by uuid null references app.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Appointments
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

-- Medical record (DME)
create table if not exists app.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references app.patients(id) on delete cascade,
  practitioner_id uuid not null references app.profiles(user_id),
  appointment_id uuid null references app.appointments(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  chief_complaint text null,
  diagnosis text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists consultations_patient_idx on app.consultations(patient_id, started_at desc);
create index if not exists consultations_practitioner_idx on app.consultations(practitioner_id, started_at desc);

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

-- Prescriptions
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

create index if not exists prescription_items_prescription_idx on app.prescription_items(prescription_id);

-- Lab / Imaging exams
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

create index if not exists exam_orders_patient_idx on app.exam_orders(patient_id, created_at desc);

create table if not exists app.exam_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references app.exam_orders(id) on delete cascade,
  result_summary text null,
  result_payload jsonb null,
  file_url text null,
  created_at timestamptz not null default now()
);

-- Stocks
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

-- Billing
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

-- Audit log
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

-- RLS
alter table app.profiles enable row level security;
alter table app.patients enable row level security;
alter table app.appointments enable row level security;
alter table app.consultations enable row level security;
alter table app.vitals enable row level security;
alter table app.prescriptions enable row level security;
alter table app.prescription_items enable row level security;
alter table app.exam_orders enable row level security;
alter table app.exam_results enable row level security;
alter table app.stock_items enable row level security;
alter table app.stock_movements enable row level security;
alter table app.invoices enable row level security;
alter table app.invoice_items enable row level security;
alter table app.payments enable row level security;
alter table app.audit_logs enable row level security;

-- Profiles policies
drop policy if exists "profiles_read_self" on app.profiles;
create policy "profiles_read_self" on app.profiles
for select using (user_id = auth.uid() or app.is_admin());

drop policy if exists "profiles_admin_write" on app.profiles;
create policy "profiles_admin_write" on app.profiles
for all using (app.is_admin()) with check (app.is_admin());

-- Patients policies
drop policy if exists "patients_read_staff" on app.patients;
create policy "patients_read_staff" on app.patients
for select using (app.has_any_role(array['admin','medecin','infirmier','secretaire','directeur','comptable','pharmacien']::app.user_role[]));

drop policy if exists "patients_write_staff" on app.patients;
create policy "patients_write_staff" on app.patients
for insert with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

drop policy if exists "patients_update_staff" on app.patients;
create policy "patients_update_staff" on app.patients
for update using (app.has_any_role(array['admin','secretaire']::app.user_role[]))
with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

-- Appointments policies
drop policy if exists "appointments_read_staff" on app.appointments;
create policy "appointments_read_staff" on app.appointments
for select using (app.has_any_role(array['admin','medecin','infirmier','secretaire','directeur']::app.user_role[]));

drop policy if exists "appointments_write_secretaire" on app.appointments;
create policy "appointments_write_secretaire" on app.appointments
for insert with check (app.has_any_role(array['admin','secretaire']::app.user_role[]));

drop policy if exists "appointments_update_staff" on app.appointments;
create policy "appointments_update_staff" on app.appointments
for update using (app.has_any_role(array['admin','secretaire','medecin']::app.user_role[]))
with check (app.has_any_role(array['admin','secretaire','medecin']::app.user_role[]));

-- Consultations
drop policy if exists "consultations_read_staff" on app.consultations;
create policy "consultations_read_staff" on app.consultations
for select using (app.has_any_role(array['admin','medecin','infirmier','directeur']::app.user_role[]));

drop policy if exists "consultations_write_medecin" on app.consultations;
create policy "consultations_write_medecin" on app.consultations
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists "consultations_update_medecin" on app.consultations;
create policy "consultations_update_medecin" on app.consultations
for update using (app.has_any_role(array['admin','medecin']::app.user_role[]))
with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

-- Vitals
drop policy if exists "vitals_read_staff" on app.vitals;
create policy "vitals_read_staff" on app.vitals
for select using (app.has_any_role(array['admin','medecin','infirmier']::app.user_role[]));

drop policy if exists "vitals_write_infirmier" on app.vitals;
create policy "vitals_write_infirmier" on app.vitals
for insert with check (app.has_any_role(array['admin','infirmier']::app.user_role[]));

-- Prescriptions & items
drop policy if exists "prescriptions_read_staff" on app.prescriptions;
create policy "prescriptions_read_staff" on app.prescriptions
for select using (app.has_any_role(array['admin','medecin','pharmacien']::app.user_role[]));

drop policy if exists "prescriptions_write_medecin" on app.prescriptions;
create policy "prescriptions_write_medecin" on app.prescriptions
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists "prescription_items_read_staff" on app.prescription_items;
create policy "prescription_items_read_staff" on app.prescription_items
for select using (app.has_any_role(array['admin','medecin','pharmacien']::app.user_role[]));

drop policy if exists "prescription_items_write_medecin" on app.prescription_items;
create policy "prescription_items_write_medecin" on app.prescription_items
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

-- Exams
drop policy if exists "exam_orders_read_staff" on app.exam_orders;
create policy "exam_orders_read_staff" on app.exam_orders
for select using (app.has_any_role(array['admin','medecin','directeur']::app.user_role[]));

drop policy if exists "exam_orders_write_medecin" on app.exam_orders;
create policy "exam_orders_write_medecin" on app.exam_orders
for insert with check (app.has_any_role(array['admin','medecin']::app.user_role[]));

drop policy if exists "exam_results_read_staff" on app.exam_results;
create policy "exam_results_read_staff" on app.exam_results
for select using (app.has_any_role(array['admin','medecin','directeur']::app.user_role[]));

-- Stock
drop policy if exists "stock_read_staff" on app.stock_items;
create policy "stock_read_staff" on app.stock_items
for select using (app.has_any_role(array['admin','pharmacien','infirmier','directeur']::app.user_role[]));

drop policy if exists "stock_write_admin_pharmacien" on app.stock_items;
create policy "stock_write_admin_pharmacien" on app.stock_items
for all using (app.has_any_role(array['admin','pharmacien']::app.user_role[]))
with check (app.has_any_role(array['admin','pharmacien']::app.user_role[]));

drop policy if exists "stock_movements_read_staff" on app.stock_movements;
create policy "stock_movements_read_staff" on app.stock_movements
for select using (app.has_any_role(array['admin','pharmacien','infirmier','directeur']::app.user_role[]));

drop policy if exists "stock_movements_write_staff" on app.stock_movements;
create policy "stock_movements_write_staff" on app.stock_movements
for insert with check (app.has_any_role(array['admin','pharmacien','infirmier']::app.user_role[]));

-- Billing
drop policy if exists "invoices_read_finance" on app.invoices;
create policy "invoices_read_finance" on app.invoices
for select using (app.has_any_role(array['admin','comptable','secretaire','directeur']::app.user_role[]));

drop policy if exists "invoices_write_finance" on app.invoices;
create policy "invoices_write_finance" on app.invoices
for insert with check (app.has_any_role(array['admin','secretaire','comptable']::app.user_role[]));

drop policy if exists "payments_read_finance" on app.payments;
create policy "payments_read_finance" on app.payments
for select using (app.has_any_role(array['admin','comptable','directeur']::app.user_role[]));

drop policy if exists "payments_write_comptable" on app.payments;
create policy "payments_write_comptable" on app.payments
for insert with check (app.has_any_role(array['admin','comptable']::app.user_role[]));

-- Audit: read only admin
drop policy if exists "audit_read_admin" on app.audit_logs;
create policy "audit_read_admin" on app.audit_logs
for select using (app.is_admin());

drop policy if exists "audit_write_staff" on app.audit_logs;
create policy "audit_write_staff" on app.audit_logs
for insert with check (auth.uid() is not null);

-- Seeds (minimal realistic test data)
-- Note: users in auth.users must be created via Supabase Auth UI or admin API.
-- Insert sample patients
insert into app.patients (patient_code, first_name, last_name, sex, birth_date, phone, address)
values
  ('2KC00000000', 'Chantal', 'Ndzi', 'F', '1994-06-12', '+237690000001', 'Douala'),
  ('2KC00000001', 'Junior', 'Kemajou', 'M', '1988-10-02', '+237690000002', 'Yaoundé'),
  ('2KC00000002', 'Estelle', 'Nkom', 'F', '2001-01-19', '+237690000003', 'Bafoussam')
on conflict do nothing;
