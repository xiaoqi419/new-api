import { useEffect, useRef } from "react";
import { Alert, Button } from "antd";

import { isEmbedded, sanitizeHostError, useHostTokensStore } from "@/lib/host-bridge";
import { retryHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { useCanvasTranslation } from "@/lib/canvas-i18n";
import { useConfigStore } from "@/stores/use-config-store";

function safeDescription(value: unknown, fallback: string) {
    const sanitized = sanitizeHostError(value);
    return sanitized === "请求失败" ? fallback : sanitized;
}

function hasConfiguredChannel(channels: Array<{ apiKey?: string; models?: unknown[] }> | undefined) {
    return (channels || []).some((channel) => Boolean(channel?.apiKey?.trim()) && Array.isArray(channel.models) && channel.models.length > 0);
}

/** Open the settings dialog once when unconfigured; never trap a successful save. */
export function HostBootstrapStatus() {
    const tokenState = useHostTokensStore();
    const bootstrap = useHostBootstrapStore();
    const { t } = useCanvasTranslation();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const channels = useConfigStore((state) => state.config.channels);
    const embedded = isEmbedded();
    const dismissedRef = useRef(false);
    const wasOpenRef = useRef(isConfigOpen);
    const configured = hasConfiguredChannel(channels);

    const needsConfigDialog = embedded && !configured && ((tokenState.status === "ready" && !tokenState.tokens.length) || bootstrap.modelStatus === "error" || (tokenState.status === "error" && bootstrap.status !== "error"));

    useEffect(() => {
        if (wasOpenRef.current && !isConfigOpen && needsConfigDialog) {
            dismissedRef.current = true;
        }
        wasOpenRef.current = isConfigOpen;
    }, [isConfigOpen, needsConfigDialog]);

    useEffect(() => {
        if (!needsConfigDialog) {
            dismissedRef.current = false;
            return;
        }
        if (isConfigOpen || dismissedRef.current) return;
        openConfigDialog(false, "channels");
    }, [isConfigOpen, needsConfigDialog, openConfigDialog]);

    if (!embedded) return null;
    if (tokenState.status === "loading") return null;

    if (bootstrap.status === "error" && tokenState.status === "error") {
        return (
            <div className="pointer-events-none fixed inset-x-0 top-3 z-[1400] flex justify-center px-3">
                <Alert
                    className="pointer-events-auto w-full max-w-2xl shadow-lg"
                    type="error"
                    showIcon
                    message={t("host.keyLoadFailed")}
                    description={safeDescription(tokenState.error || bootstrap.error, t("host.keyLoadFailedDescription"))}
                    action={
                        <Button size="small" onClick={retryHostBootstrap}>
                            {t("host.retry")}
                        </Button>
                    }
                />
            </div>
        );
    }

    return null;
}
