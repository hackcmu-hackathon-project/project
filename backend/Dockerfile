FROM python:3.13-slim

WORKDIR /app

# Dependencies first so edits to the source don't invalidate the layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000 ENV=production
EXPOSE 8000

# Single worker: the ranking sessions live in Mongo, so scale out with replicas.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
