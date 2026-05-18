import { DocPage, H2, P, Lead, UL, Pre, Table, Callout } from "./DocsLayout";
import { RequestShot } from "@/components/docs/RequestShot";

const ProxyApi = () => (
  <DocPage
    eyebrow="Reference · Proxy API"
    title="Proxy API"
    lede="AnveGuard exposes a strict subset of the OpenAI REST API. If your code talks to OpenAI today, it talks to AnveGuard tomorrow."
  >
    <H2 id="base">Base URL</H2>
    <Lead>
      <code>https://anveguard.app/v1</code>
    </Lead>

    <H2 id="auth">Authentication</H2>
    <P>
      Send your AnveGuard key as a Bearer token in the <code>Authorization</code> header.
      Anonymous requests get <code>401</code>.
    </P>
    <Pre language="http">{`POST /v1/chat/completions HTTP/1.1
Host: anveguard.app
Authorization: Bearer ag_live_…
Content-Type: application/json`}</Pre>

    <H2 id="endpoints">Endpoints</H2>
    <Table
      headers={["Method", "Path", "Notes"]}
      rows={[
        ["POST", "/v1/chat/completions", "Streaming and non-streaming. Mirrors OpenAI."],
        ["GET", "/v1/models", "Lists models reported by your endpoint."],
      ]}
    />

    <H2 id="model-resolution">Model resolution order</H2>
    <P>
      The <code>model</code> field is resolved in this order. The first match wins.
    </P>
    <UL>
      <li>Starts with <code>route:</code> → look up the named route on the workspace.</li>
      <li>Matches an alias on this key → rewrite to the alias's target.</li>
      <li>Otherwise → forward to the key's bound endpoint.</li>
    </UL>

    <H2 id="streaming">Streaming</H2>
    <P>
      Set <code>stream: true</code> as you would with OpenAI. AnveGuard relays
      Server-Sent Events with no buffering. Output policy checks run on the assembled
      transcript after the stream ends; if a violation is found, the final chunk includes
      a synthetic error and the request status is logged as <code>blocked_output</code>.
    </P>

    <H2 id="system-prompt">Custom system prompt</H2>
    <P>
      Pass an optional top-level <code>system_prompt</code> string in the request body to
      inject a per-request system message. The proxy injects it as a <code>system</code>
      message <em>after</em> the workspace guardrail prompt and <em>before</em> any messages
      the caller sent — so the workspace guardrail always leads — then strips the field
      from the payload before forwarding upstream.
    </P>

    <H2 id="system-prompt-requirements">Requirements</H2>
    <P>Two gates must both pass for a <code>system_prompt</code> to be accepted:</P>
    <UL>
      <li>
        <strong>Workspace toggle</strong> — an admin must enable
        <em> Allow per-request <code>system_prompt</code></em> under
        <strong> Policies → Guardrail prompt</strong>. When disabled, every request
        carrying the field is rejected with <code>403 system_prompt_disabled_workspace</code>.
      </li>
      <li>
        <strong>Per-key admin permission</strong> — the API key making the request must
        have the <strong>admin</strong> flag. Toggle it from the shield icon next to each
        key on the <strong>Keys</strong> page. Non-admin keys are rejected with
        <code> 403 system_prompt_forbidden</code>.
      </li>
    </UL>
    <H2 id="system-prompt-validation">Validation rules</H2>
    <P>
      Every accepted <code>system_prompt</code> must satisfy <strong>all</strong> of the
      rules below. Any failure returns <code>400 invalid_request_error</code> with{" "}
      <code>param: "system_prompt"</code> and the stable <code>code</code> shown in
      parentheses — safe to branch on from client code.
    </P>
    <UL>
      <li>
        <strong>Type</strong> — must be a JSON string.
        Anything else (number, array, object, boolean) is rejected
        (<code>code: "invalid_request_error"</code>).
      </li>
      <li>
        <strong>Non-empty</strong> — empty strings and whitespace-only strings are
        rejected. Omit the field instead of sending <code>""</code>.
      </li>
      <li>
        <strong>Length</strong> — at most <strong>16,000</strong> characters by default.
        Workspace admins can tune this from <strong>100</strong> up to{" "}
        <strong>64,000</strong> under <strong>Policies → Guardrail prompt</strong>; the
        error message echoes the active limit.
      </li>
      <li>
        <strong>No control characters</strong> — NUL and C0 controls are rejected.
        Tab (<code>\t</code>), newline (<code>\n</code>), and carriage return
        (<code>\r</code>) are allowed.
      </li>
    </UL>

    <H2 id="system-prompt-400">400 response payload</H2>
    <Pre language="json">{`HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "message": "\`system_prompt\` is too long: 24000 chars (max 16000).",
    "type": "invalid_request_error",
    "param": "system_prompt",
    "code": "invalid_request_error"
  }
}`}</Pre>

    <H2 id="system-prompt-example">Example request</H2>
    <Pre language="bash">{`curl https://anveguard.app/v1/chat/completions \\
  -H "Authorization: Bearer ag_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "system_prompt": "You are a billing assistant. Refuse non-billing questions.",
    "messages": [
      { "role": "user", "content": "How do refunds work?" }
    ]
  }'`}</Pre>

    <H2 id="system-prompt-403">403 response payload</H2>
    <P>
      Both gate failures return an OpenAI-style error envelope. The <code>code</code>{" "}
      field tells you which gate rejected the call.
    </P>
    <Pre language="json">{`HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": {
    "message": "This API key is not permitted to send a custom system_prompt. Ask a workspace admin to enable the admin permission on this key, or remove the field from the request body.",
    "type": "permission_error",
    "param": "system_prompt",
    "code": "system_prompt_forbidden"
  }
}`}</Pre>
    <P>
      When the workspace toggle is off, the same envelope is returned with{" "}
      <code>code: "system_prompt_disabled_workspace"</code> and a message pointing the
      caller at the workspace setting.
    </P>

    <H2 id="non-chat">Non-chat operations</H2>
    <Callout kind="note">
      Embeddings, images, audio, and the Responses API are on the roadmap but not yet
      proxied. Calls to those paths return <code>404 not_proxied</code>.
    </Callout>
  </DocPage>
);

export default ProxyApi;
