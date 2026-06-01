/**
 * Compare a version string against a major.minor.patch target.
 * Returns true if the version is at least the specified target.
 * Returns false if the version string cannot be parsed.
 */
export function versionAtLeast(version: string, major: number, minor: number, patch: number): boolean {
  const parts = version.split(".");
  if (parts.length < 3) return false;

  const [vMajor, vMinor, vPatch] = parts.map(Number);
  if (isNaN(vMajor) || isNaN(vMinor) || isNaN(vPatch)) return false;

  if (vMajor !== major) return vMajor > major;
  if (vMinor !== minor) return vMinor > minor;
  return vPatch >= patch;
}
