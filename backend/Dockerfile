# Built from the repository root, because that is what Railway uploads:
#   RAILWAY_DOCKERFILE_PATH=backend/Dockerfile
FROM python:3.13-slim

WORKDIR /app

# Dependencies first so edits to the source don't invalidate the layer.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV PORT=8000 ENV=production
EXPOSE 8000

# Seeds an empty database, then serves. Single worker: ranking sessions live in
# Mongo, so scale out with replicas rather than threads.
CMD ["./entrypoint.sh"]
