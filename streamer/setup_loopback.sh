#!/bin/bash

# This script automates the setup of a persistent audio loopback
# for the lecturer's microphone on a classroom PC.

# --- Configuration ---
# Get the absolute path to the current user's home directory
USER_HOME=$(eval echo ~$SUDO_USER)
if [ -z "$USER_HOME" ]; then
    USER_HOME=$HOME
fi

LOOPBACK_SCRIPT_PATH="$USER_HOME/start_loopback.sh"
SERVICE_DIR="$USER_HOME/.config/systemd/user"
SERVICE_FILE_PATH="$SERVICE_DIR/audio-loopback.service"

# --- Main Logic ---
echo "🔊 Setting up automatic microphone loopback..."

# Step 1: Create the loopback script that will be run on login
echo "Creating the loopback script at $LOOPBACK_SCRIPT_PATH..."
cat > "$LOOPBACK_SCRIPT_PATH" << EOL
#!/bin/bash
# Wait for the audio system to initialize
sleep 5
# Start the loopback if it's not already running
if ! pactl list short modules | grep -q "module-loopback"; then
  echo "Starting audio loopback with 1ms latency..."
  pactl load-module module-loopback latency_msec=1
fi
EOL

# Step 2: Make the loopback script executable
echo "Making the script executable..."
chmod +x "$LOOPBACK_SCRIPT_PATH"

# Step 3: Create the systemd service file to run the script on login
echo "Creating the systemd user service file..."
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_FILE_PATH" << EOL
[Unit]
Description=PulseAudio Mic Loopback Service
After=pulseaudio.service

[Service]
ExecStart=$LOOPBACK_SCRIPT_PATH
Restart=on-failure

[Install]
WantedBy=default.target
EOL

# Step 4: Enable the new service for the current user
echo "Enabling the service to run on login..."
systemctl --user enable audio-loopback.service

# Step 5: Start the service now for the current session
echo "Starting the loopback for the current session..."
systemctl --user start audio-loopback.service

echo ""
echo "✅ Success! The microphone loopback is now active and will start automatically every time you log in."