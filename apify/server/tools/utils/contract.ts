import type { Env } from "server/main";
import { CONTRACT_CLAUSES } from "../../constants";

// Contract types
export interface ContractClause {
  clauseId: string;
  amount: number;
}

export interface ContractEnv {
  APIFY_CONTRACT: {
    CONTRACT_AUTHORIZE: (params: {
      clauses: ContractClause[];
    }) => Promise<{ transactionId: string }>;
    CONTRACT_SETTLE: (params: {
      transactionId: string;
      vendorId: string;
      clauses: ContractClause[];
    }) => Promise<void>;
  };
  DECO_CHAT_WORKSPACE: string;
}

// Helper functions for contract management
export const createContractClauses = (
  computeUnits: number,
  memoryMB: number,
): ContractClause[] => [
  { clauseId: CONTRACT_CLAUSES.COMPUTE_UNITS, amount: computeUnits },
  { clauseId: CONTRACT_CLAUSES.MEMORY_MB, amount: memoryMB },
];

export const authorizeContract = async (
  env: Env,
  computeUnits: number,
  memoryMB: number,
): Promise<string> => {
  const contractEnv = env as unknown as ContractEnv;
  const result = await contractEnv.APIFY_CONTRACT.CONTRACT_AUTHORIZE({
    clauses: createContractClauses(computeUnits, memoryMB),
  });
  return result.transactionId;
};

export const settleContract = async (
  env: Env,
  transactionId: string,
  computeUnits: number,
  memoryMB: number,
): Promise<void> => {
  const contractEnv = env as unknown as ContractEnv;
  await contractEnv.APIFY_CONTRACT.CONTRACT_SETTLE({
    transactionId,
    vendorId: contractEnv.DECO_CHAT_WORKSPACE,
    clauses: createContractClauses(computeUnits, memoryMB),
  });
};
