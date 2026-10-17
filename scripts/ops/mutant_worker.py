# Tests mutants one at a time in this worker's own copy of the contracts:
# apply the patch, build, run the contract's own tests and, if they all pass,
# the tests that reach it from elsewhere, then restore the file. A mutant is
# killed only when forge names a failing test, survives when every test it ran
# passes, and does not exist when the compiler refuses it. Anything else, a
# timeout or forge ending without a failing test or a compiler error, is an
# error that a resumed campaign runs again, never a kill. A mutant whose old
# text is not at its offsets is stale and left unapplied. Mutants already in
# done.jsonl are skipped, so a stopped campaign resumes. The size tests are left
# out, since the campaign builds without the optimiser; the Halmos proofs and
# the Arc fork tests are not forge test runs, so they are not part of it either.
#   python mutant_worker.py mutants.jsonl targets.txt results.jsonl [done.jsonl]
#   python mutant_worker.py --summary picked.jsonl results.jsonl
import collections
import json
import subprocess
import sys
import time

BUILD_TIMEOUT = 1800
TEST_TIMEOUT = 3600
NOT_SIZES = "--no-match-path '*Size*.t.sol'"
STATUSES = ("killed", "survived", "no-compile", "timeout", "error", "stale")


def run(cmd, timeout):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).decode("utf8", "replace")
    except subprocess.TimeoutExpired:
        return None, ""


def first(log, found):
    for line in log.splitlines():
        if found(line.strip()):
            return line.strip()[:200]
    return None


def compiler_error(line):
    return "Error (" in line


def failing_test(line):
    return line.startswith("[FAIL")


def last(log):
    return log.strip().splitlines()[-1][:200] if log.strip() else ""


def key(m):
    return (m["contract"], m["mutator"], m["file"], m["start"], m["end"], m["new"])


def rows(path):
    # A worker stopped in the middle of a write leaves half a line; it is not a result.
    for line in open(path, encoding="utf8"):
        try:
            yield json.loads(line)
        except ValueError:
            continue


def test(m, tests):
    code, log = run("forge build", BUILD_TIMEOUT)
    if code is None:
        return "timeout", "build"
    if code != 0:
        error = first(log, compiler_error)
        return ("no-compile", error) if error else ("error", f"build exit {code}: {last(log)}")
    for scope in dict.fromkeys(tests[m["contract"]]):
        code, log = run(f"forge test --fail-fast --match-path '{scope}' {NOT_SIZES}", TEST_TIMEOUT)
        if code is None:
            return "timeout", scope
        if code != 0:
            failing = first(log, failing_test)
            return ("killed", f"{scope}: {failing}") if failing else ("error", f"{scope}: exit {code}: {last(log)}")
    return "survived", ""


def main(mutants, targets, results, done=None):
    tests = {}
    for line in open(targets, encoding="utf8"):
        line = line.split("#", 1)[0].split()
        if line:
            tests[line[0]] = line[1:3]
    skip = {key(m) for m in rows(done)} if done else set()
    with open(results, "a", encoding="utf8") as out:
        for m in rows(mutants):
            if key(m) in skip:
                continue
            with open(m["file"], "rb") as f:
                original = f.read()
            t0 = time.time()
            if original[m["start"]:m["end"]] != m["old"].encode("utf8"):
                status, note = "stale", "the old text is not at its offsets"
            else:
                mutated = original[: m["start"]] + m["new"].encode("utf8") + original[m["end"]:]
                try:
                    with open(m["file"], "wb") as f:
                        f.write(mutated)
                    status, note = test(m, tests)
                finally:
                    with open(m["file"], "wb") as f:
                        f.write(original)
            m.update(status=status, note=note, seconds=round(time.time() - t0, 1))
            out.write(json.dumps(m) + "\n")
            out.flush()


def summary(picked, results):
    want = collections.Counter(key(m) for m in rows(picked))
    got = list(rows(results))
    seen = collections.Counter(key(m) for m in got)
    missing = sum((want - seen).values())
    twice = sum(n - 1 for k, n in seen.items() if n > 1 and k in want)
    totals = collections.Counter(m["status"] for m in got)
    for st in STATUSES:
        print(f"{st}: {totals[st]}")
    per = collections.defaultdict(collections.Counter)
    for m in got:
        if m["mutator"] != "CONTROL":
            per[m["contract"]][m["status"]] += 1
    for c in sorted(per):
        counts = ", ".join(f"{per[c][st]} {st}" for st in STATUSES)
        print(f"{c}: {sum(per[c].values())} mutants, {counts}")
    for m in got:
        if m["status"] == "survived" and m["mutator"] != "CONTROL":
            print(json.dumps(m))
    ok = True
    if missing or twice:
        print(f"incomplete: {missing} missing, {twice} tested twice")
        ok = False
    if any(m["mutator"] == "CONTROL" and m["status"] != "survived" for m in got):
        print("a control mutant did not survive: the campaign is void")
        ok = False
    again = sum(totals[st] for st in ("timeout", "error", "stale"))
    if again:
        print(f"{again} to run again with RESUME=1")
        ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    if sys.argv[1] == "--summary":
        sys.exit(summary(*sys.argv[2:4]))
    main(*sys.argv[1:5])
