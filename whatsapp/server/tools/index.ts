import { phoneNumbersTools } from "./phone-numbers.ts";
import { env } from "../env.ts";

export const tools = env.ENABLE_MANAGEMENT_TOOLS ? [...phoneNumbersTools] : [];
