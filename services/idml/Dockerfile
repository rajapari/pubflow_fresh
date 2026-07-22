FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir flask lxml gunicorn

COPY server.py .

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 4100

CMD ["gunicorn", "--bind", "0.0.0.0:4100", "--timeout", "120", "server:app"]
