from app import config


def get_provider(model: str):
    from app.llm.groq_provider import GroqProvider
    return GroqProvider(model)