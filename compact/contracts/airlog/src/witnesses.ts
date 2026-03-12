import { Contract as ContractType, Witnesses } from "./managed/airlog/contract/index.cjs";

// AirLog v1 has no witness functions and no private state.
export type Contract<T, W extends Witnesses<T> = Witnesses<T>> = ContractType<T, W>;

// Empty private state (required by deployContract API shape)
export type AirlogPrivateState = {};

export function createAirlogPrivateState(): AirlogPrivateState {
  return {};
}

export const witnesses = {};
