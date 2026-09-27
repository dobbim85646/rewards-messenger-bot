import os
import requests
from flask import Flask, request

app = Flask(__name__)

VERIFY_TOKEN = "EAAXUv4EpWfMBSt7pIiugi3knIgJDu6fmIyzEslJPU0B6rLu76dul4UK30a0g3dGzyZBkDxfXz7LjcKaMljpvKayZAuZBnNJqV5CMaceZBVtulCIq77zkTOPgyQxsA23OZC3uZCoXqPrSxm7yD4vedtXZB18LLLDA9eFFibyq2ZBvBigSFs9SunBKH6gjMSiszq9l8pnlAwZDZD"
PAGE_ACCESS_TOKEN = os.environ.get("PAGE_ACCESS_TOKEN")


@app.route("/webhook", methods=["GET"])
def verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return challenge, 200

    return "Verification failed", 403


@app.route("/webhook", methods=["POST"])
def webhook():
    data = request.get_json()

    print("Received:", data)

    if data.get("object") == "page":
        for entry in data.get("entry", []):
            for event in entry.get("messaging", []):

                sender = event.get("sender", {})
                sender_id = sender.get("id")

                message = event.get("message", {})
                text = message.get("text", "")

                if sender_id and text:
                    send_message(
                        sender_id,
                        "👋 مرحبًا بك في DZ Net Gifts!\n\n"
                        "اكتب «ابدأ» للمتابعة."
                    )

    return "EVENT_RECEIVED", 200


def send_message(recipient_id, text):
    url = "https://graph.facebook.com/v24.0/me/messages"

    params = {
        "access_token": PAGE_ACCESS_TOKEN
    }

    payload = {
        "recipient": {
            "id": recipient_id
        },
        "message": {
            "text": text
        }
    }

    response = requests.post(
        url,
        params=params,
        json=payload
    )

    print("Send response:", response.status_code, response.text)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
