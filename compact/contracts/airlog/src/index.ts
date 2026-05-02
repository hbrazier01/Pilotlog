import type { Ledger, EntryAnchor } from "./managed/airlog/contract/index.js";

// Dynamic import ensures WASM initialization completes before contract code runs.
// Static top-level import would allow contract code (e.g. maxField()) to execute
// before await __vite__initWasm() resolves, causing wasm.maxField errors.
const ContractModule = await import("./managed/airlog/contract/index.js");

export const pureCircuits = ContractModule.pureCircuits;

// Patch the original Contract prototype to add `provableCircuits` without subclassing.
// Subclassing breaks Midnight's instanceof checks (ContractMaintenanceAuthority).
// All circuits here are impure (ZK-provable), so provableCircuits aliases circuits.
Object.defineProperty(ContractModule.Contract.prototype, 'provableCircuits', {
  get() { return this.circuits; },
  configurable: true,
  enumerable: false,
});

// Patch ContractState.maintenanceAuthority setter to accept the SDK's
// ContractMaintenanceAuthority (from midnight-sdk WASM) in addition to the
// compiled contract's own ContractMaintenanceAuthority.
//
// Problem: ContractMaintenanceAuthority and ContractState are NOT exported from
// the managed contract module, so we cannot reference their classes directly.
// The SDK's deployContract internally creates a CMA from its own WASM and tries
// to set it on the contract's ContractState — causing an instanceof failure.
//
// Fix: wrap Contract.prototype.initialState to intercept the returned ContractState
// instance at runtime, extract the CMA class from its prototype, then patch the
// maintenanceAuthority setter to bridge cross-WASM CMAs via serialize/deserialize.
{
  let patched = false;
  const originalInitialState = ContractModule.Contract.prototype.initialState as Function;

  (ContractModule.Contract.prototype as any).initialState = function(this: unknown, context: unknown, ...args: unknown[]) {
    const result = originalInitialState.call(this, context, ...args) as any;

    if (!patched && result?.currentContractState) {
      const contractState = result.currentContractState;
      const proto = Object.getPrototypeOf(contractState);
      const desc = Object.getOwnPropertyDescriptor(proto, 'maintenanceAuthority');

      if (desc && desc.set) {
        // Get the CMA class from the getter. Even if the initial state has no CMA
        // set (ptr=0), __wrap(0) still returns an object whose constructor is the
        // contract-native ContractMaintenanceAuthority class.
        let CMAClass: any = null;
        try {
          const cmaInstance = desc.get!.call(contractState);
          if (cmaInstance) CMAClass = cmaInstance.constructor;
        } catch {
          // getter may throw for a null pointer — CMAClass stays null
        }

        Object.defineProperty(proto, 'maintenanceAuthority', {
          get: desc.get,
          set(authority: unknown) {
            if (!authority || (CMAClass && authority instanceof CMAClass)) {
              // Already the correct type — pass through directly.
              desc.set!.call(this, authority);
            } else if (CMAClass && typeof (authority as any).serialize === 'function') {
              // Cross-WASM: the authority comes from a different WASM module.
              // Bridge by serializing to bytes and deserializing into the
              // contract's own ContractMaintenanceAuthority class.
              const bytes = (authority as any).serialize();
              const converted = CMAClass.deserialize(bytes);
              desc.set!.call(this, converted);
            } else {
              // Fallback: try the original setter and let it throw if incompatible.
              desc.set!.call(this, authority);
            }
          },
          configurable: true,
          enumerable: desc.enumerable,
        });

        patched = true;
      }
    }

    return result;
  };
}

export { ContractModule as Airlog };

export * from "./witnesses.js";
export type { AirlogPrivateState } from "./witnesses.js";
export { witnesses } from "./witnesses.js";
export { createAirlogPrivateState } from "./witnesses.js";

// Re-export types explicitly
export type { Ledger, EntryAnchor };
