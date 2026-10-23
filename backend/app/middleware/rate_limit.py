"""Rate limiting middleware for login endpoints."""

import time
from collections import defaultdict
from threading import Lock
from typing import Tuple

from app.core.config import settings


class RateLimiter:
    """Simple in-memory rate limiter for login attempts.
    In production, use Redis for distributed rate limiting."""

    def __init__(self):
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> Tuple[bool, int]:
        """Check if the key is rate limited.
        Returns (allowed, seconds_until_reset)."""
        with self._lock:
            now = time.time()
            window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
            max_attempts = settings.LOGIN_RATE_LIMIT_ATTEMPTS

            # Clean old attempts
            self._attempts[key] = [
                t for t in self._attempts[key]
                if now - t < window
            ]

            if len(self._attempts[key]) >= max_attempts:
                oldest = self._attempts[key][0]
                wait = int(window - (now - oldest)) + 1
                return False, wait

            return True, 0

    def record(self, key: str):
        """Record an attempt."""
        with self._lock:
            self._attempts[key].append(time.time())


login_limiter = RateLimiter()
