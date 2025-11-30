/**
 * Store Component
 *
 * Displays available integrations and their tools.
 * When a tool is clicked, it sets the step action to use that tool.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, Suspense, useCallback } from "react";
import { Avatar } from "@decocms/ui/components/avatar.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@decocms/ui/components/card.tsx";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@decocms/ui/components/tooltip.tsx";
import {
  type Integration,
  type Tool,
  useIntegrations,
  useIntegrationTools,
} from "@/lib/hooks";
import { useWorkflowEditorActions } from "@/stores/workflow-editor-store";

// ============================================================================
// Types
// ============================================================================

interface StoreProps {
  query: string;
}

interface ToolBadgeProps {
  tool: Tool;
  onSelect: (toolName: string) => void;
}

// ============================================================================
// Tool Badge Component
// ============================================================================

const ToolBadge = memo(function ToolBadge({ tool, onSelect }: ToolBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          onClick={() => onSelect(tool.name)}
          className="flex items-center gap-1.5 cursor-pointer hover:bg-primary/20 transition-colors"
        >
          <Icon name="bolt" size={12} />
          <span className="truncate text-xs">{tool.name}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {tool.description ? (
          <p className="text-sm">{tool.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
});

// ============================================================================
// Integration Tools Component
// ============================================================================

interface IntegrationToolsProps {
  integrationId: string;
  onSelectTool: (integrationId: string, toolName: string) => void;
}

const IntegrationTools = memo(function IntegrationTools({
  integrationId,
  onSelectTool,
}: IntegrationToolsProps) {
  const { data } = useIntegrationTools({ integrationId });
  const tools = data?.items ?? [];

  const handleSelect = useCallback(
    (toolName: string) => onSelectTool(integrationId, toolName),
    [integrationId, onSelectTool],
  );

  if (tools.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No tools available</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((tool) => (
        <ToolBadge key={tool.name} tool={tool} onSelect={handleSelect} />
      ))}
    </div>
  );
});

// ============================================================================
// Integration Card Component
// ============================================================================

interface IntegrationCardProps {
  integration: Integration;
  onSelectTool: (integrationId: string, toolName: string) => void;
}

const IntegrationCard = memo(function IntegrationCard({
  integration,
  onSelectTool,
}: IntegrationCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center gap-2">
          {integration.icon && (
            <Avatar
              url={integration.icon}
              fallback={<Icon name="apps" size={16} />}
              className="h-6 w-6"
            />
          )}
          <CardTitle className="text-sm font-medium truncate">
            {integration.name}
          </CardTitle>
          {integration.tools?.length ? (
            <Badge variant="secondary" className="ml-auto text-xs">
              {integration.tools.length}
            </Badge>
          ) : null}
        </div>
        {integration.description && (
          <CardDescription className="text-xs line-clamp-2 mt-1">
            {integration.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 py-2">
              <Spinner size="xs" />
              <span className="text-xs text-muted-foreground">
                Loading tools...
              </span>
            </div>
          }
        >
          <IntegrationTools
            integrationId={integration.id}
            onSelectTool={onSelectTool}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Store List Component
// ============================================================================

interface StoreListProps {
  integrations: Integration[];
  onSelectTool: (integrationId: string, toolName: string) => void;
}

const StoreList = memo(function StoreList({
  integrations,
  onSelectTool,
}: StoreListProps) {
  console.log("StoreList integrations:", integrations);

  // Sort by tool count (most tools first)
  const sorted = [...integrations].sort(
    (a, b) => (b.tools?.length ?? 0) - (a.tools?.length ?? 0),
  );

  console.log("StoreList sorted:", sorted.length);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Icon name="search_off" size={32} className="mb-2 opacity-50" />
        <p className="text-sm">No integrations found</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {sorted.map((integration) => (
        <IntegrationCard
          key={integration.id}
          integration={integration}
          onSelectTool={onSelectTool}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Main Store Component
// ============================================================================

function Store({
  query,
  onSelectTool,
}: StoreProps & {
  onSelectTool: (integrationId: string, toolName: string) => void;
}) {
  const result = useIntegrations({ query });

  console.log("Store result:", result);
  console.log("Store data:", result.data);
  console.log("Store items:", result.data?.items);

  const integrations = result.data?.items ?? [];

  if (integrations.length === 0) {
    return (
      <div>
        DEBUG: No integrations in data. Raw: {JSON.stringify(result.data)}
      </div>
    );
  }

  return <StoreList integrations={integrations} onSelectTool={onSelectTool} />;
}

// ============================================================================
// Suspense Wrapper
// ============================================================================

export function SuspenseStore({ query }: StoreProps) {
  const actions = useWorkflowEditorActions();

  const handleSelectTool = useCallback(
    (integrationId: string, toolName: string) => {
      actions.updateSelectedStepAction({
        connectionId: integrationId,
        toolName,
      });
      actions.setStepEditorTab("action");
    },
    [actions],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="store" size={20} className="text-primary" />
        <h2 className="font-medium">Integrations</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a tool to use it in this step
      </p>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-8">
            <Spinner size="default" />
          </div>
        }
      >
        <Store query={query} onSelectTool={handleSelectTool} />
      </Suspense>
    </div>
  );
}
