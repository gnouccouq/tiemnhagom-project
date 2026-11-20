/**
 * Resolve member join date from Firestore profile / Firebase auth user.
 * Mirrors web js/profile.js logic: registeredAt → createdAt → metadata.creationTime.
 */
const toDate = (value: any): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  try {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'number') {
      const d = new Date(value < 1e12 ? value * 1000 : value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const n = Number(value);
      const d = !isNaN(n) && value.trim() !== '' ? new Date(n < 1e12 ? n * 1000 : n) : new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
};

export function resolveMemberJoinDate(userProfile: any, authUser: any): Date | null {
  const candidates = [
    userProfile?.registeredAt,
    userProfile?.createdAt,
    authUser?.metadata?.creationTime,
    userProfile?.metadata?.creationTime,
  ];
  for (const c of candidates) {
    const d = toDate(c);
    if (d) return d;
  }
  return null;
}
