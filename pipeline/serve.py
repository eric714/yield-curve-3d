#!/usr/bin/env python3
"""
Local development server.

Python's built-in http.server lets the browser cache modules, which means an
edit to a .js file is silently ignored until the cache expires. That wastes a
lot of time and, worse, makes you draw conclusions from code that is no longer
running. This is the same server with caching turned off.

    python3 pipeline/serve.py [port]

For anything other than local development, the site is static files; serve them
with whatever you like.
"""

import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


def main():
    # Stamp before serving: this is the thing you run while changing code, so
    # it is the moment the stamp is most likely to be out of date.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import stamp
    stamp.main()

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port} with caching disabled")
        print("Ctrl+C to stop")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
