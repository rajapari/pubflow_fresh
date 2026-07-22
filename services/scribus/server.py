import base64, json, os, subprocess, tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB — templates + embedded assets

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'tool': 'scribus-headless'})

@app.route('/layout', methods=['POST'])
def layout():
    try:
        d = request.get_json(force=True)
        template_bytes = base64.b64decode(d.get('template',''))
        content_data   = json.loads(base64.b64decode(d.get('content','')))

        with tempfile.TemporaryDirectory() as tmp:
            sla  = os.path.join(tmp, 'template.sla')
            cont = os.path.join(tmp, 'content.json')
            out  = os.path.join(tmp, 'output.pdf')

            open(sla, 'wb').write(template_bytes)
            json.dump({'content': content_data, 'outputPath': out}, open(cont,'w'))

            env = os.environ.copy()
            env.update({
                'PUBFLOW_CONTENT_PATH': cont,
                'PUBFLOW_OUTPUT_PATH':  out,
                'DISPLAY': ':99',
            })

            xvfb = subprocess.Popen(['Xvfb',':99','-screen','0','1024x768x24'])
            try:
                r = subprocess.run(
                    ['scribus','--no-gui','--python-script','/app/scripts/layout.py', sla],
                    capture_output=True, text=True, timeout=240, env=env)
            finally:
                # terminate() alone leaves a zombie until something reaps
                # it — wait() collects the exit status; a hung Xvfb that
                # ignores SIGTERM gets a hard kill so this handler can't leak
                # a process per request.
                xvfb.terminate()
                try:
                    xvfb.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    xvfb.kill()
                    xvfb.wait()

            if not os.path.exists(out):
                return jsonify({'error': 'PDF not generated', 'log': r.stderr}), 500

            pdf_bytes = open(out,'rb').read()
            return jsonify({'pdf': base64.b64encode(pdf_bytes).decode()})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timed out'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
