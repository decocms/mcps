import { client } from "./rpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FailedToFetchUserError } from "@/components/logged-provider";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

/**
 * This hook will throw an error if the user is not logged in.
 * You can safely use it inside routes that are protected by the `LoggedProvider`.
 */
export const useUser = () => {
  return useSuspenseQuery({
    queryKey: ["user"],
    queryFn: () =>
      client.GET_USER(
        {},
        {
          handleResponse: (res: Response) => {
            if (res.status === 401) {
              throw new FailedToFetchUserError(
                "Failed to fetch user",
                globalThis.location.href,
              );
            }

            return res.json();
          },
        },
      ),
    retry: false,
  });
};

/**
 * This hook will return null if the user is not logged in.
 * You can safely use it inside routes that are not protected by the `LoggedProvider`.
 * Good for pages that are public, for example.
 */
export const useOptionalUser = () => {
  return useSuspenseQuery({
    queryKey: ["user"],
    queryFn: () =>
      client.GET_USER(
        {},
        {
          handleResponse: async (res: Response) => {
            if (res.status === 401) {
              return null;
            }
            return res.json();
          },
        },
      ),
    retry: false,
  });
};

export const useWorkflow = (id: string) => {
  return useSuspenseQuery({
    queryKey: ["workflow", id],
    queryFn: () => client.COLLECTION_WORKFLOW_GET({ id }),
    retry: false,
  });
};

export type Integration = NonNullable<
  Awaited<ReturnType<typeof client.STORE_LIST_INTEGRATIONS>>
>["items"][number];
export const useIntegrations = ({ query }: { query: string }) => {
  return useSuspenseQuery({
    queryKey: ["integrations", query],
    queryFn: () =>
      client.STORE_LIST_INTEGRATIONS({
        query,
      }),
    retry: false,
  });
};

export type Tool = NonNullable<
  Awaited<ReturnType<typeof client.STORE_LIST_INTEGRATION_TOOLS>>
>["items"][number];
export const useIntegrationTools = ({
  integrationId,
}: {
  integrationId: string;
}) => {
  return useSuspenseQuery({
    queryKey: ["integration-tools", integrationId],
    queryFn: () => client.STORE_LIST_INTEGRATION_TOOLS({ integrationId }),
    retry: false,
  });
};

export const useWorkflows = () => {
  return useSuspenseQuery({
    queryKey: ["workflows"],
    queryFn: () => client.COLLECTION_WORKFLOW_LIST({ limit: 10 }),
    retry: false,
  });
};
