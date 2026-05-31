import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? window.localStorage
    : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage)
);

export type Role =
  | "admin"
  | "medecin"
  | "infirmier"
  | "secretaire"
  | "comptable"
  | "pharmacien"
  | "directeur"
  | "patient";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.locked"
  | "pharmacy.add"
  | "pharmacy.update"
  | "pharmacy.remove";

export type User = {
  name: string;
  email: string;
  role: Role;
};

export type Medicine = {
  id: string;
  name: string;
  category: string;
  stock: number;
  threshold: number;
  price: number;
  expiry: string;
  image: string;
};

type AuthState = {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  lastActivityAt: number | null;
  touch: () => void;
  failedAttempts: Record<string, number>;
  lockUntilByEmail: Record<string, number>;
  recordLoginFailure: (email: string) => { attempts: number; lockedUntil: number | null };
  clearLoginFailures: (email: string) => void;
  isLocked: (email: string) => { locked: boolean; until: number | null };
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      lastActivityAt: null,
      failedAttempts: {},
      lockUntilByEmail: {},
      login: (user) => set({ user, lastActivityAt: Date.now() }),
      logout: () => set({ user: null, lastActivityAt: null }),
      touch: () =>
        set((s) => (s.user ? { lastActivityAt: Date.now() } : {})),
      recordLoginFailure: (email: string) => {
        const clean = email.trim().toLowerCase();
        const now = Date.now();
        const currentLock = get().lockUntilByEmail[clean];
        if (currentLock && currentLock > now) {
          return { attempts: get().failedAttempts[clean] ?? 0, lockedUntil: currentLock };
        }

        const attempts = (get().failedAttempts[clean] ?? 0) + 1;
        const shouldLock = attempts >= 3;
        const lockedUntil = shouldLock ? now + 5 * 60 * 1000 : null;

        set((s) => ({
          failedAttempts: { ...s.failedAttempts, [clean]: attempts },
          lockUntilByEmail: lockedUntil
            ? { ...s.lockUntilByEmail, [clean]: lockedUntil }
            : s.lockUntilByEmail,
        }));

        return { attempts, lockedUntil };
      },
      clearLoginFailures: (email: string) => {
        const clean = email.trim().toLowerCase();
        set((s) => {
          const { [clean]: _a, ...restA } = s.failedAttempts;
          const { [clean]: _l, ...restL } = s.lockUntilByEmail;
          return { failedAttempts: restA, lockUntilByEmail: restL };
        });
      },
      isLocked: (email: string) => {
        const clean = email.trim().toLowerCase();
        const until = get().lockUntilByEmail[clean] ?? null;
        const locked = until != null && until > Date.now();
        return { locked, until: locked ? until : null };
      },
    }),
    {
      name: "2kc-auth",
      storage: safeStorage,
      partialize: (state) => ({
        failedAttempts: state.failedAttempts,
        lockUntilByEmail: state.lockUntilByEmail,
      }),
    }
  )
);

export type AuditLogEntry = {
  id: string;
  at: number;
  actorEmail: string | null;
  actorRole: Role | null;
  action: AuditAction;
  target?: string;
  meta?: Record<string, unknown>;
};

type AuditLogState = {
  entries: AuditLogEntry[];
  add: (e: Omit<AuditLogEntry, "id" | "at"> & { at?: number }) => void;
  clear: () => void;
};

export const useAuditLog = create<AuditLogState>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) =>
        set((s) => ({
          entries: [
            {
              id: crypto.randomUUID(),
              at: e.at ?? Date.now(),
              actorEmail: e.actorEmail,
              actorRole: e.actorRole,
              action: e.action,
              target: e.target,
              meta: e.meta,
            },
            ...s.entries,
          ].slice(0, 5000),
        })),
      clear: () => set({ entries: [] }),
    }),
    { name: "2kc-audit", storage: safeStorage }
  )
);

const seedMedicines: Medicine[] = [
  { id: "m1", name: "Paracétamol 500mg", category: "Antalgique", stock: 240, threshold: 50, price: 500, expiry: "2026-08-12", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80" },
  { id: "m2", name: "Amoxicilline 1g", category: "Antibiotique", stock: 38, threshold: 40, price: 2500, expiry: "2026-03-04", image: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&q=80" },
  { id: "m3", name: "Ibuprofène 400mg", category: "Anti-inflammatoire", stock: 180, threshold: 60, price: 750, expiry: "2027-01-22", image: "https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&q=80" },
  { id: "m4", name: "Doliprane sirop", category: "Antalgique", stock: 64, threshold: 30, price: 1800, expiry: "2026-05-30", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&q=80" },
  { id: "m5", name: "Ventoline aérosol", category: "Bronchodilatateur", stock: 22, threshold: 25, price: 3500, expiry: "2026-09-18", image: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&q=80" },
  { id: "m6", name: "Insuline rapide", category: "Endocrinologie", stock: 14, threshold: 20, price: 9000, expiry: "2026-02-10", image: "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400&q=80" },
  { id: "m7", name: "Aspirine 100mg", category: "Cardiologie", stock: 320, threshold: 80, price: 400, expiry: "2027-06-01", image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&q=80" },
  { id: "m8", name: "Oméprazole 20mg", category: "Gastro", stock: 110, threshold: 40, price: 1600, expiry: "2026-11-15", image: "https://images.unsplash.com/photo-1626716493137-b67fe9501e76?w=400&q=80" },
  { id: "m9", name: "Loratadine 10mg", category: "Antihistaminique", stock: 78, threshold: 35, price: 1200, expiry: "2027-02-28", image: "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=400&q=80" },
  { id: "m10", name: "Sérum physiologique", category: "Soins", stock: 540, threshold: 100, price: 300, expiry: "2028-01-01", image: "https://images.unsplash.com/photo-1583912267550-d6c2ac3196c0?w=400&q=80" },
  { id: "m11", name: "Bétadine 10%", category: "Antiseptique", stock: 96, threshold: 30, price: 1500, expiry: "2027-04-20", image: "https://images.unsplash.com/photo-1538935732373-f7a495fea3f6?w=400&q=80" },
  { id: "m12", name: "Vitamine D3", category: "Vitamines", stock: 210, threshold: 50, price: 2000, expiry: "2027-09-09", image: "https://images.unsplash.com/photo-1559757175-08c2c4b8d3a6?w=400&q=80" },
];

type PharmacyState = {
  medicines: Medicine[];
  add: (m: Omit<Medicine, "id">) => void;
  update: (id: string, m: Partial<Medicine>) => void;
  remove: (id: string) => void;
};

export const usePharmacy = create<PharmacyState>()(
  persist(
    (set) => ({
      medicines: seedMedicines,
      add: (m) =>
        set((s) => {
          const created = { ...m, id: crypto.randomUUID() };
          const actor = useAuth.getState().user;
          useAuditLog.getState().add({
            actorEmail: actor?.email ?? null,
            actorRole: actor?.role ?? null,
            action: "pharmacy.add",
            target: created.id,
            meta: { name: created.name, category: created.category, stock: created.stock },
          });
          return { medicines: [created, ...s.medicines] };
        }),
      update: (id, m) =>
        set((s) => {
          const before = s.medicines.find((x: Medicine) => x.id === id);
          const actor = useAuth.getState().user;
          useAuditLog.getState().add({
            actorEmail: actor?.email ?? null,
            actorRole: actor?.role ?? null,
            action: "pharmacy.update",
            target: id,
            meta: { before, patch: m },
          });
          return {
            medicines: s.medicines.map((x: Medicine) => (x.id === id ? { ...x, ...m } : x)),
          };
        }),
      remove: (id) =>
        set((s) => {
          const before = s.medicines.find((x: Medicine) => x.id === id);
          const actor = useAuth.getState().user;
          useAuditLog.getState().add({
            actorEmail: actor?.email ?? null,
            actorRole: actor?.role ?? null,
            action: "pharmacy.remove",
            target: id,
            meta: { before },
          });
          return { medicines: s.medicines.filter((x) => x.id !== id) };
        }),
    }),
    { name: "2kc-pharmacy", storage: safeStorage }
  )
);
