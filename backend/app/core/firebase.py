"""Firebase Admin SDK clients for Firestore and Cloud Storage."""

import firebase_admin
from firebase_admin import firestore, storage

from app.core.config import settings


def get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        return firebase_admin.initialize_app(options={
            "projectId": settings.FIREBASE_PROJECT_ID,
            "storageBucket": settings.FIREBASE_STORAGE_BUCKET,
        })


def get_firestore_client():
    return firestore.client(app=get_firebase_app())


def get_storage_bucket():
    return storage.bucket(app=get_firebase_app())