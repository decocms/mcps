import type { Env } from "../main.ts";

export const CHAT_CONTRACT_CLAUSE_ID = "openrouter:chat";
export const MICRO_DOLLAR_PRICE = 0.000001;

export function toMicroDollarUnits(totalUsd?: number): number | undefined {
  if (totalUsd === undefined || !Number.isFinite(totalUsd) || totalUsd <= 0) {
    return undefined;
  }

  return Math.max(1, Math.ceil(totalUsd / MICRO_DOLLAR_PRICE));
}

export async function settleChatContract(env: Env, microUnits: number) {
  if (!env.OPENROUTER_CHAT_CONTRACT || microUnits <= 0) {
    return;
  }

  try {
    const { transactionId } =
      await env.OPENROUTER_CHAT_CONTRACT.CONTRACT_AUTHORIZE({
        clauses: [
          {
            clauseId: CHAT_CONTRACT_CLAUSE_ID,
            amount: microUnits,
          },
        ],
      });

    await env.OPENROUTER_CHAT_CONTRACT.CONTRACT_SETTLE({
      transactionId,
      clauses: [
        {
          clauseId: CHAT_CONTRACT_CLAUSE_ID,
          amount: microUnits,
        },
      ],
      vendorId: env.DECO_CHAT_WORKSPACE,
    });
  } catch (error) {
    console.error("Failed to settle OpenRouter chat contract", error);
  }
}
