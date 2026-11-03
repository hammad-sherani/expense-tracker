import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Real bcrypt hash (generated once) to keep login timing similar when the email doesn't exist. */
let dummyHash: Promise<string> | null = null;

export async function verifyAgainstDummy(password: string) {
  dummyHash ??= bcrypt.hash("timing-equaliser", ROUNDS);
  await bcrypt.compare(password, await dummyHash);
  return false;
}
