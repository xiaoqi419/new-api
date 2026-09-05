import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adjustQuota } from "../api";
import type { AdjustQuotaPayload } from "../types";
import { useAuthStore } from "../../../stores/auth-store";

export function useQuotaAdjustment(userId: number | null, onSuccess?: () => void | Promise<void>) {
  const queryClient = useQueryClient();
  const { activeSiteId, sites } = useAuthStore();
  const generation = sites[activeSiteId].generation;

  return useMutation({
    mutationFn: (payload: AdjustQuotaPayload) => adjustQuota(payload),
    onSuccess: async () => {
      if (userId !== null) {
        const detailKey = ["site", activeSiteId, generation, "user-detail", userId];
        const topUpsKey = ["site", activeSiteId, generation, "user-topups", userId];
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["user-detail", userId], refetchType: "none" }),
          queryClient.invalidateQueries({ queryKey: ["user-topups", userId], refetchType: "none" }),
          queryClient.invalidateQueries({ queryKey: detailKey, refetchType: "none" }),
          queryClient.invalidateQueries({ queryKey: topUpsKey, refetchType: "none" }),
        ]);
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["user-detail", userId], type: "active" }),
          queryClient.refetchQueries({ queryKey: ["user-topups", userId], type: "active" }),
          queryClient.refetchQueries({ queryKey: detailKey, type: "active" }),
          queryClient.refetchQueries({ queryKey: topUpsKey, type: "active" }),
        ]);
      }
      await onSuccess?.();
    },
  });
}
