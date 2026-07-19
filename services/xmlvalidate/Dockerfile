FROM python:3.12-slim

# Java runtime for epubcheck (EPUB validation); lxml for JATS structure.
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-jre-headless curl unzip \
 && rm -rf /var/lib/apt/lists/*

ARG EPUBCHECK_VERSION=5.1.0
RUN curl -fsSL -o /tmp/epubcheck.zip \
      https://github.com/w3c/epubcheck/releases/download/v${EPUBCHECK_VERSION}/epubcheck-${EPUBCHECK_VERSION}.zip \
 && unzip -q /tmp/epubcheck.zip -d /opt \
 && mv /opt/epubcheck-${EPUBCHECK_VERSION} /opt/epubcheck \
 && rm /tmp/epubcheck.zip

WORKDIR /app
RUN pip install --no-cache-dir flask lxml gunicorn
COPY server.py .

EXPOSE 4300
CMD ["gunicorn", "--bind", "0.0.0.0:4300", "--timeout", "240", "server:app"]
