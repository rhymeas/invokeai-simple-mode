import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "simple-mode" / "app.js"
SERVER = ROOT / "simple-mode" / "simple_mode_server.py"
LAUNCHER = ROOT / "launcher-src" / "Program.cs"

HIT_RE = re.compile(r"/api/[A-Za-z0-9_/${}\-?=.()]+")
EXACT_RE = re.compile('(?:parsed\\.path|path) == "(/api/[^"]+)"')
PREFIX_RE = re.compile('path\\.startswith\\("(/api/[^"]+)"\\)')


def normalize(hit):
    base = hit.split("?")[0]
    if "${" in base or "{" in base:
        base = base.split("${")[0].split("{")[0]
        return base if base.endswith("/") else base + "/"
    return base.rstrip("/") or "/"


def caller_paths():
    found = set()
    for path in (APP_JS, LAUNCHER):
        text = path.read_text(encoding="utf-8")
        for hit in HIT_RE.findall(text):
            if hit.startswith("/api/v1/"):
                continue
            found.add(normalize(hit))
    return found


def server_routes():
    text = SERVER.read_text(encoding="utf-8")
    exact = set(EXACT_RE.findall(text))
    prefixes = set(PREFIX_RE.findall(text))
    return exact, prefixes


def route_is_called(route, callers):
    if route.endswith("/"):
        return route in callers
    return any(c == route or c.startswith(route + "/") or c == route + "/" for c in callers)


class ApiContractTests(unittest.TestCase):
    def test_every_frontend_call_matches_a_server_route(self):
        exact, prefixes = server_routes()
        missing = [
            path for path in sorted(caller_paths())
            if path not in exact and not any(path.startswith(prefix) for prefix in prefixes)
        ]
        self.assertEqual([], missing)

    def test_every_server_route_has_a_caller(self):
        exact, prefixes = server_routes()
        callers = caller_paths()
        unused = [route for route in sorted(exact | prefixes) if not route_is_called(route, callers)]
        self.assertEqual([], unused)


if __name__ == "__main__":
    unittest.main()
