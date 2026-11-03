/** Two-letter avatar initials from a username, e.g. "hammad_k" -> "HA". */
export function initials(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "U";
}
