FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends pandoc && rm -rf /var/lib/apt/lists/*
RUN pip install flask gunicorn
WORKDIR /app
COPY server.py .
EXPOSE 4000
CMD ["gunicorn", "--bind", "0.0.0.0:4000", "--workers", "2", "--timeout", "120", "server:app"]
