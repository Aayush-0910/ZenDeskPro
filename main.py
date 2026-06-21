import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

from api.index import app  # noqa: F401 — re-exported for Vercel compatibility

if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 3000))
    uvicorn.run("api.index:app", host="0.0.0.0", port=PORT)
