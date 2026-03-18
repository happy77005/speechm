# --- Stage 1: Build Frontend ---
FROM node:20-slim AS build-stage
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Final Backend ---
FROM python:3.10-slim

# Install system dependencies
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libharfbuzz-dev \
    gcc \
    python3-dev \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -u 1000 user

# Set up the application directory
WORKDIR /app
RUN chown -R user:user /app

# Switch to the non-root user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Create fonts directory and download Noto Sans fonts
RUN mkdir -p fonts && \
    wget -O fonts/NotoSans-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf" && \
    wget -O fonts/NotoSansDevanagari-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf" && \
    wget -O fonts/NotoSansTelugu-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTelugu/NotoSansTelugu-Regular.ttf" && \
    wget -O fonts/NotoSansTamil-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf" && \
    wget -O fonts/NotoSansKannada-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKannada/NotoSansKannada-Regular.ttf" && \
    wget -O fonts/NotoSansMalayalam-Regular.ttf "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansMalayalam/NotoSansMalayalam-Regular.ttf"

# Copy backend requirements and install
COPY --chown=user backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the built frontend from Stage 1 to the 'static' folder
COPY --from=build-stage --chown=user /frontend/dist ./static

# Copy the backend code
COPY --chown=user backend/app.py .

# Expose the port used by Hugging Face Spaces
EXPOSE 7860

# Command to run the application
CMD ["python", "app.py"]
