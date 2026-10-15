import asyncio
import json
import re
import groq
from groq import AsyncGroq
from pydantic import ValidationError

from app import config


def _strip_fences(text: str | None) -> str:
    """Remove <think> blocks and ```json fences if the model added them."""
    text = (text or "").strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rstrip()
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


class GroqProvider:
    def __init__(self, model: str, api_key: str | None = None):
        self.name = model
        self.client = AsyncGroq(api_key=api_key or config.GROQ_API_KEY)

    async def generate_structured(self, system, user, schema, max_attempts: int = 4):
        schema_json = json.dumps(schema.model_json_schema())
        sys_msg = (
            system
            + "\n\nReturn ONLY one valid JSON object, with no markdown and no commentary, "
              "that conforms to this JSON Schema:\n" + schema_json
        )
        last: Exception | None = None
        for attempt in range(max_attempts):
            try:
                resp = await self.client.chat.completions.create(
                    model=self.name,
                    messages=[
                        {"role": "system", "content": sys_msg},
                        {"role": "user", "content": user},
                    ],
                    response_format={"type": "json_object"},
                )
                raw = _strip_fences(resp.choices[0].message.content)
                return schema.model_validate_json(raw)
            except (groq.RateLimitError, groq.InternalServerError, groq.APIConnectionError) as e:
                last = e  # busy or rate limited: wait and retry
                await asyncio.sleep(2 * 2 ** attempt)
            except groq.BadRequestError as e:
                if "json_validate_failed" in str(e):  # model produced broken JSON: retry
                    last = e
                    await asyncio.sleep(1)
                    continue
                raise
            except (ValidationError, ValueError) as e:
                last = e  # JSON didn't match the schema: retry
                await asyncio.sleep(1)
        raise RuntimeError(f"{self.name} failed after {max_attempts} attempts: {last}")