import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

export const CODE_LENGTH = 5;

export function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

export function isValidCodeFormat(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

export function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
