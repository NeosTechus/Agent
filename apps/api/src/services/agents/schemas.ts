// Agent service schemas — re-export from `@app/types/agents` so frontend
// and backend share the exact same Zod definitions.

export {
  capabilitiesSchema,
  voiceSchema,
  agentStatusSchema,
  agentSchema,
  createAgentSchema,
  updateAgentSchema,
  agentVersionSchema,
  rollbackSchema,
  testCallSchema,
  e164Schema,
} from "@app/types/agents";

export type {
  Capabilities,
  Voice,
  AgentStatus,
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentVersion,
  RollbackInput,
  TestCallInput,
} from "@app/types/agents";
