import { useEffect } from "react";
import { Alert, Button } from "antd";

import { isEmbedded, sanitizeHostError, useHostTokensStore } from "@/lib/host-bridge";
import { retryHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { useCanvasTranslation } from "@/lib/canvas-i18n";
import { useConfigStore } from "@/stores/use-config-store";

function safeDescription(value: unknown, fallback: string) {
    const sanitized = sanitizeHostError(value);
    return sanitized === "请求失败" ? fallback : sanitized;
}

/** Open the settings dialog instead of the auth/model-check banner. */
export function HostBootstrapStatus() {
    const tokenState = useHostTokensStore();
    const bootstrap = useHostBootstrapStore();
    const { t } = useCanvasTranslation();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const embedded = isEmbedded();

    const needsConfigDialog = embedded && ((tokenState.status === "ready" && !tokenState.tokens.length) || bootstrap.modelStatus === "error" || (tokenState.status === "error" && bootstrap.status !== "error"));

    useEffect(() => {
        if (!needsConfigDialog || isConfigOpen) return;
        openConfigDialog(false, "channels");
    }, [isConfigOpen, needsConfigDialog, openConfigDialog]);

    if (!embedded) return null;
    if (tokenState.status === "loading") return null;

    // Untrusted-origin / infrastructure failures still need a visible error.
    // Missing keys and catalog auth failures open the config dialog instead.
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
