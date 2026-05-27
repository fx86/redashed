from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import connections, query, user_connections, saved_queries, dashboards, uploads, datagov, settings, alerts
from app.services import alert_service

app = FastAPI(title="BI Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(query.router)
app.include_router(user_connections.router)
app.include_router(saved_queries.router)
app.include_router(dashboards.router)
app.include_router(uploads.router)
app.include_router(datagov.router)
app.include_router(settings.router)
app.include_router(alerts.router)


@app.on_event("startup")
def startup():
    alert_service.start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}
