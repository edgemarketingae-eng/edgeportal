import { ApiError, crmRoutes, meRoutes } from "@edge/contracts";
import type { Permission } from "@edge/domain/auth/permissions";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { buzz } from "@/components/ui";
import { api } from "./api";
import { toast } from "./toast";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api(meRoutes.me) });

export const useOptions = () => useQuery({ queryKey: ["options"], queryFn: () => api(crmRoutes.options) });

export const useLead = (id: string, activity = 30) =>
  useQuery({
    queryKey: ["lead", id, activity],
    queryFn: () => api(crmRoutes.lead, { params: { id }, query: { activity } }),
    placeholderData: keepPreviousData,
  });

/** Only decides what to show: the server checks every action itself. */
export function useCan() {
  const me = useMe();
  return (permission: Permission) => !!me.data?.permissions.includes(permission);
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "No connection. Check your signal and try again.");

/** What a sheet does once its save has worked: refresh what's on screen, confirm, close. */
export function useSaved() {
  const client = useQueryClient();
  const router = useRouter();
  return (message: string) => {
    void client.invalidateQueries();
    buzz.success();
    toast(message);
    router.back();
  };
}
