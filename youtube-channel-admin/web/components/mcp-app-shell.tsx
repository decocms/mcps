import type { ReactNode } from "react";
import { useMcpHostContext } from "@/context.tsx";

export function McpAppShell({ children }: { children: ReactNode }) {
  const hostContext = useMcpHostContext();
  const insets = hostContext?.safeAreaInsets;

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      style={
        insets
          ? {
              paddingTop: `${insets.top}px`,
              paddingRight: `${insets.right}px`,
              paddingBottom: `${insets.bottom}px`,
              paddingLeft: `${insets.left}px`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
