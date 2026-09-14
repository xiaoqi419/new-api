import { Alert, Button } from "antd";

import { isEmbedded, sanitizeHostError, useHostTokensStore } from "@/lib/host-bridge";
import { retryHostBootstrap, useHostBootstrapStore } from "@/lib/host-bootstrap";
import { useCanvasTranslation } from "@/lib/canvas-i18n";

function safeDescription(value: unknown, fallback: string) {
    const sanitized = sanitizeHostError(value);
    return sanitized === "请求失败" ? fallback : sanitized;
}

function openHostKeys() {
    if (typeof window === "undefined") return;
    const target = window.parent !== window ? window.parent : window;
    target.location.assign("/keys");
}

/** A non-blocking recovery banner for the embedded host key/model bootstrap. */
export function HostBootstrapStatus() {
    const tokenState = useHostTokensStore();
    const bootstrap = useHostBootstrapStore();
    const { t } = useCanvasTranslation();
    if (!isEmbedded()) return null;

    if (tokenState.status === "loading") return null;

    if (tokenState.status === "error") {
        return (
            <div className="pointer-events-none fixed inset-x-0 top-3 z-[1400] flex justify-center px-3">
                <Alert
                    className="pointer-events-auto w-full max-w-2xl shadow-lg"
                    type="error"
                    showIcon
                    message={t("host.keyLoadFailed")}
                    description={safeDescription(tokenState.error, t("host.keyLoadFailedDescription"))}
                    action={
                        <div className="flex shrink-0 gap-2">
                            <Button size="small" onClick={retryHostBootstrap}>
                                {t("host.retry")}
                            </Button>
                            <Button size="small" type="primary" onClick={openHostKeys}>
                                {t("host.manageKeys")}
                            </Button>
                        </div>
                    }
                />
            </div>
        );
    }

    if (tokenState.status === "ready" && !tokenState.tokens.length) {
        return (
            <div className="pointer-events-none fixed inset-x-0 top-3 z-[1400] flex justify-center px-3">
                <Alert
                    className="pointer-events-auto w-full max-w-2xl shadow-lg"
                    type="warning"
                    showIcon
                    message={t("host.noEnabledKey")}
                    description={t("host.noEnabledKeyDescription")}
                    action={
                        <Button size="small" type="primary" onClick={openHostKeys}>
                            {t("host.manageKeys")}
                        </Button>
                    }
                />
            </div>
        );
    }

    if (bootstrap.modelStatus !== "error") return null;
    return (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[1400] flex justify-center px-3">
            <Alert
                className="pointer-events-auto w-full max-w-2xl shadow-lg"
                type="warning"
                showIcon
                message={t("host.modelCheckRequired")}
                description={safeDescription(bootstrap.modelError, t("host.noImageModel"))}
                action={
                    <div className="flex shrink-0 gap-2">
                        <Button size="small" onClick={retryHostBootstrap}>
                            {t("host.retry")}
                        </Button>
                        <Button size="small" type="primary" onClick={openHostKeys}>
                            {t("host.manageKeys")}
                        </Button>
                    </div>
                }
            />
        </div>
    );
}
