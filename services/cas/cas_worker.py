"""SymPy checker for the grading server.

Reads one JSON request per line on stdin and writes one JSON response per line
on stdout. Each request describes what a flagged step was supposed to compute
(in SymPy syntax), the student's result and the grader's corrected result. The
worker computes the true result independently and reports whether the
correction matches it and whether the student's result really was wrong.

Request:  {"id", "kind", "variable", "expression", "point", "direction",
           "lower", "upper", "conditions", "student_result", "corrected_result"}

Differential equations (kind "ode_solution"): "expression" is the equation
moved to one side (= 0), written with y, yp (y') and ypp (y''); the results
are explicit solutions y(x), with C, C1, C2 as arbitrary constants;
"conditions" lists initial conditions like "y(0) = 1, yp(0) = 2".
Response: {"id", "verdict": "verified" | "disagrees" | "not_checkable", "detail"}

Expressions come from a language model, and SymPy's parser evaluates Python,
so every string is checked against a strict allow-list before parsing.
"""

import json
import random
import re
import sys

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)

FUNCTIONS = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan, "arcsin": sp.asin, "arccos": sp.acos, "arctan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "exp": sp.exp, "log": sp.log, "ln": sp.log, "sqrt": sp.sqrt, "Abs": sp.Abs, "abs": sp.Abs,
}
CONSTANTS = {"pi": sp.pi, "e": sp.E, "E": sp.E, "oo": sp.oo, "inf": sp.oo, "infinity": sp.oo}
SYMBOL_NAMES = set("abcdhkmnpqrstuvwxyzABCDFK") | {"theta", "alpha", "beta", "lam", "C1", "C2", "yp", "ypp"}
ARBITRARY_CONSTANTS = {"C", "C1", "C2", "K", "A", "B"}

# Digits, letters, operators, parentheses, commas, spaces and decimal points.
ALLOWED_CHARS = re.compile(r"^[0-9A-Za-z_+\-*/^()., ]*$")
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")
NOT_A_NUMBER_DOT = re.compile(r"(?<![0-9])\.|\.(?![0-9])")

DNE = "DNE"


class Unsupported(Exception):
    pass


def parse(text, variable):
    """Parses an allow-listed SymPy expression, or the string DNE."""
    text = (text or "").strip()
    if not text:
        raise Unsupported("empty")
    if text.upper() in ("DNE", "DOES NOT EXIST", "UNDEFINED"):
        return DNE
    if len(text) > 300 or not ALLOWED_CHARS.match(text) or "__" in text or NOT_A_NUMBER_DOT.search(text):
        raise Unsupported("characters not allowed")
    local = dict(FUNCTIONS)
    local.update(CONSTANTS)
    for name in IDENTIFIER.findall(text):
        if name in local:
            continue
        if name in SYMBOL_NAMES or name == variable:
            local[name] = sp.Symbol(name, real=True)
        else:
            raise Unsupported("unknown name " + name)
    return parse_expr(text, local_dict=local, transformations=TRANSFORMS, evaluate=True)


def same(a, b, symbols):
    """True if a and b are equal: symbolically, else at random sample points."""
    if a is DNE or b is DNE:
        return a is b
    if a.has(sp.oo, -sp.oo, sp.zoo) or b.has(sp.oo, -sp.oo, sp.zoo):
        return sp.simplify(a - b) == 0 or a == b
    diff = sp.simplify(a - b)
    if diff == 0:
        return True
    free = sorted(diff.free_symbols, key=str)
    if not free:
        return abs(complex(sp.N(diff))) < 1e-9
    rng = random.Random(7)
    agree = 0
    for _ in range(12):
        point = {s: sp.Float(rng.uniform(0.3, 2.7)) for s in free}
        try:
            value = complex(sp.N(diff.subs(point)))
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        if abs(value) > 1e-7 * max(1.0, abs(complex(sp.N(a.subs(point))))):
            return False
        agree += 1
    return agree >= 4


def limit_value(expr, var, point, direction):
    if direction in ("+", "-"):
        return sp.limit(expr, var, point, direction)
    left = sp.limit(expr, var, point, "-")
    right = sp.limit(expr, var, point, "+")
    return left if same(left, right, {var}) else DNE


CONDITION = re.compile(r"^\s*(y|yp)\s*\(([^()=]+)\)\s*=\s*([^=]+?)\s*$")


def parse_conditions(text, name):
    """'y(0) = 1, yp(0) = 2' -> [(0, 0, 1), (1, 0, 2)] as (derivative order, x0, value)."""
    result = []
    for part in (text or "").split(","):
        if not part.strip():
            continue
        match = CONDITION.match(part)
        if not match:
            raise Unsupported("bad condition")
        order = 0 if match.group(1) == "y" else 1
        result.append((order, parse(match.group(2), name), parse(match.group(3), name)))
    return result


def solves_ode(candidate, ode, var, conditions):
    """True if y = candidate satisfies ode = 0 (identically) and every condition."""
    y, yp, ypp = (sp.Symbol(n, real=True) for n in ("y", "yp", "ypp"))
    first = sp.diff(candidate, var)
    residual = ode.subs({ypp: sp.diff(first, var), yp: first, y: candidate})
    if not same(residual, sp.Integer(0), set()):
        return False
    for order, x0, value in conditions:
        at = (candidate if order == 0 else first).subs(var, x0)
        if not same(at, value, set()):
            return False
    return True


def arbitrary_constants(expr):
    return {s for s in expr.free_symbols if s.name in ARBITRARY_CONSTANTS}


def check_ode(req, name, var):
    ode = parse(req.get("expression"), name)
    if ode is DNE:
        return "not_checkable", "expression is DNE"
    conditions = parse_conditions(req.get("conditions"), name)
    names = {s.name for s in ode.free_symbols}
    order = 2 if "ypp" in names else 1
    # A general solution needs one constant per order; an IVP answer needs none.
    needed = 0 if len(conditions) >= order else order

    def ok(candidate):
        if candidate is DNE or len(arbitrary_constants(candidate)) < needed:
            return False
        return solves_ode(candidate, ode, var, conditions)

    corrected = parse(req.get("corrected_result"), name)
    if not ok(corrected):
        return "disagrees", "correction does not solve the equation"
    try:
        student = parse(req.get("student_result"), name)
    except Unsupported:
        student = None
    if student is not None and ok(student):
        return "disagrees", "student result looks correct"
    return "verified", "correction solves the equation" + ("" if student is not None else "; student result not parsed")


def check(req):
    kind = req.get("kind")
    if kind == "ode_solution":
        name = (req.get("variable") or "x").strip() or "x"
        if not re.fullmatch(r"[A-Za-z]", name) or name == "y":
            return "not_checkable", "bad variable"
        return check_ode(req, name, sp.Symbol(name, real=True))
    if kind not in ("equivalent", "derivative", "antiderivative", "definite_integral", "limit", "evaluate"):
        return "not_checkable", "no checkable claim"
    name = (req.get("variable") or "x").strip() or "x"
    if not re.fullmatch(r"[A-Za-z]", name) and name not in SYMBOL_NAMES:
        return "not_checkable", "bad variable"
    var = sp.Symbol(name, real=True)
    expr = parse(req.get("expression"), name)
    if expr is DNE:
        return "not_checkable", "expression is DNE"
    corrected = parse(req.get("corrected_result"), name)
    try:
        student = parse(req.get("student_result"), name)
    except Unsupported:
        student = None

    if kind == "antiderivative":
        def matches(candidate):
            return candidate is not DNE and same(sp.diff(candidate, var), expr, {var})
    else:
        if kind == "equivalent" or kind == "evaluate":
            truth = expr
        elif kind == "derivative":
            truth = sp.diff(expr, var)
        elif kind == "definite_integral":
            truth = sp.integrate(expr, (var, parse(req.get("lower"), name), parse(req.get("upper"), name)))
        else:  # limit
            truth = limit_value(expr, var, parse(req.get("point"), name), req.get("direction") or "both")

        def matches(candidate):
            return same(candidate, truth, {var})

    if not matches(corrected):
        return "disagrees", "correction does not match"
    if student is not None and matches(student):
        return "disagrees", "student result looks correct"
    return "verified", "correction matches" + ("" if student is not None else "; student result not parsed")


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            verdict, detail = check(req)
        except Unsupported as error:
            verdict, detail = "not_checkable", "unsupported: " + str(error)
        except Exception as error:  # SymPy can fail on hard inputs; never crash the worker
            verdict, detail = "not_checkable", "error: " + type(error).__name__
        sys.stdout.write(json.dumps({"id": req_id, "verdict": verdict, "detail": detail}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
