-- =====================================================================
-- 2KC Health Hub - Supabase Database Schema
-- Matches all current features (Auth, Patients, Pharmacy, Schedule)
-- Adds instant notifications, chat records, and RLS policies
-- =====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Custom User Roles Enum
CREATE TYPE user_role AS ENUM ('admin', 'medecin', 'infirmier', 'secretaire', 'patient');

-- ==========================================
-- 1. PROFILES & AUTHENTICATION
-- ==========================================

-- Profiles table (Linked 1:1 with Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'patient',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Patients specific clinical data (linked to profiles)
CREATE TABLE public.patients (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    date_of_birth DATE,
    phone TEXT,
    blood_type TEXT,
    allergies TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    medical_history TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. SCHEDULING (APPOINTMENTS / RDV)
-- ==========================================

CREATE TYPE appointment_status AS ENUM ('en attente', 'confirmé', 'complété');

CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    practitioner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    date_time TIMESTAMP WITH TIME ZONE NOT NULL,
    reason TEXT NOT NULL,
    status appointment_status NOT NULL DEFAULT 'en attente',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. MEDICAL PRESCRIPTIONS & TREATMENTS
-- ==========================================

-- Prescriptions Header
CREATE TABLE public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Detailed Medications inside a Prescription
CREATE TABLE public.prescription_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    frequency TEXT NOT NULL,
    duration TEXT NOT NULL
);

ALTER TABLE public.prescription_medications ENABLE ROW LEVEL SECURITY;

-- Long-term treatments of patients
CREATE TABLE public.current_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.current_medications ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. PHARMACY INVENTORY
-- ==========================================

CREATE TABLE public.medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    threshold INTEGER NOT NULL DEFAULT 10,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expiry DATE NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 5. REAL-TIME CHAT & MESSAGING
-- ==========================================

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. INSTANT NOTIFICATIONS SYSTEM
-- ==========================================

CREATE TYPE notification_type AS ENUM ('appointment', 'prescription', 'message', 'system');

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type notification_type NOT NULL DEFAULT 'system',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 7. MEDICAL FILES & TEST RESULTS (STORAGE LINK)
-- ==========================================

CREATE TABLE public.medical_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_url TEXT NOT NULL, -- Path to Supabase Storage Bucket
    file_type TEXT NOT NULL, -- e.g. 'pdf', 'image/png', 'image/jpeg'
    file_size INTEGER NOT NULL, -- in bytes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.medical_files ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- --- PROFILES POLICIES ---
-- Everyone can read practitioner profiles, patients can only read/edit their own
CREATE POLICY "Public profiles reading" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- --- PATIENTS POLICIES ---
-- Patients can view their own details; medical staff can view all patients
CREATE POLICY "Patients view own profile" ON public.patients
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Staff can view all patients" ON public.patients
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'medecin', 'infirmier', 'secretaire')
        )
    );

CREATE POLICY "Staff can edit patients" ON public.patients
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'medecin', 'infirmier', 'secretaire')
        )
    );

-- --- APPOINTMENTS POLICIES ---
-- Patients can see/create own appointments; staff can see/manage all
CREATE POLICY "Patients view/create own appointments" ON public.appointments
    FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Patients can request appointments" ON public.appointments
    FOR INSERT WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Staff manage all appointments" ON public.appointments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'medecin', 'infirmier', 'secretaire')
        )
    );

-- --- PRESCRIPTIONS POLICIES ---
-- Patients can view their prescriptions; Doctors can write/read all
CREATE POLICY "Patients view own prescriptions" ON public.prescriptions
    FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Doctors write prescriptions" ON public.prescriptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'medecin'
        )
    );

-- --- MESSAGES POLICIES ---
-- Users can only see messages they sent or received
CREATE POLICY "Users view own chat history" ON public.messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- --- NOTIFICATIONS POLICIES ---
-- Users can only read/edit their own notifications
CREATE POLICY "Users view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notification status" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- --- MEDICAL FILES (TEST RESULTS) POLICIES ---
-- Patients can view their own files; staff can view and upload files
CREATE POLICY "Patients view own medical files" ON public.medical_files
    FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Staff manage all medical files" ON public.medical_files
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'medecin', 'infirmier', 'secretaire')
        )
    );

-- =====================================================================
-- DATABASE TRIGGERS & FUNCTIONS
-- =====================================================================

-- 1. Profile Creator Trigger
-- Automatically creates a profile inside public.profiles when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Utilisateur 2KC'),
    new.email,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'patient'::public.user_role)
  );

  -- If it's a patient, also initialize a patient clinical folder
  IF COALESCE(new.raw_user_meta_data->>'role', 'patient') = 'patient' THEN
    INSERT INTO public.patients (id, blood_type, allergies, medical_history)
    VALUES (new.id, 'Non spécifié', '{}'::TEXT[], '{}'::TEXT[]);
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Appointment Status Alert Trigger
-- Automatically creates a notification when an appointment status changes or is created
CREATE OR REPLACE FUNCTION public.notify_appointment_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for the patient
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.notifications (user_id, title, content, type)
    VALUES (
      new.patient_id,
      'Demande de rendez-vous reçue',
      'Votre demande pour le ' || to_char(new.date_time, 'DD/MM/YYYY à HH24:MI') || ' est en cours d''examen.',
      'appointment'
    );
  ELSIF (TG_OP = 'UPDATE' AND old.status <> new.status) THEN
    INSERT INTO public.notifications (user_id, title, content, type)
    VALUES (
      new.patient_id,
      'Rendez-vous ' || new.status,
      'Votre consultation du ' || to_char(new.date_time, 'DD/MM/YYYY à HH24:MI') || ' a été ' || new.status || '.',
      'appointment'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_appointment_status_change
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment_changes();


-- 3. Live Chat Message Trigger
-- Automatically creates an instant notification when a new message is received
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  SELECT name INTO sender_name FROM public.profiles WHERE id = new.sender_id;

  INSERT INTO public.notifications (user_id, title, content, type)
  VALUES (
    new.receiver_id,
    'Nouveau message de ' || COALESCE(sender_name, 'Praticien 2KC'),
    substring(new.content from 1 for 60) || CASE WHEN length(new.content) > 60 THEN '...' ELSE '' END,
    'message'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_message_sent
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();
