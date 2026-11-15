#!/usr/bin/env python3
"""Capture local, read-only evidence after a Modrinth boot timeout; never stop a process."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid


def console_write_threads(thread_dump):
    """Return critical game threads observed writing through the Log4j console, not a claim about the pipe consumer."""
    observed = []
    for section in re.split(r'(?m)(?=^")', thread_dump):
        header = re.match(r'^"([^"]+)"', section)
        if not header:
            continue
        name = header.group(1)
        if name not in {'Server thread', 'Render thread'} and not re.fullmatch(r'Worker-ResourceReload-\d+', name):
            continue
        stack = section.split('\n\n', 1)[0]
        writing = 'java.io.FileOutputStream.write' in stack or 'sun.nio.ch.FileDispatcherImpl.write' in stack
        console = 'java.io.PrintStream.' in stack or 'org.apache.logging.log4j.core.appender.ConsoleAppender.' in stack
        if writing and console and 'org.apache.logging.log4j' in stack and name not in observed:
            observed.append(name)
    return observed


def classify_console_write(thread_dump, stdout_type):
    observed = console_write_threads(thread_dump)
    if observed:
        if stdout_type.upper() == 'PIPE':
            return 'suspected_console_backpressure'
        return 'server_logging_write_observed' if 'Server thread' in observed else 'client_logging_write_observed'
    return 'no_console_write_observed' if re.search(r'(?m)^"Server thread"', thread_dump) else 'server_thread_not_observed'


def capture(arguments, timeout=10):
    try:
        result = subprocess.run(arguments, text=True, capture_output=True, timeout=timeout, check=True)
        return result.stdout, None
    except (OSError, subprocess.SubprocessError) as error:
        return '', type(error).__name__


def diagnose(profile, expected_save, report_file):
    profile = profile.resolve()
    deadline = time.monotonic() + 45

    def bounded_capture(arguments):
        remaining = deadline - time.monotonic()
        return capture(arguments, min(10, remaining)) if remaining > 0 else ('', 'DiagnosticTimeLimit')

    report = {'expectedSave': expected_save, 'profile': str(profile), 'readOnly': True,
              'status': 'no_matching_game_process', 'matchingGameProcesses': []}
    inventory, error = bounded_capture(['ps', '-axo', 'pid=,ppid=,comm='])
    if error:
        report.update(status='process_inventory_unavailable', captureError=error)
    else:
        for line in inventory.splitlines():
            fields = line.strip().split(None, 2)
            if len(fields) != 3 or 'ModrinthApp/meta/java_versions/' not in fields[2] or not fields[2].endswith('/java'):
                continue
            pid, parent = map(int, fields[:2])
            files, error = bounded_capture(['lsof', '-a', '-p', str(pid), '-Fn'])
            if error:
                report['openFileCaptureError'] = error
            if 'n' + str(profile / 'logs/latest.log') in files.splitlines():
                report['matchingGameProcesses'].append({'pid': pid, 'parentPid': parent})
        matches = report['matchingGameProcesses']
        if not matches and 'openFileCaptureError' in report:
            report['status'] = 'profile_process_match_unavailable'
        elif len(matches) > 1:
            report['status'] = 'multiple_matching_game_processes'
        elif len(matches) == 1:
            process = matches[0]
            descriptor, error = bounded_capture(['lsof', '-a', '-p', str(process['pid']), '-d', '1', '-Fftn'])
            process['stdoutType'] = next((line[1:] for line in descriptor.splitlines() if line.startswith('t')), 'unknown')
            if error:
                process['stdoutCaptureError'] = error
            configured_jcmd = Path(os.environ.get('JAVA_HOME', '/nonexistent')) / 'bin/jcmd'
            jcmd = str(configured_jcmd) if configured_jcmd.is_file() else shutil.which('jcmd')
            if jcmd:
                dump, error = bounded_capture([jcmd, str(process['pid']), 'Thread.print', '-l'])
                if error:
                    report.update(status='thread_dump_unavailable', captureError=error)
                else:
                    dump_file = report_file.with_suffix('.threads.txt')
                    dump_file.write_text(dump)
                    report.update(status=classify_console_write(dump, process['stdoutType']),
                                  consoleWriteThreads=console_write_threads(dump), threadDump=str(dump_file))
            else:
                report['status'] = 'jcmd_unavailable'
    report['interpretation'] = ('A critical game thread was observed in a Log4j console write while stdout is a PIPE; launcher backpressure is a hypothesis. '
                                'Inspect the local thread dump and launcher consumer. The game was left running.'
                                if report['status'] == 'suspected_console_backpressure' else
                                'This snapshot does not establish console backpressure or world-load failure. '
                                'Inspect the live process, bridge and local logs before retrying. The game was left running.')
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--expected-save', required=True)
    parser.add_argument('--report-file', default='')
    args = parser.parse_args()
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    report_file = Path(args.report_file).resolve() if args.report_file else Path(__file__).resolve().parents[1] / 'build/playtest-reports' / f'boot-{run_id}.json'
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report = diagnose(args.profile, args.expected_save, report_file)
    print(f'Boot diagnostic snapshot: {report["status"]}. {report["interpretation"]}')
    print(f'Boot diagnostic report: {report_file}')


if __name__ == '__main__':
    main()
