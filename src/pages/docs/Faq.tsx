import { Helmet } from "react-helmet-async";
import { DocPage, H2, P, Lead } from "./DocsLayout";

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "What's the latency overhead?", a: "Median proxy overhead is under 5ms. The dominant cost is your upstream provider, not AnveGuard. Streaming responses are relayed without buffering." },
  { q: "Where are credentials stored?", a: "Upstream provider keys are encrypted with AES-GCM using a workspace-derived key before being written to the database. They are never returned to the dashboard or visible to other workspace members." },
  { q: "Are prompts and responses stored?", a: "Yes — request and response payloads are stored in the request log for 30 days so you can debug and audit. We do not train any model on your data and we don't share it with third parties beyond the upstream provider you chose." },
  { q: "Can I self-host?", a: "The proxy is a single Edge Function with a Postgres backend. We're working on a Docker-based self-host distribution. Contact us if you need it sooner." },
  { q: "Does AnveGuard rate-limit my requests?", a: "No. We don't add rate limits beyond what your upstream provider enforces. If you need spend caps, they're on the roadmap." },
  { q: "Do policies work with streaming?", a: "Input policies run before the stream starts. Output policies run on the assembled transcript after the stream ends, since we can't undo bytes already sent." },
  { q: "How do I get help?", a: "Email support@anveguard.app or open the in-app chat. Include the request id from the log row — it shortens our response time considerably." },
];

const Faq = () => (
  <>
    <Helmet>
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      })}</script>
    </Helmet>
    <DocPage
    eyebrow="Reference · FAQ"
    title="FAQ"
    lede="Short answers to the questions operators ask in their first week."
  >
    <H2 id="overhead">What's the latency overhead?</H2>
    <Lead>
      Median proxy overhead is under 5ms. The dominant cost is your upstream provider, not
      AnveGuard. Streaming responses are relayed without buffering.
    </Lead>

    <H2 id="storage">Where are credentials stored?</H2>
    <P>
      Upstream provider keys are encrypted with AES-GCM using a workspace-derived key
      before being written to the database. They are never returned to the dashboard or
      visible to other workspace members.
    </P>

    <H2 id="payloads">Are prompts and responses stored?</H2>
    <P>
      Yes — request and response payloads are stored in the request log for 30 days so you
      can debug and audit. We do not train any model on your data and we don't share it
      with third parties beyond the upstream provider you chose.
    </P>

    <H2 id="self-host">Can I self-host?</H2>
    <P>
      The proxy is a single Edge Function with a Postgres backend. We're working on a
      Docker-based self-host distribution. Contact us if you need it sooner.
    </P>

    <H2 id="rate-limits">Does AnveGuard rate-limit my requests?</H2>
    <P>
      No. We don't add rate limits beyond what your upstream provider enforces. If you
      need spend caps, they're on the roadmap — track progress in the changelog.
    </P>

    <H2 id="streaming-policies">Do policies work with streaming?</H2>
    <P>
      Input policies run before the stream starts. Output policies run on the assembled
      transcript after the stream ends, since we can't undo bytes already sent. If you
      need pre-flight content classification, run it before calling AnveGuard.
    </P>

    <H2 id="contact">How do I get help?</H2>
    <P>
      Email support@anveguard.app or open the in-app chat. Include the request id from the
      log row — it shortens our response time considerably.
    </P>
    </DocPage>
  </>
);

export default Faq;
