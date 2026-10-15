import importlib

modules = [
    "app.config",
    "app.schemas.document",
    "app.schemas.events",
    "app.schemas.plan",
    "app.services.event_bus",
    "app.pipeline.parse",
    "app.llm.provider",
    "app.llm.groq_provider",
    "app.llm.factory",
    "app.pipeline.extract",
]
all_ok = True
for m in modules:
    try:
        importlib.import_module(m)
        print("OK      ", m)
    except Exception as e:
        all_ok = False
        print("PROBLEM ", m, "->", type(e).__name__, ":", e)

try:
    from app.schemas.events import Stage
    print("Stage.EXTRACT_A:", hasattr(Stage, "EXTRACT_A"), "| Stage.EXTRACT_B:", hasattr(Stage, "EXTRACT_B"))
except Exception:
    pass

print("\nAll good!" if all_ok else "\nFix the PROBLEM lines above, then run this again.")