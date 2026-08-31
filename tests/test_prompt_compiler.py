import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "simple-mode" / "simple_mode_server.py"
SPEC = importlib.util.spec_from_file_location("simple_mode_server", MODULE_PATH)
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class PromptCompilerTests(unittest.TestCase):
    def test_short_geometry_request_is_preserved_and_scaffolded(self):
        prompt = SERVER.build_prompt(
            "make @1 screen corner round",
            [{"slot": 0, "image_name": "source.png", "role": "main"}],
        )

        self.assertTrue(prompt.startswith("AUTHORITATIVE USER REQUEST:\nmake image 1 screen corner round"))
        self.assertIn("Resolve the requested geometry with continuous surfaces", prompt)
        self.assertIn("Use image 1 as visual ground truth", prompt)
        self.assertNotIn("masterpiece", prompt.casefold())
        self.assertNotIn("8k", prompt.casefold())

    def test_reference_roles_and_tokens_follow_actual_input_order(self):
        prompt = SERVER.build_prompt(
            "Use @3 for light and @1 for the composition.",
            [
                {"slot": 0, "image_name": "main.png", "role": "main"},
                {"slot": 2, "image_name": "light.png", "role": "lighting", "note": "soft side light"},
            ],
        )

        self.assertIn("Use image 2 for light and image 1 for the composition.", prompt)
        self.assertIn("Image 2 serves as the lighting reference", prompt)
        self.assertIn("Apply this note: soft side light", prompt)

    def test_node_controls_remain_hard_constraints(self):
        prompt = SERVER.build_prompt(
            "make it warmer",
            [{"slot": 0, "image_name": "source.png"}],
            generation_profile={"kind": "variate", "settings": {"axis": "color", "quality": "preview"}},
        )

        self.assertIn("This request comes from the variate node", prompt)
        self.assertIn("- axis: color", prompt)
        self.assertNotIn("- quality:", prompt)
        self.assertIn("production constraints rather than optional style suggestions", prompt)

    def test_signal_detection_handles_english_german_and_word_boundaries(self):
        signals = SERVER.detect_prompt_signals("Entferne die weiße Kante und mache die Ecke rund")
        self.assertIn("remove", signals)
        self.assertIn("geometry", signals)
        self.assertIn("color", SERVER.detect_prompt_signals("make the chair red"))
        self.assertNotIn("lighting", SERVER.detect_prompt_signals("a delightful expression"))

    def test_optional_llm_expansion_stays_below_authoritative_request(self):
        prompt = SERVER.build_prompt(
            "add a red chair",
            [{"slot": 0, "image_name": "source.png"}],
            expanded_prompt="Add one red chair with coherent perspective and contact shadow.",
        )

        self.assertLess(prompt.index("add a red chair"), prompt.index("CONSTRAINED VISUAL INTERPRETATION"))
        self.assertIn("Place the requested addition with plausible scale", prompt)

    def test_reference_tokens_are_mapped_inside_optional_expansion(self):
        prompt = SERVER.build_prompt(
            "use @3 for light",
            [
                {"slot": 0, "image_name": "source.png"},
                {"slot": 2, "image_name": "light.png", "role": "lighting"},
            ],
            expanded_prompt="Match the lighting from @3 while retaining @1.",
        )

        self.assertIn("Match the lighting from image 2 while retaining image 1.", prompt)

    def test_already_detailed_prompt_skips_optional_llm(self):
        detailed = " ".join(f"detail{i}" for i in range(33))
        self.assertEqual(
            (None, None),
            SERVER.expand_prompt_locally(detailed, [{"slot": 0, "image_name": "source.png"}]),
        )


if __name__ == "__main__":
    unittest.main()
