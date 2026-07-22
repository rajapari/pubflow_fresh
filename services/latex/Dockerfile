FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-xetex texlive-fonts-recommended texlive-lang-all \
    python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install flask gunicorn --break-system-packages
WORKDIR /app
COPY server.py .
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "300", "server:app"]
