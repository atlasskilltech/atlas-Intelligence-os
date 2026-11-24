// Demo project with the ATLAS Agent API. Run:  node examples/agent-api-node/server.mjs
// It prints two keys (read-only and read+write). In IntelligenceOS → Connectors → Connect project,
// use URL http://127.0.0.1:4010/agent-api (add 127.0.0.1 to INTERNAL_ALLOWED_HOSTS) and one of the keys.
import { PRESETS, createAgentApi, createKey } from "./agentApi.mjs";

const port = Number(process.env.PORT || 4010);
const ro = createKey({ name: "IntelligenceOS (read only)", scopes: PRESETS.read_only });
const rw = createKey({ name: "IntelligenceOS (read + write)", scopes: PRESETS.read_write });
const api = createAgentApi({ keys: [ro.record, rw.record] });
api.server.listen(port, "127.0.0.1", () => {
  console.log(`Demo project Agent API: http://127.0.0.1:${port}/agent-api`);
  console.log(`Read-only key:    ${ro.key}`);
  console.log(`Read+write key:   ${rw.key}`);
});
