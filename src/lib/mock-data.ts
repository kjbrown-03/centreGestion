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
  status: "confirmé" | "en attente" | "complété";
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
    phone: "06 12 34 56 78",
    bloodType: "A+",
    allergies: ["Pénicilline", "Pollen de bouleau"],
    medicalHistory: ["Appendicectomie (2012)", "Hypertension artérielle légère sous suivi"],
    currentMedications: [
      { id: "med1", name: "Paracétamol 500mg", dosage: "1 comprimé si douleur, max 3/jour" },
      { id: "med2", name: "Ramipril 5mg", dosage: "1 comprimé le matin" }
    ]
  }
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "apt1",
    patientId: "p1",
    dateTime: "2026-05-28T09:30:00",
    reason: "Suivi de tension artérielle",
    status: "confirmé",
    doc: "Dr. Karim Cissé"
  },
  {
    id: "apt2",
    patientId: "p1",
    dateTime: "2026-05-24T14:15:00",
    reason: "Bilan annuel complet",
    status: "complété",
    doc: "Dr. Aïcha Karim",
    notes: "Tension stable (12/8). Continuer le traitement en cours. Bilan sanguin normal."
  },
  {
    id: "apt3",
    patientId: "p1",
    dateTime: "2026-04-12T10:00:00",
    reason: "Renouvellement d'ordonnance",
    status: "complété",
    doc: "Dr. Karim Cissé",
    notes: "Traitement renouvelé pour 6 mois. Prochain contrôle en mai."
  }
];

export const MOCK_PRESCRIPTIONS: Prescription[] = [
  {
    id: "ORD-2026-0042",
    patientId: "p1",
    createdAt: "2026-05-24T15:00:00",
    doc: "Dr. Aïcha Karim",
    medications: [
      { medicationId: "Ramipril 5mg", dosage: "1 comprimé par jour", frequency: "Le matin", duration: "6 mois" },
      { medicationId: "Paracétamol 500mg", dosage: "1 à 2 comprimés par prise", frequency: "Toutes les 6h si douleur", duration: "1 mois" }
    ],
    notes: "Veuillez surveiller régulièrement votre tension à domicile."
  },
  {
    id: "ORD-2026-0012",
    patientId: "p1",
    createdAt: "2026-04-12T10:30:00",
    doc: "Dr. Karim Cissé",
    medications: [
      { medicationId: "Ramipril 5mg", dosage: "1 comprimé par jour", frequency: "Le matin", duration: "3 mois" }
    ],
    notes: "Prendre à heure fixe de préférence."
  }
];
