# dlprevent-guard's trained classifier: one model behind POST {"inputs": text},
# answering [{"label", "score"}, ...] the way the engine's
# `trainedClassifierCheck` reads it. Reached from the guard only, on the compose
# network. Logs no text: a request line would carry nothing, the body is the
# prompt.
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from transformers import pipeline

# Every label with its score, not only the likeliest: the engine looks for the
# attack label's score. Longer text is cut at the model's 512 tokens.
classify = pipeline(
    "text-classification",
    model=os.environ.get("CLASSIFIER_MODEL", "protectai/deberta-v3-base-prompt-injection-v2"),
    top_k=None,
    truncation=True,
    max_length=512,
)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))))
        out = json.dumps(classify(str(body["inputs"]))).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *args):
        pass


# ponytail: one request at a time — the guard waits on each piece anyway;
# a batching server (TEI, Triton) if it becomes the bottleneck.
HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
