import { phoneNumbersTools } from "./phone-numbers.ts";
import { messagesTools } from "./messages.ts";
import { filesTools } from "./files.ts";

export const tools = [...phoneNumbersTools, ...messagesTools, ...filesTools];
