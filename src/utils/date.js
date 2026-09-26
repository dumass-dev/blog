export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Converts a Date object or ISO string to local YYYY-MM-DDTHH:mm format for datetime-local inputs
 * without UTC shift.
 */
export function toLocalDatetimeInputString(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a datetime-local input string (YYYY-MM-DDTHH:mm) back to UTC ISO string reliably.
 */
export function fromLocalDatetimeInputString(inputStr) {
  if (!inputStr) return new Date().toISOString();
  const d = new Date(inputStr);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

