"""Seeds the default demo accounts: one admin, one passenger, one approved
driver (with a truck already configured) - plus a default fare_rules row so
the admin pricing page has real values from the start.

Looks accounts up by email and upserts, so it's safe to re-run and also
heals older rows (e.g. accounts created before self-hosted auth existed,
which have no password_hash yet) without touching their uid - ride/rating
history tied to that uid stays intact.

Usage:
    cd backend
    .venv\\Scripts\\python.exe seed_demo_data.py
"""
import uuid
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.passwords import hash_password
from app.db.models import DriverProfile, FareRules, User
from app.db.session import get_session_factory
from app.services.fare_service import DEFAULT_FARE_RULES

settings = get_settings()


def upsert_user(session, email: str, password: str, role: str, name: str, status: str) -> User:
    user = session.query(User).filter(User.email == email).first()
    if user:
        user.password_hash = hash_password(password)
        user.role = role
        user.name = name
        user.status = status
        print(f"  Updated existing account: {email} (uid={user.uid})")
    else:
        user = User(
            uid=str(uuid.uuid4()),
            role=role,
            name=name,
            email=email,
            password_hash=hash_password(password),
            status=status,
            created_at=datetime.now(timezone.utc),
        )
        session.add(user)
        print(f"  Created account: {email} (uid={user.uid})")
    session.commit()
    return user


def main():
    session_factory = get_session_factory()

    print("Admin account")
    admin_email = f"{settings.admin_username}@acits.internal"
    with session_factory() as session:
        upsert_user(session, admin_email, settings.admin_password, "admin", "Administrator", "active")
    print(f"  Sign in at /admin with username='{settings.admin_username}' password='{settings.admin_password}'\n")

    print("Passenger account")
    passenger_email = "passenger@acits.demo"
    with session_factory() as session:
        upsert_user(session, passenger_email, "Passenger@123", "passenger", "Rahim Uddin", "active")
    print(f"  Sign in as a rider with email='{passenger_email}' password='Passenger@123'\n")

    print("Driver account")
    driver_email = "driver@acits.demo"
    with session_factory() as session:
        driver = upsert_user(session, driver_email, "Driver@123", "driver", "Karim Hossain", "active")

        profile = session.get(DriverProfile, driver.uid)
        if not profile:
            profile = DriverProfile(
                uid=driver.uid,
                vehicle_type="truck",
                vehicle_model="Tata Ace",
                plate_number="DHAKA-METRO-GA-11-2233",
                max_passengers=2,
                max_weight_kg=1000.0,
                max_volume_m3=6.0,
                online_status="offline",
                rating_avg=4.8,
                rating_count=12,
            )
            session.add(profile)
            print("  Created driver_profiles row (truck, pre-approved, offline)")
        else:
            print("  driver_profiles row already exists")
        session.commit()
    print(f"  Sign in as a driver with email='{driver_email}' password='Driver@123'\n")

    print("Default fare rules")
    with session_factory() as session:
        rules_row = session.get(FareRules, 1)
        if not rules_row:
            session.add(
                FareRules(
                    id=1,
                    base_fare=DEFAULT_FARE_RULES["baseFare"],
                    per_km_rate=DEFAULT_FARE_RULES["perKmRate"],
                    per_min_rate=DEFAULT_FARE_RULES["perMinRate"],
                    booking_fee=DEFAULT_FARE_RULES["bookingFee"],
                    minimum_fare=DEFAULT_FARE_RULES["minimumFare"],
                    per_kg_rate=DEFAULT_FARE_RULES["perKgRate"],
                    per_m3_rate=DEFAULT_FARE_RULES["perM3Rate"],
                    pool_discount_pct=DEFAULT_FARE_RULES["poolDiscountPct"],
                    peak_hour_multiplier=DEFAULT_FARE_RULES["peakHourMultiplier"],
                    night_multiplier=DEFAULT_FARE_RULES["nightMultiplier"],
                    surge_enabled=DEFAULT_FARE_RULES["surgeEnabled"],
                    surge_cap=DEFAULT_FARE_RULES["surgeCap"],
                    cancellation_fee=DEFAULT_FARE_RULES["cancellationFee"],
                    cancellation_free_window_sec=DEFAULT_FARE_RULES["cancellationFreeWindowSec"],
                    peak_hours=DEFAULT_FARE_RULES["peakHours"],
                    night_hours=DEFAULT_FARE_RULES["nightHours"],
                )
            )
            session.commit()
            print("  Created fare_rules row with default rates")
        else:
            print("  fare_rules row already exists")

    print("\nDone.")


if __name__ == "__main__":
    main()
