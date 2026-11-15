import json
from pathlib import Path
import runpy
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'playtest-fetch-restart.py'))


class RestartHarnessTests(unittest.TestCase):
    def test_world_guard_rejects_other_saves_and_multiplayer(self):
        state = {'saveName': 'Codex Test', 'singleplayer': True, 'players': [{}]}
        API['guard_world'](state, 'Codex Test')
        for changed, expected in [(state, ''), (state, 'Other'),
                                  ({**state, 'saveName': 'Family'}, 'Family'),
                                  ({**state, 'singleplayer': False}, 'Codex Test'),
                                  ({**state, 'players': [{}, {}]}, 'Codex Test')]:
            with self.assertRaises(ValueError):
                API['guard_world'](changed, expected)

    def test_conservation_counts_expose_duplicate_ground_and_carried_toys(self):
        toy = 'mushroom_yorkie:yorkie_ball'
        state = {'players': [{'nearbyEntities': [
            {'type': 'minecraft:item', 'item': {'id': toy, 'count': 1}},
            {'type': API['YORKIE'], 'mainHand': {'id': toy, 'count': 1}},
            {'type': 'minecraft:item', 'item': {'id': 'minecraft:stick', 'count': 64}}
        ]}]}
        self.assertEqual(API['toy_counts'](state, toy), (1, 1))

    def test_jar_guard_requires_one_of_each_mod_not_just_two_jars(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = Path(folder)
            mods = profile / 'mods'
            mods.mkdir()
            (mods / 'mushroom-the-yorkie-0.1.2.jar').write_bytes(b'mushroom')
            (mods / 'mushroom-the-yorkie-old.jar').write_bytes(b'old mushroom')
            with self.assertRaises(ValueError):
                API['installed_jars'](profile)
            (mods / 'mushroom-the-yorkie-old.jar').unlink()
            with self.assertRaises(ValueError):
                API['installed_jars'](profile)
            (mods / 'playtest-bridge-0.1.0.jar').write_bytes(b'bridge')
            self.assertEqual(len(API['installed_jars'](profile)), 2)

    def test_partial_report_survives_a_later_update(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'reports' / 'progress.json'
            API['write_report'](path, {'stage': 'carried', 'complete': False})
            self.assertEqual(json.loads(path.read_text())['stage'], 'carried')
            API['write_report'](path, {'stage': 'error', 'failedStage': 'relaunching', 'complete': False})
            self.assertEqual(json.loads(path.read_text())['failedStage'], 'relaunching')
            self.assertFalse(path.with_name(path.name + '.tmp').exists())

    def test_lock_excludes_node_matrix_and_releases_after_error(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(RuntimeError, 'test failure'):
                with API['bridge_lock']('http://localhost:57321', folder):
                    javascript = "require(process.argv[1]).withBridgeLock('http://127.0.0.1:57321', async () => {}, process.argv[2]).catch(e => {console.error(e.message); process.exitCode=1;});"
                    lock_module = Path(__file__).resolve().parents[2] / 'tools/playtest-harness/src/bridge-lock.js'
                    result = subprocess.run(['node', '-e', javascript, str(lock_module), folder], text=True, capture_output=True)
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('Another scenario owns', result.stderr)
                    raise RuntimeError('test failure')
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_bridge_distinguishes_parse_rejection_from_zero_change(self):
        replies = iter([{'ok': True, 'callbackSeen': False},
                        {'ok': True, 'callbackSeen': True, 'success': False, 'result': 0}])

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers['content-length']))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(next(replies)).encode())

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = API['Bridge']('127.0.0.1', server.server_port)
            with self.assertRaises(RuntimeError):
                client.command('bad command')
            self.assertEqual(client.command('clear test item 0')['result'], 0)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
