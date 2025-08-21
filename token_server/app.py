import os
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from livekit import api, egress

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv('LIVEKIT_API_KEY')
API_SECRET = os.getenv('LIVEKIT_API_SECRET')
LIVEKIT_URL = os.getenv('LIVEKIT_URL', 'ws://localhost:7880')

# Ensure recordings directory exists
RECORDINGS_DIR = '/mnt/recordings'
os.makedirs(RECORDINGS_DIR, exist_ok=True)

def get_livekit_client():
    if not API_KEY or not API_SECRET:
        raise ValueError('API key or secret not configured')
    return egress.EgressClient(
        host=LIVEKIT_URL.replace('ws://', 'http://'),
        api_key=API_KEY,
        api_secret=API_SECRET
    )

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

@app.route('/start-recording', methods=['POST'])
def start_recording():
    try:
        data = request.get_json()
        if not data or 'roomName' not in data:
            return jsonify({'error': 'Missing roomName'}), 400

        room_name = data['roomName']
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f"{room_name}-{timestamp}.mp4"
        output_path = os.path.join(RECORDINGS_DIR, output_file)

        client = get_livekit_client()
        
        # Configure file output options
        file_output = egress.EncodedFileOutput(
            filepath=output_path,
            filename_prefix=f"{room_name}-{timestamp}",
            fileType=egress.EncodedFileType.MP4
        )

        # Start room composite recording
        response = client.start_room_composite_egress(
            room_name=room_name,
            output=file_output,
            options=egress.RoomCompositeEgressRequest(
                audio=True,
                video=True,
                layout="gallery"
            )
        )

        return jsonify({
            'egressId': response.egress_id,
            'status': response.status,
            'filePath': output_path
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': f'Failed to start recording: {str(e)}'}), 500

@app.route('/stop-recording', methods=['POST'])
def stop_recording():
    try:
        data = request.get_json()
        if not data or 'egressId' not in data:
            return jsonify({'error': 'Missing egressId'}), 400

        egress_id = data['egressId']
        client = get_livekit_client()
        
        # Stop the recording
        response = client.stop_egress(egress_id)
        
        return jsonify({
            'status': response.status,
            'message': 'Recording stopped successfully'
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': f'Failed to stop recording: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
