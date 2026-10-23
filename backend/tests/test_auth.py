import pytest
from app.models.models import User, Organization, OrgMembership, OrgRole
from app.core.security import verify_password


def test_register_success(client, db):
    payload = {
        "email": "testuser@example.com",
        "password": "SecurePassword123!",
        "display_name": "Test User",
        "org_name": "Test Organization",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "testuser@example.com"
    assert data["role"] == "owner"
    assert data["has_keys"] is False

    # Check cookies
    assert "session" in response.cookies
    assert "csrf_token" in response.cookies

    # Check user in DB has hashed password, never plaintext
    user = db.query(User).filter(User.email == "testuser@example.com").first()
    assert user is not None
    assert user.password_hash != "SecurePassword123!"
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password("SecurePassword123!", user.password_hash)


def test_register_duplicate_email(client):
    payload = {
        "email": "dup@example.com",
        "password": "SecurePassword123!",
        "display_name": "User 1",
        "org_name": "Org 1",
    }
    res1 = client.post("/api/auth/register", json=payload)
    assert res1.status_code == 200

    res2 = client.post("/api/auth/register", json=payload)
    assert res2.status_code == 409
    assert "Email already registered" in res2.json()["detail"]


def test_password_strength_validation(client):
    # Weak password - no uppercase
    res = client.post("/api/auth/register", json={
        "email": "weak@example.com",
        "password": "password123!",
        "display_name": "Weak",
        "org_name": "Org",
    })
    assert res.status_code == 422


def test_login_success_and_logout(client):
    reg_payload = {
        "email": "loginuser@example.com",
        "password": "LoginPassword123!",
        "display_name": "Login User",
        "org_name": "Login Org",
    }
    client.post("/api/auth/register", json=reg_payload)

    # Login
    login_res = client.post("/api/auth/login", json={
        "email": "loginuser@example.com",
        "password": "LoginPassword123!",
    })
    assert login_res.status_code == 200
    assert "session" in login_res.cookies

    # Access /me
    me_res = client.get("/api/auth/me", cookies=login_res.cookies)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "loginuser@example.com"

    # Logout
    logout_res = client.post("/api/auth/logout", cookies=login_res.cookies)
    assert logout_res.status_code == 200

    # Access /me after logout fails
    me_after = client.get("/api/auth/me", cookies={"session": ""})
    assert me_after.status_code == 401


def test_login_invalid_password(client):
    reg_payload = {
        "email": "wrongpw@example.com",
        "password": "CorrectPassword123!",
        "display_name": "User",
        "org_name": "Org",
    }
    client.post("/api/auth/register", json=reg_payload)

    login_res = client.post("/api/auth/login", json={
        "email": "wrongpw@example.com",
        "password": "WrongPassword123!",
    })
    assert login_res.status_code == 401
