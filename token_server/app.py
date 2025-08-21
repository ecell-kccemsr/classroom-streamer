import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from livekit import api

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv('LIVEKIT_API_KEY')
API_SECRET = os.getenv('LIVEKIT_API_SECRET')

@app.route('/token', methods=['POST'])
def generate_token():
    if not API_KEY or not API_SECRET:
        return jsonify({'error': 'API key or secret not configured'}), 500

    data = request.get_json()
    if not data or 'roomName' not in data or 'identity' not in data:
        return jsonify({'error': 'Missing roomName or identity'}), 400

    room_name = data['roomName']
    identity = data['identity']

    try:
        token = api.AccessToken(API_KEY, API_SECRET)
        token.identity = identity
        token.name = identity
        token.add_grant(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True
        )
        jwt = token.to_jwt()
        return jsonify({'token': jwt})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
