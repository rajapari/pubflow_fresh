FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir flask pikepdf gunicorn

COPY server.py .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 4200

CMD ["gunicorn", "--bind", "0.0.0.0:4200", "--timeout", "120", "server:app"]
