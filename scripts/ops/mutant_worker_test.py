# Tests for mutant_worker.py, with a fake forge on PATH that answers as told.
#   python3 scripts/ops/mutant_worker_test.py
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "mutant_worker.py")
SOURCE = b"contract C {\n    function f(uint a) external pure returns (bool) { return a == 1; }\n}\n"
OLD = "a == 1"

# The fake forge reads its answers from files beside it: build.out and
# build.code for `forge build`, test.out and test.code for `forge test`.
FAKE_FORGE = """#!/bin/sh
d=$(dirname "$0")
case "$1" in
  build) cat "$d/build.out"; exit $(cat "$d/build.code") ;;
  test) cat "$d/test.out"; exit $(cat "$d/test.code") ;;
esac
exit 2
"""


def mutant(**kw):
    start = SOURCE.index(OLD.encode())
    m = {"contract": "C", "mutator": "ROR", "file": "src/C.sol", "line": 2,
         "start": start, "end": start + len(OLD), "old": OLD, "new": "a != 1"}
    m.update(kw)
    return m


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.bin = os.path.join(self.dir, "bin")
        os.makedirs(os.path.join(self.dir, "src"))
        os.makedirs(self.bin)
        with open(os.path.join(self.dir, "src/C.sol"), "wb") as f:
            f.write(SOURCE)
        with open(os.path.join(self.bin, "forge"), "w") as f:
            f.write(FAKE_FORGE)
        os.chmod(os.path.join(self.bin, "forge"), 0o755)
        with open(os.path.join(self.dir, "targets.txt"), "w") as f:
            f.write("C test/C.t.sol test/*\n")
        self.forge(build=("Compiler run successful", 0), test=("ok", 0))

    def forge(self, build=None, test=None):
        for name, answer in (("build", build), ("test", test)):
            if answer:
                with open(os.path.join(self.bin, name + ".out"), "w") as f:
                    f.write(answer[0])
                with open(os.path.join(self.bin, name + ".code"), "w") as f:
                    f.write(str(answer[1]))

    def run_worker(self, mutants, done=None):
        path = os.path.join(self.dir, "mutants.jsonl")
        with open(path, "w") as f:
            f.writelines(json.dumps(m) + "\n" for m in mutants)
        results = os.path.join(self.dir, "results.jsonl")
        args = [sys.executable, WORKER, path, "targets.txt", results]
        if done is not None:
            with open(os.path.join(self.dir, "done.jsonl"), "w") as f:
                f.write(done)
            args.append("done.jsonl")
        env = dict(os.environ, PATH=self.bin + os.pathsep + os.environ["PATH"])
        r = subprocess.run(args, cwd=self.dir, env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(results) as f:
            return [json.loads(line) for line in f]

    def source(self):
        with open(os.path.join(self.dir, "src/C.sol"), "rb") as f:
            return f.read()

    def test_a_failing_test_kills_the_mutant_and_names_the_test(self):
        self.forge(test=("Ran 2 tests\n[FAIL: assertion failed] test_one_is_true() (gas: 1)\nSuite result: FAILED", 1))
        [r] = self.run_worker([mutant()])
        self.assertEqual(r["status"], "killed")
        self.assertIn("test_one_is_true()", r["note"])
        self.assertEqual(self.source(), SOURCE)

    def test_forge_dying_without_a_failing_test_is_an_error_not_a_kill(self):
        self.forge(test=("Killed", 137))
        [r] = self.run_worker([mutant()])
        self.assertEqual(r["status"], "error")
        self.assertIn("137", r["note"])

    def test_a_compiler_error_means_the_mutant_does_not_compile(self):
        self.forge(build=("Error (9574): Type bool is not implicitly convertible", 1))
        [r] = self.run_worker([mutant()])
        self.assertEqual(r["status"], "no-compile")
        self.assertIn("Error (9574)", r["note"])

    def test_a_build_that_fails_without_a_compiler_error_is_an_error(self):
        self.forge(build=("No space left on device", 1))
        [r] = self.run_worker([mutant()])
        self.assertEqual(r["status"], "error")

    def test_every_test_passing_means_the_mutant_survived(self):
        [r] = self.run_worker([mutant()])
        self.assertEqual(r["status"], "survived")

    def test_a_mutant_whose_old_text_is_not_at_its_offsets_is_stale_and_not_applied(self):
        self.forge(test=("[FAIL: x] test_a() (gas: 1)", 1))
        [r] = self.run_worker([mutant(old="a >= 1")])
        self.assertEqual(r["status"], "stale")
        self.assertEqual(self.source(), SOURCE)

    def test_a_half_written_line_in_done_does_not_stop_a_resume(self):
        done = json.dumps(mutant(new="a < 1", status="killed")) + "\n" + '{"contract": "C", "mut'
        rs = self.run_worker([mutant(new="a < 1"), mutant()], done=done)
        self.assertEqual([r["new"] for r in rs], ["a != 1"])


class SummaryTest(unittest.TestCase):
    def summary(self, picked, results):
        d = tempfile.mkdtemp()
        for name, rows in (("picked.jsonl", picked), ("results.jsonl", results)):
            with open(os.path.join(d, name), "w") as f:
                f.writelines(json.dumps(m) + "\n" for m in rows)
        return subprocess.run([sys.executable, WORKER, "--summary", "picked.jsonl", "results.jsonl"],
                              cwd=d, capture_output=True, text=True)

    def setUp(self):
        self.control = mutant(mutator="CONTROL", start=0, end=0, old="", new="")
        self.m = mutant()

    def test_every_mutant_tested_once_and_the_control_alive_passes(self):
        r = self.summary([self.control, self.m], [dict(self.control, status="survived"), dict(self.m, status="killed")])
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("C: 1 mutants, 1 killed, 0 survived, 0 no-compile, 0 timeout, 0 error, 0 stale", r.stdout)

    def test_a_mutant_never_tested_makes_the_campaign_incomplete(self):
        r = self.summary([self.control, self.m], [dict(self.control, status="survived")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("incomplete: 1 missing, 0 tested twice", r.stdout)

    def test_a_mutant_tested_twice_makes_the_campaign_incomplete(self):
        r = self.summary([self.control, self.m], [dict(self.control, status="survived"),
                                                  dict(self.m, status="killed"), dict(self.m, status="killed")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("incomplete: 0 missing, 1 tested twice", r.stdout)

    def test_a_killed_control_voids_the_campaign(self):
        r = self.summary([self.control, self.m], [dict(self.control, status="killed"), dict(self.m, status="killed")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("the campaign is void", r.stdout)

    def test_a_timeout_or_error_leaves_the_campaign_unfinished(self):
        r = self.summary([self.control, self.m], [dict(self.control, status="survived"), dict(self.m, status="timeout")])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("1 to run again", r.stdout)


if __name__ == "__main__":
    unittest.main()
