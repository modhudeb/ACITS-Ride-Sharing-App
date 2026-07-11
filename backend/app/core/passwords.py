import bcrypt

# bcrypt silently truncates at 72 bytes - reject longer passwords explicitly
# rather than let two different passwords that share a 72-byte prefix hash
# identically.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # Malformed/foreign hash format - treat as a non-match, not a crash.
        return False
