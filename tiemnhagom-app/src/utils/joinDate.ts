/**
 * Resolve member join date matching DashBoard's `parseUserCreatedDateObj` logic 100%.
 * Evaluates all registration/creation date candidates (never `lastLogin` or `updatedAt`)
 * and returns the earliest valid date (> year 2000).
 */
const MIN_VALID_TS = 946684800000; // 2000-01-01T00:00:00Z

const toDate = (value: any): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  try {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof value === 'object') {
      const sec = typeof value.seconds === 'number' ? value.seconds : value._seconds;
      const nano = typeof value.nanoseconds === 'number' ? value.nanoseconds : (value._nanoseconds || 0);
      if (typeof sec === 'number') {
        const d = new Date(sec * 1000 + Math.floor(nano / 1e6));
        return isNaN(d.getTime()) ? null : d;
      }
    }
    if (typeof value === 'number') {
      const d = new Date(value < 1e12 ? value * 1000 : value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      // Hỗ trợ định dạng DD/MM/YYYY
      const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) {
        const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        return isNaN(d.getTime()) ? null : d;
      }
      const n = Number(trimmed);
      const d = !isNaN(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(trimmed);
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
    userProfile?.creationTime,
    userProfile?.metadata?.creationTime,
    authUser?.metadata?.creationTime,
    userProfile?.createdAt,
    userProfile?.createdAtMs,
    userProfile?.joinDate,
    userProfile?.createdDate,
    userProfile?.firstOrderDate,
  ];

  let earliestDate: Date | null = null;
  for (const raw of candidates) {
    const d = toDate(raw);
    if (d && d.getTime() > MIN_VALID_TS) {
      if (!earliestDate || d.getTime() < earliestDate.getTime()) {
        earliestDate = d;
      }
    }
  }

  const idStr = String(userProfile?.id || userProfile?.uid || authUser?.uid || '');
  const matchTs = idStr.match(/_(\d{13})$/);
  if (matchTs) {
    const d = new Date(Number(matchTs[1]));
    if (!isNaN(d.getTime()) && d.getTime() > MIN_VALID_TS) {
      if (!earliestDate || d.getTime() < earliestDate.getTime()) {
        earliestDate = d;
      }
    }
  }

  return earliestDate;
}
