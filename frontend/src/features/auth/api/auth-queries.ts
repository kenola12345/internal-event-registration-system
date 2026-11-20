import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginInput, User } from "@template/shared";

import { ApiError } from "@/lib/api-client";

import { fetchMe, login, logout } from "./auth.api";

export const authKeys = {
  me: ["auth", "me"] as const,
};

/** The logged-in user, or null for a guest. A 401 is a normal answer here, not an error. */
export const meQueryOptions = () =>
  queryOptions({
    queryKey: authKeys.me,
    queryFn: async (): Promise<User | null> => {
      try {
        return await fetchMe();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity, // only changes on login / logout, which update the cache themselves
    retry: false,
  });

export function useMe() {
  const { data, isPending } = useQuery(meQueryOptions());
  return { user: data ?? null, isLoading: isPending };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Drop ALL cached data so the next user never sees the previous user's data.
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
