"""Password-reset email delivery. Falls back to logging the reset link
server-side when SMTP isn't configured, so local dev and a fresh clone work
with zero setup - set SMTP_* in .env to actually deliver mail."""

import logging
import smtplib
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    settings = get_settings()
    body = (
        f"Someone requested a password reset for your ACITS account.\n\n"
        f"Reset your password: {reset_link}\n\n"
        f"This link expires in 1 hour. If you didn't request this, ignore this email."
    )

    if not settings.smtp_host:
        logger.info("SMTP not configured - password reset link for %s: %s", to_email, reset_link)
        return

    message = MIMEText(body)
    message["Subject"] = "Reset your ACITS password"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
