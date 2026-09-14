import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { HostBootstrapStatus } from "@/components/layout/host-bootstrap-status";
import { isEmbedded } from "@/lib/host-bridge";

export default function UserLayout({ children }: { children: ReactNode }) {
    const embedded = isEmbedded();

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            {!embedded ? <AgentPanel /> : null}
            <HostBootstrapStatus />
        </div>
    );
}
