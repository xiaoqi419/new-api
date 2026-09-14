import { useEffect, useState } from "react";

import { fetchAgentMessageAsset, isAgentMessageAsset } from "@/services/api/canvas-agent";

/**
 * Resolve an Agent message asset for a media element.
 *
 * Agent message assets are opaque references (for example
 * `agent-asset:<conversation>/<sha256>.png`).  They cannot be used directly
 * as an `<img>`/`<video>` source because the Agent requires the connect token
 * in `x-canvas-agent-token`.  Fetch the blob with that header and expose only
 * a short-lived object URL to the DOM instead.  Object URLs are revoked when
 * the source changes or the component unmounts.
 */
export function useAgentMessageAssetUrl(endpoint: string, token: string, source = "") {
    const protectedAsset = isAgentMessageAsset(source);
    const opaqueAsset = source.startsWith("agent-asset:");
    const safeSource = opaqueAsset && !protectedAsset ? "" : source;
    const [resolvedUrl, setResolvedUrl] = useState(() => (protectedAsset ? "" : safeSource));

    useEffect(() => {
        let disposed = false;
        let objectUrl = "";
        const controller = new AbortController();

        if (!safeSource) {
            setResolvedUrl("");
            return () => controller.abort();
        }

        if (!protectedAsset) {
            setResolvedUrl(safeSource);
            return () => controller.abort();
        }

        setResolvedUrl("");
        void fetchAgentMessageAsset(endpoint, token, source, controller.signal)
            .then((blob) => {
                if (!blob || disposed) return;
                // Older browsers and some test DOMs may not expose object URL
                // helpers.  Leave the preview unavailable in that case rather
                // than placing the opaque asset reference in the DOM.
                if (typeof URL.createObjectURL !== "function") return;
                objectUrl = URL.createObjectURL(blob);
                if (disposed) {
                    URL.revokeObjectURL(objectUrl);
                    objectUrl = "";
                    return;
                }
                setResolvedUrl(objectUrl);
            })
            .catch(() => {
                if (!disposed) setResolvedUrl("");
            });

        return () => {
            disposed = true;
            controller.abort();
            if (objectUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
            objectUrl = "";
        };
    }, [endpoint, protectedAsset, safeSource, source, token]);

    return resolvedUrl;
}
