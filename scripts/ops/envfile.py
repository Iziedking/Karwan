"""Edit one KEY=VALUE env file on the server without ever printing a value.

  python3 envfile.py status FILE KEY            -> "set" or "unset"
  python3 envfile.py set FILE KEY               -> value read from stdin
  python3 envfile.py set-random FILE KEY        -> 32 random bytes as hex, only if KEY is unset
  python3 envfile.py remove FILE KEY
  python3 envfile.py same FILE KEY              -> "same" when stdin equals KEY's value, else "different"

Values travel on stdin so they never reach a command line or a shell history.
The file keeps its permissions and is replaced in one step.
"""
import os
import secrets
import sys
import tempfile


def read_lines(path):
    with open(path, encoding="utf-8") as f:
        return f.read().splitlines()


def current(lines, key):
    for line in lines:
        if line.startswith(key + "="):
            return line[len(key) + 1:]
    return None


def write(path, lines):
    mode = os.stat(path).st_mode
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def put(path, lines, key, value):
    if "\n" in value or "\r" in value:
        sys.exit("refused: a value cannot contain a line break")
    out, done = [], False
    for line in lines:
        if line.startswith(key + "="):
            if not done:
                out.append(key + "=" + value)
                done = True
            continue
        out.append(line)
    if not done:
        out.append(key + "=" + value)
    write(path, out)


def main():
    op, path, key = sys.argv[1], sys.argv[2], sys.argv[3]
    lines = read_lines(path)
    value = current(lines, key)
    if op == "status":
        print("set" if value else "unset")
    elif op == "set":
        put(path, lines, key, sys.stdin.read().strip())
    elif op == "set-random":
        if value:
            print("kept")
            return
        put(path, lines, key, secrets.token_hex(32))
        print("generated")
    elif op == "remove":
        write(path, [line for line in lines if not line.startswith(key + "=")])
    elif op == "same":
        print("same" if value and value == sys.stdin.read().strip() else "different")
    else:
        sys.exit("unknown operation " + op)


main()
