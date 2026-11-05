export const SUPPORT_EMAIL = String(import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim();
export const CONTACT_EMAIL = String(import.meta.env.VITE_CONTACT_EMAIL ?? '').trim();
export const CONTACT_PHONE = String(import.meta.env.VITE_CONTACT_PHONE ?? '').trim();

export const emailHref = (email, subject = '') => {
  if (!email) return undefined;
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${query}`;
};
