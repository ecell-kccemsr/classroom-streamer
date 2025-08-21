import os
import time
import logging
from dotenv import load_dotenv
from livekit import agents, plugins, rtc

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration
LIVEKIT_URL = os.getenv('LIVEKIT_URL')
API_KEY = os.getenv('LIVEKIT_API_KEY')
API_SECRET = os.getenv('LIVEKIT_API_SECRET')
ROOM_NAME = os.getenv('ROOM_NAME')
RTSP_URL = os.getenv('RTSP_URL')
MIC_DEVICE = os.getenv('MIC_DEVICE', 'default')

class ClassroomStreamer:
    def __init__(self):
        self.room = None
        self.video_source = None
        self.audio_source = None

    async def setup_sources(self):
        # Set up RTSP video source
        self.video_source = plugins.rtsp.RTSPSource(
            url=RTSP_URL,
            reconnect_interval=5
        )

        # Set up PulseAudio source with noise suppression
        self.audio_source = plugins.ffmpeg.PulsedAudioSourceReader(
            device=MIC_DEVICE,
            extra_args=[
                '-af', 'anlmdn=s=0.001:p=0.95:r=0.9',  # Noise suppression
                '-flags', 'low_delay',  # Low latency flags
                '-fflags', 'nobuffer'
            ]
        )

    async def connect(self):
        try:
            # Create room
            self.room = agents.Room(
                url=LIVEKIT_URL,
                api_key=API_KEY,
                api_secret=API_SECRET,
                name=ROOM_NAME,
                identity=f"streamer_{ROOM_NAME}"
            )

            # Connect to room
            await self.room.connect()
            logger.info(f"Connected to room: {ROOM_NAME}")

            # Publish video and audio tracks
            await self.room.publish_track(source=self.video_source)
            await self.room.publish_track(source=self.audio_source)
            logger.info("Publishing tracks...")

        except Exception as e:
            logger.error(f"Error connecting to room: {e}")
            raise

    async def disconnect(self):
        if self.room:
            await self.room.disconnect()
            logger.info("Disconnected from room")

    async def run(self):
        while True:
            try:
                await self.setup_sources()
                await self.connect()
                
                # Keep the connection alive
                while True:
                    await self.room.ready()
                    await rtc.sleep(1)

            except Exception as e:
                logger.error(f"Connection error: {e}")
                await self.disconnect()
                logger.info("Waiting 5 seconds before reconnecting...")
                await rtc.sleep(5)

if __name__ == "__main__":
    streamer = ClassroomStreamer()
    rtc.run(streamer.run())
