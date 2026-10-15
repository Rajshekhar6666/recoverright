from groq import Groq

from app import config

print("key length being used:", len(config.GROQ_API_KEY))

if not config.GROQ_API_KEY:
    raise SystemExit("No key found. Check E:\\recoverright\\.env")

client = Groq(api_key=config.GROQ_API_KEY)
try:
    for m in client.models.list().data:
        print(m.id)
except Exception as e:
    print("Groq call failed:", type(e).__name__, "-", str(e)[:200])