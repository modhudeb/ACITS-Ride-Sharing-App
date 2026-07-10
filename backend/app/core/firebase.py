import json
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from app.core.config import get_settings


@lru_cache
def get_firebase_app() -> firebase_admin.App:
    settings = get_settings()

    if settings.firebase_service_account_json:
        cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
    elif settings.google_application_credentials:
        cred = credentials.Certificate(settings.google_application_credentials)
    else:
        cred = credentials.ApplicationDefault()

    options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
    return firebase_admin.initialize_app(cred, options)


@lru_cache
def get_firestore_client():
    get_firebase_app()
    settings = get_settings()
    if settings.firestore_database_id:
        return firestore.client(database_id=settings.firestore_database_id)
    return firestore.client()
