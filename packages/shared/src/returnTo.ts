const MAX_RETURN_TO_LENGTH = 512;

function hasUnsafeCharacters(value: string): boolean {
  return (
    value.includes('\\') ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  );
}

/**
 * Accept only app-internal absolute paths for post-auth navigation.
 * Invalid input deliberately falls back to the home page.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > MAX_RETURN_TO_LENGTH) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (hasUnsafeCharacters(value)) return '/';
  if (value.includes('://')) return '/';

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
    if (hasUnsafeCharacters(decoded) || decoded.includes('://')) return '/';
  } catch {
    return '/';
  }

  return value;
}
