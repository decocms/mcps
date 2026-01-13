/**
 * Central export point for all tools organized by domain.
 *
 * Exporta array de funções (createTool).
 * O runtime chama cada função com env para criar as tools.
 */
import {
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
} from "./hyperdx.ts";

// Export array of tool creator functions (same pattern as registry)
export const tools = [
  createSearchLogsTool,
  createGetLogDetailsTool,
  createQueryChartDataTool,
];
