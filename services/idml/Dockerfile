FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir flask lxml gunicorn

COPY server.py .

EXPOSE 4100

CMD ["gunicorn", "--bind", "0.0.0.0:4100", "--timeout", "120", "server:app"]
