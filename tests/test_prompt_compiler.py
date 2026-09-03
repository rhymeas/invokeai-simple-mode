import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw


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

    def test_material_extract_is_a_source_derived_atlas(self):
        source = Image.new("RGB", (640, 360), "#20252a")
        draw = ImageDraw.Draw(source)
        draw.rectangle((0, 0, 319, 179), fill="#d8d0bd")
        draw.rectangle((320, 0, 639, 179), fill="#668577")
        draw.rectangle((0, 180, 319, 359), fill="#484a4d")
        for x in range(330, 640, 12):
            draw.line((x, 190, x, 350), fill="#d5b86b", width=4)

        atlas, metadata = SERVER.build_extract_reference(source, target="material", sample="hierarchy")

        self.assertEqual((1400, 900), atlas.size)
        self.assertEqual("material", metadata["target"])
        self.assertTrue(metadata["source_derived"])
        self.assertGreaterEqual(metadata["sample_count"], 4)

    def test_color_extract_reports_measured_source_colors(self):
        source = Image.new("RGB", (200, 100), "#ff0000")
        ImageDraw.Draw(source).rectangle((100, 0, 199, 99), fill="#0000ff")

        atlas, metadata = SERVER.build_extract_reference(source, target="color", sample="dominant")

        self.assertEqual((1400, 820), atlas.size)
        self.assertTrue(metadata["source_derived"])
        palette = {item["hex"] for item in metadata["palette"]}
        self.assertIn("#FF0000", palette)
        self.assertIn("#0000FF", palette)

    def test_spatial_instruction_limits_material_candidates(self):
        source = Image.new("RGB", (600, 400), "#808080")
        samples = SERVER.source_region_samples(source, instruction="right side materials")

        self.assertTrue(samples)
        self.assertTrue(all(sample["center"][0] >= 0.42 for sample in samples))

    def test_vision_analysis_becomes_structured_material_profiles(self):
        analysis = (
            "The floor is polished concrete with a dark gray glossy finish and broad reflections. "
            "The ceiling is made from matte metal panels with narrow seams. "
            "The structural frame is painted steel with rigid fabricated joins. "
            "The display wall is an LED display panel with a fine pixel matrix and reflective face."
        )

        profiles = SERVER.material_profiles_from_analysis(analysis)

        self.assertEqual(4, len(profiles))
        self.assertEqual("Polished concrete", profiles[0]["name"])
        self.assertEqual("Floor", profiles[0]["location"])
        self.assertEqual("LED display panel", profiles[3]["name"])
        self.assertIn("pixel matrix", profiles[3]["close_up"])

    def test_material_location_matching_does_not_treat_background_as_ground(self):
        sentence = "The display panel has a dark background and a reflective screen surface."

        location = SERVER._first_matching_label(sentence, SERVER.MATERIAL_LOCATION_RULES, "")

        self.assertEqual("Display wall", location)

    def test_plural_surface_locations_start_separate_material_profiles(self):
        analysis = "The ceiling is metallic. The walls are glass and metal. The display panels use an LED pixel matrix."

        profiles = SERVER.material_profiles_from_analysis(analysis)

        self.assertEqual(["Ceiling", "Wall", "Display wall"], [profile["location"] for profile in profiles])

    def test_material_report_combines_generated_macros_and_readable_details(self):
        macro = Image.new("RGB", (800, 800), "#303030")
        draw = ImageDraw.Draw(macro)
        draw.rectangle((400, 0, 799, 399), fill="#607060")
        draw.rectangle((0, 400, 399, 799), fill="#909090")
        draw.rectangle((400, 400, 799, 799), fill="#202830")
        source = Image.new("RGB", (640, 360), "#405040")
        materials = SERVER.material_profiles_from_analysis(
            "The floor is polished concrete. The ceiling is metal. "
            "The structural frame is painted steel. The display wall is an LED display panel."
        )

        report = SERVER.build_material_study_report(macro, source, materials)

        self.assertEqual((1800, 1200), report.size)

    def test_material_vision_analysis_unloads_models_after_use(self):
        calls = []

        def fake_invoke(path, method="GET", payload=None, timeout=30):
            calls.append((path, method))
            if path == "/api/v1/utilities/image-to-prompt":
                return {"prompt": "The floor is polished concrete with fine aggregate and broad reflections."}
            return None

        with (
            patch.object(SERVER, "choose_image_to_prompt_model", return_value={"key": "vision", "name": "Small vision"}),
            patch.object(SERVER, "ensure_generation_queue_idle"),
            patch.object(SERVER, "invoke_json", side_effect=fake_invoke),
        ):
            profiles, _, model = SERVER.analyze_materials_with_vision("source.png", limit=1)

        self.assertEqual("Polished concrete", profiles[0]["name"])
        self.assertTrue(model["cache_cleared"])
        self.assertEqual("unload_after_analysis", model["cache_policy"])
        self.assertEqual(
            [
                ("/api/v1/utilities/image-to-prompt", "POST"),
                ("/api/v2/models/empty_model_cache", "POST"),
            ],
            calls,
        )


    def test_expansion_prefers_smallest_qwen(self):
        models = [
            {'key': 'big', 'name': 'Qwen2.5-3B-Instruct', 'type': 'text_llm'},
            {'key': 'tiny', 'name': 'Qwen3-0.6B', 'type': 'text_llm'},
            {'key': 'small', 'name': 'SmolLM2-1.7B-Instruct', 'type': 'text_llm'},
            {'key': 'other', 'name': 'Some-7B-Chat', 'type': 'text_llm'},
        ]

        with patch.object(SERVER, 'invoke_json', return_value={'models': models}):
            chosen = SERVER.choose_prompt_expansion_model()

        self.assertEqual('tiny', chosen['key'])

    def test_expansion_orders_qwen_sizes_without_substring_traps(self):
        models = [
            {'key': 'xl', 'name': 'Qwen3-14B', 'type': 'text_llm'},
            {'key': 'mid', 'name': 'Qwen3-4B-Instruct', 'type': 'text_llm'},
            {'key': 'low', 'name': 'Qwen3-1.7B', 'type': 'text_llm'},
        ]

        with patch.object(SERVER, 'invoke_json', return_value={'models': models}):
            chosen = SERVER.choose_prompt_expansion_model()

        self.assertEqual('low', chosen['key'])

    def test_prompt_expansion_unloads_llm_after_use(self):
        calls = []

        def fake_invoke(path, method='GET', payload=None, timeout=30):
            calls.append((path, method))
            if path == '/api/v2/models/?with_config=true':
                return {'models': [{'key': 'tiny', 'name': 'Qwen3-0.6B', 'type': 'text_llm'}]}
            if path == '/api/v1/queue/default/status':
                return {'queue': {'pending': 0, 'in_progress': 0}, 'processor': {'is_processing': False}}
            if path == '/api/v1/utilities/expand-prompt':
                return {'expanded_prompt': 'a small red chair with coherent shadows'}
            return None

        with patch.object(SERVER, 'invoke_json', side_effect=fake_invoke):
            expanded, model = SERVER.expand_prompt_locally('add a red chair', [{'slot': 0, 'image_name': 's.png'}])

        self.assertTrue(expanded)
        self.assertEqual('tiny', model['key'])
        self.assertIn(('/api/v1/utilities/expand-prompt', 'POST'), calls)
        self.assertIn(('/api/v2/models/empty_model_cache', 'POST'), calls)
    def test_extract_rejects_unknown_target_before_fetch(self):
        import json as json_module
        import threading as threading_module
        import urllib.error as url_error
        import urllib.request as url_request
        from http.server import ThreadingHTTPServer as TestHTTPServer

        server = TestHTTPServer(('127.0.0.1', 0), SERVER.Handler)
        thread = threading_module.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            payload = json_module.dumps({'image_name': 'source.png', 'target': 'bogus'}).encode('utf-8')
            request = url_request.Request(
                'http://127.0.0.1:' + str(server.server_port) + '/api/extract-reference',
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            try:
                url_request.urlopen(request, timeout=10)
                self.fail('expected HTTP 400 for an unknown extraction target')
            except url_error.HTTPError as exc:
                self.assertEqual(400, exc.code)
                body = json_module.loads(exc.read().decode('utf-8'))
                self.assertIn('Unknown extraction target', body.get('error', ''))
        finally:
            server.shutdown()
            thread.join(timeout=10)
    def test_http_error_from_invoke_is_not_reported_as_offline(self):
        import io as io_module
        import urllib.error as url_error

        body = io_module.BytesIO(b'{"detail": "Model X is not a LLaVA OneVision model"}')
        error = url_error.HTTPError(
            "http://127.0.0.1:9090/api/v1/utilities/image-to-prompt", 422, "Unprocessable Entity", {}, body)

        self.assertEqual(422, SERVER.invoke_error_status(error))
        message = SERVER.invoke_error_message(error)
        self.assertIn("422", message)
        self.assertIn("LLaVA OneVision", message)
        self.assertNotIn("offline", message.casefold())

    def test_refused_connection_stays_offline_503(self):
        import urllib.error as url_error

        error = url_error.URLError(ConnectionRefusedError(10061, "refused"))

        self.assertEqual(503, SERVER.invoke_error_status(error))
        self.assertIn("offline", SERVER.invoke_error_message(error).casefold())
    def test_removal_dominant_prompt_does_not_reattach_removed_color(self):
        prompt = SERVER.build_prompt(
            "remove the white border and make it a seamless lcd wall screen with round corner",
            [{"slot": 0, "image_name": "source.png", "role": "main"}],
        )

        self.assertIn("Do not reintroduce removed colors", prompt)
        self.assertNotIn("Attach each requested color", prompt)

    def test_removal_with_replacement_keeps_color_binding(self):
        prompt = SERVER.build_prompt(
            "remove the red border and replace it with a blue frame",
            [{"slot": 0, "image_name": "source.png", "role": "main"}],
        )

        self.assertIn("Attach each requested color", prompt)
        self.assertNotIn("Do not reintroduce removed colors", prompt)

    def test_bare_change_counts_as_replacement(self):
        prompt = SERVER.build_prompt(
            "change the right side font to The World Game",
            [{"slot": 0, "image_name": "source.png", "role": "main"}],
        )

        self.assertIn("Replace only the named target", prompt)
if __name__ == "__main__":
    unittest.main()
