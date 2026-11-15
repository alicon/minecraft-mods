from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

API = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'playtest-boot-diagnostics.py'))
LOGGING_WRITE = '''"Server thread" #42 runnable
   java.lang.Thread.State: RUNNABLE
        at java.io.FileOutputStream.writeBytes(Native Method)
        at java.io.FileOutputStream.write(FileOutputStream.java:313)
        at org.apache.logging.log4j.core.appender.OutputStreamManager.writeToDestination(OutputStreamManager.java:251)

"Render thread" #1 waiting
'''


class BootDiagnosticTests(unittest.TestCase):
    def test_logging_write_to_pipe_is_a_hypothesis_not_confirmed_cause(self):
        self.assertEqual(API['classify_console_write'](LOGGING_WRITE, 'PIPE'), 'suspected_console_backpressure')

    def test_same_logging_stack_on_regular_file_does_not_implicate_launcher_pipe(self):
        self.assertEqual(API['classify_console_write'](LOGGING_WRITE, 'REG'), 'server_logging_write_observed')

    def test_other_threads_cannot_be_mistaken_for_server_thread(self):
        self.assertEqual(API['classify_console_write'](LOGGING_WRITE.replace('"Server thread"', '"Worker thread"'), 'PIPE'),
                         'server_thread_not_observed')
        self.assertEqual(API['classify_console_write']('"Server thread" #42 waiting\n   at tick.wait()\n\n' + LOGGING_WRITE.replace('"Server thread"', '"Worker thread"'), 'PIPE'),
                         'no_console_write_observed')

    def test_thread_capture_selects_only_the_process_with_this_profiles_open_log(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = Path(folder).resolve()
            calls = []

            def capture(arguments, timeout=10):
                calls.append(arguments)
                if arguments[0] == 'ps':
                    return '111 1 /fake/ModrinthApp/meta/java_versions/jre/bin/java\n222 1 /fake/ModrinthApp/meta/java_versions/jre/bin/java\n', None
                if arguments[0] == 'lsof' and arguments[-1] == '-Fn':
                    return ('n/other-profile/logs/latest.log' if arguments[3] == '111' else 'n' + str(profile / 'logs/latest.log')), None
                if arguments[0] == 'lsof':
                    return 'p222\nf1\ntPIPE\n', None
                return LOGGING_WRITE, None

            with patch.dict(API['diagnose'].__globals__, {'capture': capture}), patch('shutil.which', return_value='/fake/jcmd'):
                report = API['diagnose'](profile, 'Codex Fixture', profile / 'diagnostic.json')
            self.assertEqual(report['status'], 'suspected_console_backpressure')
            self.assertEqual([p['pid'] for p in report['matchingGameProcesses']], [222])
            attachments = [call for call in calls if 'Thread.print' in call]
            self.assertEqual(len(attachments), 1)
            self.assertEqual(attachments[0][1], '222')


if __name__ == '__main__':
    unittest.main()
