// Helper to prevent injection
const sanitize = (input: string): string => {
  return input.replace(/[^a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]/g, '')
}

export interface SDKSnippet {
  readonly id: string
  readonly name: string
  readonly language: string
  readonly description: string
  readonly installation: string
  readonly code: (sessionId: string, endpointUrl: string) => string
}

export const SDK_SNIPPETS: readonly SDKSnippet[] = [
  {
    id: 'langchain',
    name: 'LangChain',
    language: 'python',
    description: 'Integration with LangChain via callbacks',
    installation: 'pip install "the-red-council[langchain] @ git+https://github.com/YOUR_ORG/the-red-council.git"',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `from the_red_council.integrations.langchain_adapter import (
    RedCouncilCallbackHandler,
    LangChainAgentWrapper
)
import os

# Option 1: Use the callback handler directly
callback = RedCouncilCallbackHandler(
    session_id="${safeSessionId}",
    endpoint="${safeEndpoint}",
    api_key=os.environ.get("RC_API_KEY")
)
agent.run("Analyze the security of this prompt", callbacks=[callback])

# Option 2: Wrap your AgentExecutor for full instrumentation
wrapped = LangChainAgentWrapper.from_agent_executor(
    agent_executor,
    agent_id="my-langchain-agent",
    session_id="${safeSessionId}"
)
result = await wrapped.invoke({"input": "test prompt"})`
    }
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    language: 'python',
    description: 'Integration with LangGraph via state inspection',
    installation: 'pip install "the-red-council[langgraph] @ git+https://github.com/YOUR_ORG/the-red-council.git"',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `from the_red_council.integrations.langgraph_adapter import LangGraphAgentWrapper
from langgraph.graph import StateGraph

# Wrap your StateGraph for full instrumentation
wrapped = LangGraphAgentWrapper.from_state_graph(
    graph,  # Your StateGraph instance
    agent_id="my-langgraph-agent",
    session_id="${safeSessionId}"
)

# All node executions and state changes are automatically captured
result = await wrapped.invoke({"input": "test prompt"})

# Or use streaming for real-time events
async for event in wrapped.astream({"input": "test prompt"}):
    print(event)`
    }
  },
  {
    id: 'custom',
    name: 'Custom / REST',
    language: 'bash',
    description: 'Direct API integration using curl',
    installation: '# No installation required',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `curl -X POST "${safeEndpoint}/v1/events" \
  -H "Authorization: Bearer $RC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "${safeSessionId}",
    "type": "tool_call",
    "data": {
      "tool": "calculator",
      "args": { "expression": "2 + 2" }
    }
  }'`
    }
  }
]
