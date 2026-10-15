from app import config

p = config.ENV_FILE
print("path:", p, "| exists:", p.is_file())
raw = p.read_bytes()
print("total bytes:", len(raw), "| first 3 bytes:", raw[:3])
for line in raw.decode("utf-8-sig", errors="replace").splitlines():
    name, _, value = line.partition("=")
    print("name:", repr(name), "-> value length:", len(value))
print("config key length:", len(config.GROQ_API_KEY))