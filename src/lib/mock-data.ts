export type Patient = {
  id: string;
  name: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  bloodType: string;
  allergies: string[];
  medicalHistory: string[];
  currentMedications: { id: string; name: string; dosage: string }[];
};

export type Appointment = {
  id: string;
  patientId: string;
  dateTime: string;
  reason: string;
  status: "confirmÃ©" | "en attente" | "complÃ©tÃ©";
  doc: string;
  notes?: string;
};

export type Prescription = {
  id: string;
  patientId: string;
  createdAt: string;
  doc: string;
  medications: { medicationId: string; dosage: string; frequency: string; duration: string }[];
  notes?: string;
};

export const MOCK_PATIENTS: Patient[] = [
  {
    id: "p1",
    name: "Pierre Durand",
    dateOfBirth: "1988-06-15",
    email: "pierre.durand@gmail.com",
    phone: "693904197",
    bloodType: "A+",
    allergies: ["PÃ©nicilline", "Pollen de bouleau"],
    medicalHistory: ["Appendicectomie (2012)", "Hypertension artÃ©rielle lÃ©gÃ¨re sous suivi"],
    currentMedications: [
      { id: "med1", name: "ParacÃ©tamol 500mg", dosage: "1 comprimÃ© si douleur, max 3/jour" },
      { id: "med2", name: "Ramipril 5mg", dosage: "1 comprimÃ© le matin" }
    ]
  }
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "apt1",
    patientId: "p1",
    dateTime: "2026-05-28T09:30:00",
    reason: "Suivi de tension artÃ©rielle",
    status: "confirmÃ©",
    doc: "Dr. Karim CissÃ©"
  },
  {
    id: "apt2",
    patientId: "p1",
    dateTime: "2026-05-24T14:15:00",
    reason: "Bilan annuel complet",
    status: "complÃ©tÃ©",
    doc: "Dr. AÃ¯cha Karim",
    notes: "Tension stable (12/8). Continuer le traitement en cours. Bilan sanguin normal."
  },
  {
    id: "apt3",
    patientId: "p1",
    dateTime: "2026-04-12T10:00:00",
    reason: "Renouvellement d'ordonnance",
    status: "complÃ©tÃ©",
    doc: "Dr. Karim CissÃ©",
    notes: "Traitement renouvelÃ© pour 6 mois. Prochain contrÃ´le en mai."
  }
];

export const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: "ORD-2026-0042",
    patientId: "p1",
    createdAt: "2026-05-24T15:00:00",
    doc: "Dr. AÃ¯cha Karim",
    medications: [
      { medicationId: "Ramipril 5mg", dosage: "1 comprimÃ© par jour", frequency: "Le matin", duration: "6 mois" },
      { medicationId: "ParacÃ©tamol 500mg", dosage: "1 Ã  2 comprimÃ©s par prise", frequency: "Toutes les 6h si douleur", duration: "1 mois" }
    ],
    notes: "Veuillez surveiller rÃ©guliÃ¨rement votre tension Ã  domicile."
  },
  {
    id: "ORD-2026-0012",
    patientId: "p1",
    createdAt: "2026-04-12T10:30:00",
    doc: "Dr. Karim CissÃ©",
    medications: [
      { medicationId: "Ramipril 5mg", dosage: "1 comprimÃ© par jour", frequency: "Le matin", duration: "3 mois" }
    ],
    notes: "Prendre Ã  heure fixe de prÃ©fÃ©rence."
  }
];
