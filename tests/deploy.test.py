"""Offline deployment orchestration checks; never contacts GitHub or Docker."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "deploy/auto-deploy.sh"


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "deploy").mkdir()
        (self.root / ".git").mkdir()
        shutil.copy(SOURCE, self.root / "deploy/auto-deploy.sh")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        mock = bin_dir / "mock"
        mock.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
from pathlib import Path
name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALL_LOG"], "a") as f:
    f.write(json.dumps([name, *args]) + "\\n")
if name == "git" and args[:1] == ["rev-parse"]:
    print("target-sha")
if name == "curl":
    print(json.dumps({"workflow_runs": [{"head_sha": "target-sha", "conclusion": os.environ.get("CI_RESULT", "success")}]}))
if name == "docker":
    if "ps" in args:
        print("running-app")
    if os.environ.get("FAIL_AT") in ("build", "up") and os.environ["FAIL_AT"] in args:
        sys.exit(1)
''')
        mock.chmod(0o755)
        for name in ("git", "docker", "curl", "flock"):
            (bin_dir / name).symlink_to(mock)
        self.env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", CALL_LOG=str(self.root / "calls"))
        self.marker = self.root / ".git/budget-gremlin-deployed"

    def run_deploy(self, *args):
        return subprocess.run(["bash", str(self.root / "deploy/auto-deploy.sh"), *args], env=self.env, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in (self.root / "calls").read_text().splitlines()]

    def test_success_backups_before_restart_and_records_revision(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        backup = next(i for i, call in enumerate(calls) if "backup" in call)
        restart = next(i for i, call in enumerate(calls) if "up" in call)
        self.assertLess(backup, restart)
        self.assertIn("--wait", calls[restart])
        self.assertEqual(self.marker.read_text().strip(), "target-sha")

    def test_unchanged_revision_skips_build_and_api(self):
        self.marker.write_text("target-sha\n")
        self.assertEqual(self.run_deploy().returncode, 0)
        self.assertFalse(any(call[0] in ("curl", "docker") for call in self.calls()))

    def test_pending_ci_leaves_running_app_untouched(self):
        self.env["CI_RESULT"] = ""
        self.assertEqual(self.run_deploy().returncode, 0)
        self.assertFalse(any(call[0] == "docker" or "reset" in call for call in self.calls()))
        self.assertFalse(self.marker.exists())

    def test_failed_build_retries_without_restarting(self):
        self.env["FAIL_AT"] = "build"
        self.assertNotEqual(self.run_deploy().returncode, 0)
        self.assertFalse(self.marker.exists())
        self.assertFalse(any("up" in call for call in self.calls()))
        del self.env["FAIL_AT"]
        self.assertEqual(self.run_deploy().returncode, 0)
        self.assertEqual(self.marker.read_text().strip(), "target-sha")

    def test_failed_start_does_not_record_success(self):
        self.env["FAIL_AT"] = "up"
        self.assertNotEqual(self.run_deploy().returncode, 0)
        self.assertFalse(self.marker.exists())

    def test_force_rebuilds_successful_revision(self):
        self.marker.write_text("target-sha\n")
        self.assertEqual(self.run_deploy("--force").returncode, 0)
        self.assertTrue(any("build" in call for call in self.calls()))


if __name__ == "__main__":
    unittest.main()
