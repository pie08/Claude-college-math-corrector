"""Tests for the SymPy checker. Run: services/cas/.venv/Scripts/python -m unittest discover -s services/cas"""

import unittest

from cas_worker import Unsupported, check, parse


def req(**kw):
    base = {"variable": "x", "point": "", "direction": "both", "lower": "", "upper": "", "student_result": ""}
    base.update(kw)
    return base


class CheckTests(unittest.TestCase):
    def test_derivative_verified(self):
        verdict, _ = check(req(kind="derivative", expression="x**2*sin(x)",
                               student_result="2*x*cos(x)", corrected_result="2*x*sin(x) + x^2 cos(x)"))
        self.assertEqual(verdict, "verified")

    def test_wrong_correction_is_flagged(self):
        verdict, detail = check(req(kind="derivative", expression="x**2*sin(x)",
                                    student_result="2*x*cos(x)", corrected_result="2*x*sin(x)"))
        self.assertEqual((verdict, detail), ("disagrees", "correction does not match"))

    def test_student_actually_right_is_flagged(self):
        verdict, detail = check(req(kind="equivalent", expression="2*(-3) - 4*4",
                                    student_result="-22", corrected_result="-22"))
        self.assertEqual((verdict, detail), ("disagrees", "student result looks correct"))

    def test_algebra_step(self):
        # Exam Q3c: (2(3+h)+1)/((3+h)-4) is (2h+7)/(h-1), not -1/2.
        verdict, _ = check(req(kind="equivalent", variable="h", expression="(2*(3+h)+1)/((3+h)-4)",
                               student_result="-1/2", corrected_result="(2*h+7)/(h-1)"))
        self.assertEqual(verdict, "verified")

    def test_limit_and_dne(self):
        # Exam Q4a: limit is 1/36, student wrote 1/32.
        self.assertEqual(check(req(kind="limit", expression="(sqrt(x+6)-3)/(x**2-9)", point="3",
                                   student_result="1/32", corrected_result="1/36"))[0], "verified")
        # One-sided limits differ, so the two-sided limit does not exist.
        self.assertEqual(check(req(kind="limit", expression="Abs(x)/x", point="0",
                                   student_result="1", corrected_result="DNE"))[0], "verified")

    def test_antiderivative_up_to_constant(self):
        verdict, _ = check(req(kind="antiderivative", expression="2*x*exp(x**2)",
                               student_result="exp(x**2)*x", corrected_result="exp(x^2) + 5"))
        self.assertEqual(verdict, "verified")

    def test_definite_integral(self):
        verdict, _ = check(req(kind="definite_integral", expression="x**2", lower="0", upper="3",
                               student_result="27", corrected_result="9"))
        self.assertEqual(verdict, "verified")

    def test_none_kind_is_not_checkable(self):
        self.assertEqual(check(req(kind="none", expression="", corrected_result=""))[0], "not_checkable")


class OdeTests(unittest.TestCase):
    def ode(self, **kw):
        return check(req(kind="ode_solution", conditions="", **kw))

    def test_separable_wrong_constant(self):
        # dy/dx = x*y: e^(x^2/2) + C is not a solution; C*e^(x^2/2) is.
        verdict, _ = self.ode(expression="yp - x*y", student_result="exp(x**2/2) + C",
                              corrected_result="C*exp(x**2/2)")
        self.assertEqual(verdict, "verified")

    def test_lost_constant_is_caught(self):
        # y' = y: e^x solves it but is not the general solution.
        verdict, _ = self.ode(expression="yp - y", student_result="exp(x)", corrected_result="C*exp(x)")
        self.assertEqual(verdict, "verified")

    def test_correct_general_solution_not_flagged(self):
        verdict, detail = self.ode(expression="yp + 2*y - 4", student_result="2 + C*exp(-2*x)",
                                   corrected_result="2 + C*exp(-2*x)")
        self.assertEqual((verdict, detail), ("disagrees", "student result looks correct"))

    def test_second_order(self):
        # y'' - 5y' + 6y = 0: roots 2 and 3, not -2 and -3.
        verdict, _ = self.ode(expression="ypp - 5*yp + 6*y", student_result="C1*exp(-2*x) + C2*exp(-3*x)",
                              corrected_result="C1*exp(2*x) + C2*exp(3*x)")
        self.assertEqual(verdict, "verified")

    def test_initial_value_problem(self):
        verdict, _ = check(req(kind="ode_solution", expression="yp - y", conditions="y(0) = 5",
                               student_result="exp(x)", corrected_result="5*exp(x)"))
        self.assertEqual(verdict, "verified")

    def test_wrong_correction_is_flagged(self):
        verdict, detail = self.ode(expression="ypp + 4*y", student_result="C1*exp(2*x)",
                                   corrected_result="C1*cos(4*x) + C2*sin(4*x)")
        self.assertEqual((verdict, detail), ("disagrees", "correction does not solve the equation"))

    def test_second_order_ivp(self):
        # y'' - y = x, y(0) = 1, y'(0) = 0 gives y = e^x - x.
        verdict, _ = check(req(kind="ode_solution", expression="ypp - y - x", conditions="y(0) = 1, yp(0) = 0",
                               student_result="exp(x)/2 + exp(-x)/2 - x", corrected_result="exp(x) - x"))
        self.assertEqual(verdict, "verified")

    def test_bad_condition_rejected(self):
        with self.assertRaises(Unsupported):
            check(req(kind="ode_solution", expression="yp - y", conditions="y(0) == import os",
                      student_result="", corrected_result="exp(x)"))

class SafetyTests(unittest.TestCase):
    def test_rejects_code(self):
        for bad in ["__import__('os')", "x.__class__", "exec(1)", "open(1)", "[1]", "a=1", "lambda: 1", "x; y"]:
            with self.assertRaises(Unsupported, msg=bad):
                parse(bad, "x")

    def test_accepts_math(self):
        self.assertEqual(str(parse("2x^2 + 3.5", "x")), "2*x**2 + 3.5")
        self.assertEqual(parse("DNE", "x"), "DNE")


if __name__ == "__main__":
    unittest.main()
