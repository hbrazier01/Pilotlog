// Public surface of the isolated CFI-on-Midnight module. Importing this file has no side effects;
// anything that touches a contract (simulator, Preview) calls assertEnabled() first.
export * from './flag.mjs';
export * from './canonical.mjs';
export * from './webauthn.mjs';
export { decodeCbor, encodeCbor } from './cbor.mjs';
