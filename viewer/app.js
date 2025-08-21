const TOKEN_SERVER = "http://localhost:5000/token";
const LIVEKIT_URL = "ws://localhost:7880";

// Configuration for the classrooms
const CLASSROOMS = Array.from({ length: 26 }, (_, i) => ({
  id: `classroom${i + 101}`,
  name: `Room ${i + 101}`,
  status: "OFFLINE",
}));

// Store room connections
const roomConnections = new Map();
let activeRoom = null;

// Initialize the UI
function initializeUI() {
  const container = document.getElementById("classrooms");

  CLASSROOMS.forEach((classroom) => {
    const card = document.createElement("div");
    card.className = "bg-white p-4 rounded-lg shadow";
    card.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="font-bold">${classroom.name}</h3>
                <span id="status-${classroom.id}" class="inline-block w-3 h-3 rounded-full bg-red-500"></span>
            </div>
            <button id="view-${classroom.id}" 
                    class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full"
                    onclick="viewClassroom('${classroom.id}', '${classroom.name}')">
                View
            </button>
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

    room.on(
      LiveKit.RoomEvent.TrackSubscribed,
      (track, publication, participant) => {
        if (track.kind === "video") {
          const element = track.attach();
          document.getElementById("videoPlayer").replaceChildren(element);
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

// Close video modal
function closeVideo() {
  if (activeRoom) {
    activeRoom.disconnect();
    activeRoom = null;
  }
  document.getElementById("videoModal").classList.add("hidden");
  document.getElementById("videoPlayer").innerHTML = "";
}

// Initialize when page loads
window.addEventListener("load", () => {
  initializeUI();
  CLASSROOMS.forEach((classroom) => monitorRoom(classroom));
});
