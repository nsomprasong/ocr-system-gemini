import requests
import json
from datetime import datetime

API_KEY = "AIzaSyCQXBDJRPKPu9wbAwMVIYx4pKWgTEKhD_E"
PROJECT_ID = "ocr-system-c3bea"

EMAIL = "nsomprasong@gmail.com"
PASSWORD = "123456"


def firebase_login(email: str, password: str) -> str:
    """ล็อกอินด้วย email/password แล้วคืนค่า idToken"""
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True,
    }
    resp = requests.post(url, json=payload)
    resp.raise_for_status()
    data = resp.json()
    print("✅ Login success:", data.get("email"))
    return data["idToken"]


def write_to_firestore(id_token: str):
    """เขียนข้อมูลทดสอบลง Firestore ด้วย idToken ของ user"""
    url = (
        f"https://firestore.googleapis.com/v1/"
        f"projects/{PROJECT_ID}/databases/(default)/documents/test_python_write"
    )

    # document จะชื่อ random ที่ Firestore สร้างให้เอง
    headers = {
        "Authorization": f"Bearer {id_token}",
        "Content-Type": "application/json",
    }

    # ข้อมูลตัวอย่าง
    payload = {
        "fields": {
            "message": {"stringValue": "Hello from Python"},
            "createdBy": {"stringValue": EMAIL},
            "createdAt": {"timestampValue": datetime.utcnow().isoformat() + "Z"},
        }
    }

    resp = requests.post(url, headers=headers, data=json.dumps(payload))
    print("📡 Firestore status:", resp.status_code)
    print("📄 Response:", resp.text)

    resp.raise_for_status()
    print("✅ Write to Firestore success")


if __name__ == "__main__":
    try:
        token = firebase_login(EMAIL, PASSWORD)
        write_to_firestore(token)
    except requests.HTTPError as e:
        print("❌ HTTP error:", e.response.status_code, e.response.text)
    except Exception as e:
        print("❌ Error:", repr(e))