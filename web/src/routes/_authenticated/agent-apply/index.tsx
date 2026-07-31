import { createFileRoute } from '@tanstack/react-router'

import { AgentApply } from '@/features/agent-apply'

export const Route = createFileRoute('/_authenticated/agent-apply/')({
  component: AgentApply,
})
