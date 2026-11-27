import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP minimum settings: 19 MiB memory, 2 passes, 1 lane.
// 2 = Algorithm.Argon2id (a const enum, so written as a number).
const options = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, options);
export const verifyPassword = (hashed: string, password: string) => verify(hashed, password);
