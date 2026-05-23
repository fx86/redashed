from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import connections, query

app = FastAPI(title="BI Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(query.router)


@app.get("/health")
def health():
    return {"status": "ok"}
