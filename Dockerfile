FROM python:3.13-slim

WORKDIR /app

# Copy application code and database
COPY . /app

# Ensure SQLite database file and directory permissions
RUN chmod -R 777 /app

EXPOSE 3000

ENV PORT=3000

CMD ["python", "server.py"]
