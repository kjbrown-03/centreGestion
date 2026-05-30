export const CENTRE_PHONE = "693904197";
export const CENTRE_PHONE_DISPLAY = "+237 693 904 197";
export const WHATSAPP_URL = `https://wa.me/237${CENTRE_PHONE}`;
export const CENTRE_LOCATION = "Centre de Santé 2KC, Douala, Cameroun";
export const GOOGLE_MAPS_EMBED_URL =
  "https://www.google.com/maps?q=Centre%20de%20Sante%202KC%2C%20Douala%2C%20Cameroun&output=embed";

export function whatsappUrlFor(phone?: string | null) {
  const digits = (phone ?? CENTRE_PHONE).replace(/\D/g, "");
  const normalized = digits.startsWith("237") ? digits : `237${digits || CENTRE_PHONE}`;
  return `https://wa.me/${normalized}`;
}
