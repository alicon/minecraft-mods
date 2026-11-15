#!/usr/bin/env python3
"""Verify one carried toy survives a normal saved client restart in a disposable world."""
import argparse
from contextlib import contextmanager
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
YORKIE = 'mushroom_yorkie:mushroom_yorkie'
TOYS = ('mushroom_yorkie:yorkie_ball', 'mushroom_yorkie:yorkie_chew_toy', 'minecraft:bone')


def guard_world(state, expected):
    if not expected or state.get('saveName') != expected:
        raise ValueError('Exact --expected-save must match the loaded world')
    if not expected.startswith(('Codex ', 'Mushroom Matrix ', 'Mushroom Abel Noelle ')):
        raise ValueError('A disposable test save prefix is required')
    if not state.get('singleplayer') or len(state.get('players', [])) != 1:
        raise ValueError('Exactly one player in a single-player world is required')


def toy_counts(state, toy):
    entities = state['players'][0]['nearbyEntities']
    ground = sum(e['item']['count'] for e in entities if e['type'] == 'minecraft:item' and e.get('item', {}).get('id') == toy)
    held = sum(e['mainHand']['count'] for e in entities if e['type'] == YORKIE and e.get('mainHand', {}).get('id') == toy)
    return ground, held


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(path)


class Bridge:
    def __init__(self, host, port):
        if host not in ('127.0.0.1', 'localhost') or not 1 <= port <= 65535:
            raise ValueError('Use a loopback bridge and valid port')
        self.base = f'http://{host}:{port}'

    def request(self, route, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base + route, data=data, headers={} if body is None else {'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'{route}: {error.read().decode(errors="replace")[:1200]}') from error
        if result.get('ok') is False or result.get('callbackSeen') is False:
            raise RuntimeError(f'{route}: {result}')
        return result

    def command(self, command):
        return self.request('/command', {'command': command})



@contextmanager
def bridge_lock(base, directory=None):
    key = hashlib.sha256(base.replace('localhost', '127.0.0.1').encode()).hexdigest()[:16]
    path = Path(directory or tempfile.gettempdir()) / f'minecraft-bridge-{key}.lock'
    for _ in range(2):
        try:
            handle = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            text = path.read_text()
            if text.isdigit() and int(text) > 0:
                try:
                    os.kill(int(text), 0)
                except ProcessLookupError:
                    path.unlink()
                    continue
            raise RuntimeError(f'Another live scenario owns {base}; lock {path}')
    else:
        raise RuntimeError(f'Could not acquire {path}')
    with os.fdopen(handle, 'w') as output:
        output.write(str(os.getpid()))
    try:
        yield
    finally:
        path.unlink(missing_ok=True)


def installed_jars(profile):
    files = []
    for prefix in ('mushroom-the-yorkie-', 'playtest-bridge-'):
        candidates = list((profile / 'mods').glob(prefix + '*.jar'))
        if len(candidates) != 1:
            raise ValueError(f'Profile requires exactly one {prefix} jar; found {len(candidates)}')
        files.extend(candidates)
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}


def execute(args, bridge):
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    report_file = Path(args.report_file).resolve() if args.report_file else ROOT / 'build/playtest-reports' / f'fetch-restart-{run_id}.json'
    report = {'scenario': 'fetch-across-saved-restart', 'runId': run_id, 'expectedSave': args.expected_save,
              'toy': args.toy, 'fullCreativeInventory': args.full_creative_inventory, 'spawnedToyCount': 1, 'complete': False, 'ok': False, 'stage': 'preflight'}
    save = lambda: write_report(report_file, report)
    save()
    try:
        def state():
            snapshot = bridge.request('/state')
            guard_world(snapshot, args.expected_save)
            return snapshot

        initial = state()
        player = initial['players'][0]
        name = player['name']
        profile = Path(initial['savePath']).resolve().parent.parent
        if Path(initial['savePath']).resolve() != profile / 'saves' / args.expected_save:
            raise ValueError('World must be in the selected profile saves folder')
        instance = args.instance_id or os.environ.get('MODRINTH_INSTANCE_ID')
        if not instance:
            if profile.name != 'Dad’s Minecraft':
                raise ValueError('Non-default profiles require --instance-id')
            instance = 'legacy:Dad’s Minecraft'
        game_log = profile / 'logs/latest.log'
        if not game_log.is_file():
            raise ValueError('A client log is required to verify saved shutdown')
        report.update(profile=str(profile), playerUuid=player['uuid'], installedJarHashes=installed_jars(profile))
        save()
        bridge.request('/screenshot', {'name': f'fetch-restart-{run_id}-start.png', 'resume': True})
        command = bridge.command
        command('tick unfreeze')
        command(f'gamemode creative {name}')
        bridge.request('/player-abilities', {'player': name, 'flying': False, 'mayfly': True})
        command(f'tp {name} 0.5 201 0.5')
        for entity in (YORKIE, 'mushroom_yorkie:squirrel', 'minecraft:item'):
            bridge.request('/clear-entities', {'type': entity})
        command('fill -5 199 -5 15 205 5 minecraft:air')
        command('fill -5 199 -5 15 199 5 minecraft:grass_block')
        command('time set day')
        command(f'tp {name} 0.5 200 0.5')
        command(f'summon {YORKIE} 8.5 200 0.5 {{PersistenceRequired:1b}}')
        tamed = bridge.request('/use-entity', {'type': YORKIE, 'radius': 24, 'item': 'mushroom_yorkie:yorkie_treat', 'count': 2})
        if not tamed['target']['tameable']['ownedByPlayer'] or 'mainHand' not in tamed['target']:
            raise ValueError('Fixture requires an owned pet and bridge mainHand observation')
        command(f'clear {name}')
        command(f'gamemode survival {name}')
        command('tick freeze')
        command(f'summon minecraft:item 8.5 200 0.5 {{Item:{{id:"{args.toy}",count:1}},PickupDelay:32767}}')
        report['stage'] = 'waiting_for_pickup'
        save()
        for _ in range(180):
            command('tick step 1t')
            time.sleep(.1)
            snapshot = state()
            ground, held = toy_counts(snapshot, args.toy)
            pet = next((e for e in snapshot['players'][0]['nearbyEntities'] if e['type'] == YORKIE), None)
            if ground == 0 and held == 1 and pet and pet['distance'] > 3:
                break
        else:
            raise RuntimeError('Could not observe one carried toy before delivery')
        inventory = command(f'clear {name} {args.toy} 0').get('result', 0)
        if inventory != 0:
            raise RuntimeError('Fixture inventory is not empty')
        if args.full_creative_inventory:
            command(f'gamemode creative {name}')
            for section, count in (('hotbar', 9), ('inventory', 27)):
                for slot in range(count):
                    command(f'item replace entity {name} {section}.{slot} with minecraft:stone 64')
            snapshot = state()
        report.update(stage='carried', beforeQuit=snapshot, carrierUuid=pet['uuid'], inventoryBeforeQuit=inventory)
        save()
        offset = game_log.stat().st_size
        accepted = bridge.request('/quit', {'expectedSave': args.expected_save})
        pid = accepted.get('processId')
        if not isinstance(pid, int) or pid <= 0 or pid == os.getpid():
            raise RuntimeError('Quit reply requires a valid client processId')
        report.update(stage='quitting', quit=accepted)
        save()
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            with game_log.open('rb') as handle:
                handle.seek(offset)
                fresh = handle.read().decode(errors='replace')
            saved = 'All dimensions are saved' in fresh
            try:
                os.kill(pid, 0)
                exited = False
            except ProcessLookupError:
                exited = True
            if saved and exited:
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Saved shutdown was not verified; do not launch a second client')
        report.update(stage='saved_shutdown', saveCompleted=True, processExited=True,
                      saveLogLines=[line for line in fresh.splitlines() if 'All dimensions are saved' in line or 'Stopping server' in line])
        save()
        launch_log = report_file.with_suffix('.boot.log')
        env = {**os.environ, 'MODRINTH_PROFILE': str(profile), 'MODRINTH_INSTANCE_ID': instance,
               'PLAYTEST_WORLD': args.expected_save, 'PLAYTEST_MUTE_SOUND': '0', 'BRIDGE_HOST': args.host,
               'BRIDGE_PORT': str(args.port), 'BRIDGE_REPORT_FILE': str(report_file.with_suffix('.relaunch.json')),
               'BRIDGE_SCREENSHOT_NAME': f'fetch-restart-{run_id}-relaunch.png'}
        report.update(stage='relaunching', bootstrapLog=str(launch_log))
        save()
        with launch_log.open('w') as output:
            subprocess.run([str(ROOT / 'scripts/modrinth-autoplay-smoke.sh')], cwd=ROOT, env=env,
                           stdout=output, stderr=subprocess.STDOUT, check=True, timeout=240)
        report.update(stage='reloaded', bootstrapLog=str(launch_log))
        save()
        snapshot = state()
        if snapshot['players'][0]['uuid'] != report['playerUuid'] or snapshot['players'][0]['abilities']['creative'] != args.full_creative_inventory:
            raise RuntimeError('Reloaded owner identity or expected game mode changed')
        if installed_jars(profile) != report['installedJarHashes']:
            raise RuntimeError('Installed jars changed during the restart scenario')
        report['immediatelyAfterReload'] = snapshot
        if not any(e.get('uuid') == report['carrierUuid'] for e in snapshot['players'][0]['nearbyEntities']):
            raise RuntimeError('Original carrier is not observable after reload')
        command('tick unfreeze')
        def advance(ticks):
            before = state()['tickCount']
            command(f'tick sprint {ticks}t')
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                snapshot = state()
                if snapshot['tickCount'] >= before + ticks:
                    return snapshot
                time.sleep(.1)
            raise RuntimeError('Post-reload game ticks did not advance')

        snapshot = advance(240)
        if args.full_creative_inventory:
            inventory = command(f'clear {name} {args.toy} 0').get('result', 0)
            ground, held = toy_counts(snapshot, args.toy)
            report.update(stage='holding_for_inventory_space', whileFullAfterReload=snapshot,
                          inventoryWhileFull=inventory, groundWhileFull=ground, heldWhileFull=held)
            save()
            if (inventory, ground, held) != (0, 0, 1):
                raise RuntimeError('Real toy was not safely held through full creative inventory and restart')
            command(f'data merge entity {report["carrierUuid"]} {{Sitting:1b}}')
            sitting = advance(40)
            report['whileFullSitting'] = sitting
            save()
            carrier = next(e for e in sitting['players'][0]['nearbyEntities'] if e.get('uuid') == report['carrierUuid'])
            if toy_counts(sitting, args.toy) != (0, 1) or not carrier['tameable']['orderedToSit']:
                raise RuntimeError('Full-inventory sit interruption lost the held toy')
            command(f'data merge entity {report["carrierUuid"]} {{Sitting:0b}}')
            command(f'item replace entity {name} inventory.0 with minecraft:air')
            report['stage'] = 'inventory_space_freed'
            save()
            snapshot = advance(180)
        inventory = command(f'clear {name} {args.toy} 0').get('result', 0)
        ground, held = toy_counts(snapshot, args.toy)
        total = inventory + ground + held
        report.update(stage='complete', complete=True, afterReload=snapshot, inventoryAfterReload=inventory,
                      groundAfterReload=ground, heldAfterReload=held, totalObservedAfterReload=total,
                      conserved=total == 1, delivered=inventory == 1 and ground == 0 and held == 0)
        report['ok'] = report['conserved'] and report['delivered']
        save()
        return 0 if report['ok'] else 1
    except Exception as error:
        report.update(failedStage=report['stage'], stage='error', error=str(error))
        save()
        raise
    finally:
        print(f'Report: {report_file}', flush=True)


def run(args):
    bridge = Bridge(args.host, args.port)
    with bridge_lock(bridge.base):
        return execute(args, bridge)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-save', required=True)
    parser.add_argument('--toy', choices=TOYS, default=TOYS[0])
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=57321)
    parser.add_argument('--instance-id')
    parser.add_argument('--full-creative-inventory', action='store_true', help='Verify held overflow across restart/sit, then free space and finish delivery')
    parser.add_argument('--report-file')
    args = parser.parse_args()
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
