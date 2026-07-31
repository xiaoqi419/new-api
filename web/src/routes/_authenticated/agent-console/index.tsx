import { createFileRoute } from '@tanstack/react-router'

import { AgentConsole } from '@/features/agent-console'

export const Route = createFileRoute('/_authenticated/agent-console/')({
  component: AgentConsole,
})
