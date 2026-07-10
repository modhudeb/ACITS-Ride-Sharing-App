"""One-off: promote an existing signed-up user to the admin role in Firestore.

Usage:
    cd backend
    .venv\\Scripts\\python.exe promote_to_admin.py someone@example.com
"""
import sys

from app.core.firebase import get_firebase_app, get_firestore_client
from firebase_admin import auth as fb_auth

get_firebase_app()

email = sys.argv[1]

user = fb_auth.get_user_by_email(email)
db = get_firestore_client()
db.collection("users").document(user.uid).update({"role": "admin", "status": "active"})

print(f"Promoted {email} (uid={user.uid}) to admin.")
