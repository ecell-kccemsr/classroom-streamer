const TOKEN_SERVER = "http://localhost:5000/token";
const LIVEKIT_URL = "ws://localhost:7880";
const API_BASE = "http://localhost:5000";

// Configuration for the classrooms
const CLASSROOMS = Array.from({ length: 26 }, (_, i) => ({
  id: `classroom${i + 101}`,
  name: `Room ${i + 101}`,
  status: "OFFLINE",
  recording: false,
  egressId: null,
}));

// Store room connections
const roomConnections = new Map();
let activeRoom = null;
let mediaRecorder = null;
let recordedChunks = [];

// Initialize the UI
function initializeUI() {
  const container = document.getElementById("classrooms");

  CLASSROOMS.forEach((classroom) => {
    const card = document.createElement("div");
    card.className = "bg-white p-4 rounded-lg shadow";
    card.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h3 class="font-bold">${classroom.name}</h3>
                <span id="status-${classroom.id}" class="inline-block w-3 h-3 rounded-full bg-red-500"></span>
            </div>
            <div class="flex gap-2">
                <button id="view-${classroom.id}" 
                        class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onclick="viewClassroom('${classroom.id}', '${classroom.name}')">
                    View
                </button>
                <button id="record-${classroom.id}"
                        class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
                        onclick="toggleServerRecording('${classroom.id}')">
                    Record on Server
                </button>
            </div>
        `;
    container.appendChild(card);
  });
}

// Get token from server
async function getToken(roomName, identity) {
  const response = await fetch(TOKEN_SERVER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, identity }),
  });
  const data = await response.json();
  return data.token;
}

// Monitor room status
async function monitorRoom(classroom) {
  try {
    const token = await getToken(classroom.id, "monitor");
    const room = new LiveKit.Room();

    room.on(LiveKit.RoomEvent.ParticipantConnected, () => {
      updateStatus(classroom.id, "LIVE");
    });

    room.on(LiveKit.RoomEvent.ParticipantDisconnected, () => {
      updateStatus(classroom.id, "OFFLINE");
    });

    await room.connect(LIVEKIT_URL, token, {
      autoSubscribe: false,
    });

    roomConnections.set(classroom.id, room);
  } catch (error) {
    console.error(`Error monitoring ${classroom.id}:`, error);
  }
}

// Update status indicator
function updateStatus(classroomId, status) {
  const statusElement = document.getElementById(`status-${classroomId}`);
  statusElement.className = `inline-block w-3 h-3 rounded-full ${
    status === "LIVE" ? "bg-green-500" : "bg-red-500"
  }`;
}

// View classroom video
async function viewClassroom(classroomId, name) {
  if (activeRoom) {
    await activeRoom.disconnect();
  }

  try {
    const token = await getToken(classroomId, "viewer");
    const room = new LiveKit.Room();

    const tracks = {
      video: null,
      audio: null,
    };

    room.on(
      LiveKit.RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        if (track.kind === "video") {
          const element = track.attach();
          document.getElementById("videoPlayer").replaceChildren(element);
          tracks.video = track;
        } else if (track.kind === "audio") {
          track.attach();
          tracks.audio = track;
        }

        // If we have both tracks, create the MediaStream for recording
        if (tracks.video && tracks.audio) {
          const mediaStream = new MediaStream([
            tracks.video.mediaStreamTrack,
            tracks.audio.mediaStreamTrack,
          ]);
          setupMediaRecorder(mediaStream);
        }
      }
    );

    await room.connect(LIVEKIT_URL, token);
    activeRoom = room;

    document.getElementById("modalTitle").textContent = name;
    document.getElementById("videoModal").classList.remove("hidden");
  } catch (error) {
    console.error("Error viewing classroom:", error);
    alert("Error connecting to classroom stream");
  }
}

// Setup MediaRecorder
function setupMediaRecorder(mediaStream) {
  const options = { mimeType: "video/webm;codecs=vp8,opus" };
  mediaRecorder = new MediaRecorder(mediaStream, options);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    recordedChunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href = url;
    a.download = `classroom-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Setup recording button listeners
  const startButton = document.getElementById("start-record-btn");
  const stopButton = document.getElementById("stop-record-btn");

  startButton.onclick = () => {
    mediaRecorder.start();
    startButton.classList.add("hidden");
    stopButton.classList.remove("hidden");
  };

  stopButton.onclick = () => {
    mediaRecorder.stop();
    stopButton.classList.add("hidden");
    startButton.classList.remove("hidden");
  };
}

// Server-side recording functions
async function startServerRecording(roomName) {
  try {
    const response = await fetch(`${API_BASE}/start-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName }),
    });

    if (!response.ok) {
      throw new Error("Failed to start recording");
    }

    const data = await response.json();
    return data.egressId;
  } catch (error) {
    console.error("Error starting server recording:", error);
    throw error;
  }
}

async function stopServerRecording(egressId) {
  try {
    const response = await fetch(`${API_BASE}/stop-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ egressId }),
    });

    if (!response.ok) {
      throw new Error("Failed to stop recording");
    }

    return await response.json();
  } catch (error) {
    console.error("Error stopping server recording:", error);
    throw error;
  }
}

async function toggleServerRecording(classroomId) {
  const classroom = CLASSROOMS.find((c) => c.id === classroomId);
  const recordButton = document.getElementById(`record-${classroomId}`);

  if (!classroom) return;

  try {
    if (!classroom.recording) {
      // Start recording
      const egressId = await startServerRecording(classroom.id);
      classroom.recording = true;
      classroom.egressId = egressId;
      recordButton.textContent = "Stop Recording";
      recordButton.classList.remove("bg-purple-500", "hover:bg-purple-600");
      recordButton.classList.add("bg-red-500", "hover:bg-red-600");
    } else {
      // Stop recording
      await stopServerRecording(classroom.egressId);
      classroom.recording = false;
      classroom.egressId = null;
      recordButton.textContent = "Record on Server";
      recordButton.classList.remove("bg-red-500", "hover:bg-red-600");
      recordButton.classList.add("bg-purple-500", "hover:bg-purple-600");
    }
  } catch (error) {
    alert(
      `Recording ${classroom.recording ? "stop" : "start"} failed: ${
        error.message
      }`
    );
  }
}

// Close video modal
function closeVideo() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  recordedChunks = [];

  if (activeRoom) {
    activeRoom.disconnect();
    activeRoom = null;
  }
  document.getElementById("videoModal").classList.add("hidden");
  document.getElementById("videoPlayer").innerHTML = "";

  // Reset recording buttons
  document.getElementById("stop-record-btn").classList.add("hidden");
  document.getElementById("start-record-btn").classList.remove("hidden");
}

// Initialize when page loads
window.addEventListener("load", () => {
  initializeUI();
  CLASSROOMS.forEach((classroom) => monitorRoom(classroom));
});
