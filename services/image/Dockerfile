FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir flask Pillow gunicorn
COPY server.py .
EXPOSE 5002
CMD ["gunicorn", "--bind", "0.0.0.0:5002", "--timeout", "120", "server:app"]
