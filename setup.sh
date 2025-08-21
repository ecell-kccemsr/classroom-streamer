#!/bin/bash

# A master setup script for the WebRTC Classroom Streaming project.
# This script will install all necessary dependencies for either a Server or a Classroom PC.

# --- Helper Functions ---
print_header() {
  echo "================================================="
  echo "  $1"
  echo "================================================="
}

install_docker() {
  if ! command -v docker &> /dev/null
  then
    print_header "Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "Docker installed successfully. You may need to log out and back in for changes to take effect."
  else
    echo "Docker is already installed."
  fi
}

# --- Setup Logic for Server ---
setup_server() {
  print_header "Setting up this machine as a Server"
  install_docker

  if ! command -v docker-compose &> /dev/null
  then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
  else
    echo "Docker Compose is already installed."
  fi

  cd server/

  if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "IMPORTANT: Please edit the 'server/.env' file now with your server's public IP and your secret keys."
    read -p "Press [Enter] to continue after editing..."
  fi

  echo "Starting all server containers (LiveKit, Token Server, Viewer)..."
  docker-compose up -d

  print_header "✅ Server setup complete!"
  echo "The system is now running."
}

# --- Setup Logic for Classroom PC ---
setup_classroom() {
  print_header "Setting up this machine as a Classroom PC"
  install_docker

  echo "Installing system dependencies (ffmpeg, pulseaudio)..."
  sudo apt-get update
  sudo apt-get install -y ffmpeg pulseaudio-utils

  cd streamer/

  if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "IMPORTANT: Please edit the 'streamer/.env' file now with this classroom's specific details (Room Name, RTSP URL, Mic Device)."
    read -p "Press [Enter] to continue after editing..."
  fi

  echo "Building the streamer Docker image..."
  docker build -t classroom-streamer .

  echo "Starting the streamer container..."
  # This command runs the container, passing the .env file for configuration
  # and giving it access to the host's audio system.
  docker run -d --restart always \
    --env-file .env \
    -v /run/user/$(id -u)/pulse:/run/user/1000/pulse \
    -v ~/.config/pulse/cookie:/home/docker/.config/pulse/cookie \
    --name classroom-streamer-container \
    classroom-streamer

  print_header "✅ Classroom Streamer setup complete!"
  echo "The streamer is now running and connected to the server."
}


# --- Main Script ---
clear
print_header "Classroom Streaming System Setup"
echo "This script will configure your machine. Please choose its role."

PS3="Select the role for this PC: "
select role in "Server" "Classroom"; do
    case $role in
        Server )
            setup_server
            break
            ;;
        Classroom )
            setup_classroom
            break
            ;;
    esac
done

echo "Setup finished."