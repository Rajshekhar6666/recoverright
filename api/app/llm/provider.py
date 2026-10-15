from typing import Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMProvider(Protocol):
    name: str

    async def generate_structured(self, system: str, user: str, schema: type[T]) -> T: ...