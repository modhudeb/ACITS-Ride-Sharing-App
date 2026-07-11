"""One-off: promote an existing signed-up user to the admin role.

Usage:
    cd backend
    .venv\\Scripts\\python.exe promote_to_admin.py someone@example.com
"""
import sys

from app.db.models import User
from app.db.session import get_session_factory

email = sys.argv[1]

with get_session_factory()() as session:
    user = session.query(User).filter(User.email == email).first()
    if not user:
        sys.exit(f"No account found for {email} - have they signed up yet?")
    user.role = "admin"
    user.status = "active"
    session.commit()

print(f"Promoted {email} (uid={user.uid}) to admin.")
