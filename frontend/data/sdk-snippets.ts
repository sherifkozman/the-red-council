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
    installation: 'pip install langchain the-red-council',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `from langchain.callbacks import BaseCallbackHandler
from the_red_council import RedCouncilCallback
import os

# Initialize the callback handler
red_council = RedCouncilCallback(
    session_id="${safeSessionId}",
    endpoint="${safeEndpoint}",
    api_key=os.environ.get("RC_API_KEY", "YOUR_API_KEY") # Warning: Use env vars!
)

# Use it in your chain or agent
agent.run(
    "Analyze the security of this prompt",
    callbacks=[red_council]
)`
    }
  },
  {
    id: 'langgraph',
    name: 'LangGraph',
    language: 'python',
    description: 'Integration with LangGraph via state inspection',
    installation: 'pip install langgraph the-red-council',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `from langgraph.graph import StateGraph
from the_red_council import RedCouncilMonitor

# Initialize the monitor
monitor = RedCouncilMonitor(
    session_id="${safeSessionId}",
    endpoint="${safeEndpoint}"
)

# Wrap your graph execution
async def run_agent(inputs):
    async with monitor.trace():
        result = await app.ainvoke(inputs)
        return result`
    }
  },
  {
    id: 'mcp',
    name: 'MCP',
    language: 'typescript',
    description: 'Model Context Protocol integration',
    installation: 'npm install @modelcontextprotocol/sdk @red-council/mcp',
    code: (sessionId, endpointUrl) => {
      const safeSessionId = sanitize(sessionId)
      const safeEndpoint = sanitize(endpointUrl)
      return `import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { RedCouncilInterceptor } from "@red-council/mcp";

// Initialize the interceptor
const interceptor = new RedCouncilInterceptor({
  sessionId: "${safeSessionId}",
  endpoint: "${safeEndpoint}"
});

// Create your MCP server
const server = new Server(
  {
    name: "my-agent",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Attach the interceptor
interceptor.attach(server);`
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