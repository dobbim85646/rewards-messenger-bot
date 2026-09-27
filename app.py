import os
import requests
from flask import Flask, request

app = Flask(__name__)

# =========================
# الإعدادات
# =========================

VERIFY_TOKEN = os.environ.get(
    "VERIFY_TOKEN",
    "EAAXUv4EpWfMBSrdQ75waCQwaBCZAtZAI7tKXviLFS6NZCuMezOUBy5c1E7Ijn3eccwXpC3yGiVhOyMICQxOW3sIOzvf7z0FnhIkpAbY8C23xmbfWZCbvXdLA26qtxga3rZBgypyDu67kpBAm5W0XEeFIFHijxxeXEVm8knBqPj3GUbZC0Vd8zQJvTktASNUb8rhlTSHgZDZD"
)

PAGE_ACCESS_TOKEN = os.environ.get("PAGE_ACCESS_TOKEN")

GRAPH_API_VERSION = "v24.0"
MESSAGES_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}/me/messages"


# =========================
# التحقق من وجود الإعدادات
# =========================

if not PAGE_ACCESS_TOKEN:
    print("WARNING: PAGE_ACCESS_TOKEN غير موجود في Environment Variables")


# =========================
# Webhook Verification
# =========================

@app.route("/webhook", methods=["GET"])
def verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    print("Webhook verification request received")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        print("Webhook verification successful")
        return challenge, 200

    print("Webhook verification failed")
    return "Verification failed", 403


# =========================
# استقبال رسائل Messenger
# =========================

@app.route("/webhook", methods=["POST"])
def webhook():
    data = request.get_json(silent=True)

    if not data:
        print("Received empty or invalid JSON")
        return "EVENT_RECEIVED", 200

    print("Received:", data)

    # نتأكد أن الحدث خاص بصفحة Facebook
    if data.get("object") != "page":
        return "EVENT_RECEIVED", 200

    for entry in data.get("entry", []):

        for event in entry.get("messaging", []):

            # =========================
            # معلومات المرسل
            # =========================

            sender = event.get("sender", {})
            sender_id = sender.get("id")

            if not sender_id:
                continue

            # =========================
            # الرسالة
            # =========================

            message = event.get("message", {})

            # نتجاهل الأحداث التي ليست رسائل نصية
            if not message:
                continue

            text = message.get("text")

            if not text:
                continue

            text = text.strip()

            print(
                f"Message received from {sender_id}: {text}"
            )

            # =========================
            # الرد الحالي
            # =========================

            if text.lower() in ["ابدأ", "ابدا", "start"]:

                reply = (
                    "👋 مرحبًا بك في DZ Net Gifts!\n\n"
                    "🎁 أهلاً بك في نظام الجوائز.\n\n"
                    "للبدء، سنحتاج إلى تسجيل حسابك.\n\n"
                    "اكتب «متابعة» للبدء."
                )

                send_message(sender_id, reply)

            elif text.lower() in ["متابعة", "متابعه", "continue"]:

                reply = (
                    "📱 ممتاز!\n\n"
                    "سنبدأ الآن عملية التسجيل.\n\n"
                    "هذه الخطوة سيتم ربطها لاحقًا برقم الهاتف ورمز التحقق."
                )

                send_message(sender_id, reply)

            else:

                reply = (
                    "👋 مرحبًا بك في DZ Net Gifts!\n\n"
                    "اكتب «ابدأ» للبدء."
                )

                send_message(sender_id, reply)

    # يجب أن نعيد 200 إلى Meta بسرعة
    return "EVENT_RECEIVED", 200


# =========================
# إرسال رسالة إلى Messenger
# =========================

def send_message(recipient_id, text):

    if not PAGE_ACCESS_TOKEN:
        print("ERROR: PAGE_ACCESS_TOKEN غير موجود")
        return False

    payload = {
        "recipient": {
            "id": recipient_id
        },
        "message": {
            "text": text
        }
    }

    params = {
        "access_token": PAGE_ACCESS_TOKEN
    }

    try:

        response = requests.post(
            MESSAGES_URL,
            params=params,
            json=payload,
            timeout=15
        )

        print(
            "Send response:",
            response.status_code,
            response.text
        )

        if response.ok:
            print("Message sent successfully")
            return True

        print("Message sending failed")
        return False

    except requests.RequestException as error:

        print(
            "Request error while sending message:",
            error
        )

        return False


# =========================
# الصفحة الرئيسية
# =========================

@app.route("/", methods=["GET"])
def home():

    return (
        "DZ Net Gifts Messenger Bot is running.",
        200
    )


# =========================
# تشغيل التطبيق محليًا
# =========================

if __name__ == "__main__":

    port = int(
        os.environ.get("PORT", 10000)
    )

    app.run(
        host="0.0.0.0",
        port=port
    )