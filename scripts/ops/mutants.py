# Writes every mutant slither-mutate's mutators make for the named contracts,
# one JSON object per line, without testing any of them. The campaign builds
# and tests each one with forge, so the compiler that decides whether a mutant
# exists is the one the release uses.
#
# Slither 0.11.5 builds the replacement text of seven mutators from a whole
# statement or function, then places it over a smaller span, or rebuilds the
# statement around the first copy of the operator only. Applied as given, those
# patches write garbled code, mutate the wrong operator, skip statements with a
# repeated operator, or fail. For AOR, ASOR, BOR, LOR, ROR, MIA and FHR this file
# keeps slither's own choice of what to mutate and with what, and writes each
# replacement over the exact bytes of the operator, condition or header it
# names. Every mutant's old text is checked against the file, and a mutator
# that fails, or a point no replacement can be placed at, stops the listing.
#   python mutants.py TimeLib SettlementLib > mutants.jsonl
import inspect
import json
import os
import re
import sys
from pathlib import Path

from slither import Slither
from slither.core.cfg.node import NodeType
from slither.core.expressions.assignment_operation import AssignmentOperation, AssignmentOperationType
from slither.core.expressions.binary_operation import BinaryOperation
from slither.core.expressions.call_expression import CallExpression
from slither.core.expressions.member_access import MemberAccess
from slither.core.expressions.unary_operation import UnaryOperation
from slither.slithir.operations import Binary
from slither.tools.mutator.mutators import all_mutators
from slither.tools.mutator.mutators.abstract_mutator import AbstractMutator
from slither.tools.mutator.mutators.AOR import arithmetic_operators
from slither.tools.mutator.mutators.ASOR import assignment_operators
from slither.tools.mutator.mutators.BOR import bitwise_operators
from slither.tools.mutator.mutators.FHR import function_header_replacements
from slither.tools.mutator.mutators.LOR import logical_operators
from slither.tools.mutator.mutators.ROR import relational_operators

MUTATORS = sorted(
    (m for _, m in inspect.getmembers(all_mutators, inspect.isclass)
     if issubclass(m, AbstractMutator) and m is not AbstractMutator),
    key=lambda m: m.NAME,
)


class Unplaced(Exception):
    pass


def span(x):
    return x.source_mapping.start, x.source_mapping.start + x.source_mapping.length


def token(src, expr, text):
    # The operator sits between the two operands; it must appear there once.
    a, b = span(expr.expression_left)[1], span(expr.expression_right)[0]
    gap = src[a:b]
    i = gap.find(text.encode())
    if i < 0 or gap.find(text.encode(), i + 1) >= 0:
        raise Unplaced(f"line {expr.source_mapping.lines[0]}: no single {text!r} in {gap!r}")
    return a + i, a + i + len(text)


def nodes(m):
    for function in m.contract.functions_and_modifiers_declared:
        if m.should_mutate_function(function):
            for node in function.nodes:
                if m.should_mutate_node(node):
                    yield node


def binary(m, ops, src, node, ir):
    # A binary operator, or the operator inside a compound assignment.
    e = ir.expression
    alternatives = [op for op in ops if op != ir.type]
    if isinstance(e, BinaryOperation):
        at = token(src, e, ir.type.value)
        return [(at, op.value) for op in alternatives]
    if isinstance(e, AssignmentOperation) and str(e.type) == ir.type.value + "=":
        at = token(src, e, str(e.type))
        return [(at, op.value + "=") for op in alternatives]
    if isinstance(e, UnaryOperation) and str(e.type) in ("++", "--"):
        return []  # an increment in the source; UOR mutates it, and slither's AOR skips it

    raise Unplaced(f"line {node.source_mapping.lines[0]}: {ir.type.value} in {type(e).__name__}")


def aor(m, src):
    for node in nodes(m):
        e = getattr(node, "expression", None)
        call = isinstance(e, CallExpression) and isinstance(e.called, MemberAccess)
        if call and e.called.member_name == "pop":
            continue
        irs = node.irs[:-6] if call and e.called.member_name == "push" else node.irs
        for ir in irs:
            if isinstance(ir, Binary) and ir.type in arithmetic_operators and not isinstance(e, UnaryOperation):
                yield from binary(m, arithmetic_operators, src, node, ir)


def bor(m, src):
    for node in nodes(m):
        for ir in node.irs:
            if isinstance(ir, Binary) and ir.type in bitwise_operators:
                yield from binary(m, bitwise_operators, src, node, ir)


def lor(m, src):
    for node in nodes(m):
        for ir in node.irs:
            if isinstance(ir, Binary) and ir.type in logical_operators:
                yield from binary(m, logical_operators, src, node, ir)


def ror(m, src):
    for node in nodes(m):
        for ir in node.irs:
            if (isinstance(ir, Binary) and ir.type in relational_operators
                    and str(ir.variable_left.type) != "address" and str(ir.variable_right) != "address"):
                yield from binary(m, relational_operators, src, node, ir)


def asor(m, src):
    for node in nodes(m):
        for ir in node.irs:
            e = ir.expression
            if (isinstance(e, AssignmentOperation) and e.type in assignment_operators
                    and e.type != AssignmentOperationType.ASSIGN):
                at = token(src, e, str(e.type))
                yield from ((at, str(op)) for op in assignment_operators if op != e.type)


def mia(m, src):
    for node in nodes(m):
        if node.type == NodeType.IF:
            at = span(node.expression)
            yield at, "true"
            yield at, "false"
            if not isinstance(node.expression, UnaryOperation):
                yield at, "!(" + src[at[0]:at[1]].decode("utf8") + ")"


def fhr(m, src):
    for function in m.contract.functions_and_modifiers_declared:
        if not m.should_mutate_function(function):
            continue
        start, stop = span(function)
        brace = src[start:stop].find(b"{")
        at = (start, start + brace if brace >= 0 else stop)
        header = src[at[0]:at[1]].decode("utf8")
        for value in function_header_replacements:
            left, right = value.split(" ==> ", maxsplit=1)
            if re.search(left, header):
                yield at, re.sub(left, right, header)


OWN = {"AOR": aor, "ASOR": asor, "BOR": bor, "FHR": fhr, "LOR": lor, "MIA": mia, "ROR": ror}


def patches(m, src, file):
    # (start, end, old, new, line) for each mutant one mutator makes.
    own = OWN.get(m.NAME)
    if own:
        for (start, end), new in own(m, src):
            yield start, end, src[start:end].decode("utf8"), new, src[:start].count(b"\n") + 1
        return
    for p in m._mutate().get("patches", {}).get(file, []):
        if src[p["start"]:p["end"]] != p["old_string"].encode("utf8"):
            raise Unplaced(f"line {p['line_number']}: the old text is not at its offsets")
        yield p["start"], p["end"], p["old_string"], p["new_string"], p["line_number"]


def main(names: list[str]) -> None:
    root = os.getcwd()
    slither = Slither(".", foundry_compile_all=True)
    seen = set()
    found = set()
    failed = []
    for unit in slither.compilation_units:
        for contract in unit.contracts:
            if contract.name not in names or contract.is_interface or contract.name in found:
                continue
            found.add(contract.name)
            file = contract.source_mapping.filename.absolute
            rel = os.path.relpath(file, root)
            with open(file, "rb") as f:
                src = f.read()
            # A control that changes nothing: it must survive, or the
            # workers' tests fail on their own and every kill is void.
            print(json.dumps({
                "contract": contract.name, "mutator": "CONTROL", "file": rel,
                "line": 0, "start": 0, "end": 0, "old": "", "new": "",
            }))
            for mutator in MUTATORS:
                m = mutator(unit, 0, "", "", contract, None, False, Path("/tmp"), [])
                try:
                    made = sorted(set(patches(m, src, file)), key=lambda p: (p[0], p[3]))
                except Exception as e:
                    failed.append(f"{contract.name} {mutator.NAME}: {e!r}")
                    continue
                for start, end, old, new, line in made:
                    if (rel, start, end, new) in seen or new == old:
                        continue
                    seen.add((rel, start, end, new))
                    print(json.dumps({
                        "contract": contract.name, "mutator": mutator.NAME, "file": rel,
                        "line": line, "start": start, "end": end, "old": old, "new": new,
                    }))
    missing = sorted(set(names) - found)
    if missing:
        failed.append("no such contract: " + ", ".join(missing))
    if failed:
        sys.exit("\n".join(failed))


if __name__ == "__main__":
    main(sys.argv[1:])
